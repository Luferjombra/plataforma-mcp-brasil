"""
Sorteio de novos fundos de referência (CVM) -- ferramenta de decisão, não
ETL de produção. Só leitura + print; não grava nada no Supabase.

Contexto: a plataforma cobria só 3 categorias ANBIMA (Multimercado, Ações,
Renda Fixa) via 8 fundos escolhidos manualmente (CNPJS_ALVO). Em vez de
escolher mais fundos manualmente, este script sorteia candidatos reais do
cadastro completo da CVM dentro das categorias que o etl/fundos.py consegue
alcançar (Cambial, reforço de Ações/Multimercado/Renda Fixa) -- FII,
Previdência e ETF ficam de fora porque não fazem parte do universo "FI" da
CVM (inf_diario_fi) que esse ETL processa.

Achado desta sessão (investigar_cvm_175.py): o pool de candidatos rodava em
cima de cad_fi.csv, que só cobre "Fundos de Investimento - Não Adaptados
RCVM175" -- um universo legado cada vez menor (só 22 candidatos disponíveis
na prática). O cadastro novo pós-Resolução 175 (registro_fundo.csv +
registro_classe.csv, dentro de registro_fundo_classe.zip) tem um universo
muito maior (~36 mil classes) e é onde a maioria dos fundos já migrou.
carregar_candidatos() agora lê daí -- join classe+fundo por
ID_Registro_Fundo (Gestor só existe no nível fundo). O PL continua vindo do
informe diário (carregar_pl_recente(), mais fresco que o
Patrimonio_Liquido embutido no cadastro, que numa amostra estava ~6 semanas
desatualizado) -- só precisou normalizar CNPJ pros dois lados baterem
(registro_classe.csv usa CNPJ_Classe sem pontuação, informe diário usa
CNPJ_FUNDO_CLASSE pontuado).

Incerteza real, não escondida: não confirmei os valores reais da coluna
Classificacao pra fundos comuns (não-FII) -- as únicas amostras vistas até
agora eram de classes FII com Classificacao vazia. sortear() imprime a
distribuição de Classificacao antes de aplicar os termos de CATEGORIAS_ALVO;
se os termos abaixo não baterem com os valores reais, vai aparecer 0
candidatos em toda categoria (não só numa) -- sinal de que os termos
precisam de ajuste, a conferir no primeiro dispatch real.

Critério de qualidade antes do sorteio, não depois:
  - situação = "Em Funcionamento Normal" (exclui fundo em liquidação)
  - patrimônio líquido >= PL_MINIMO (evita fundo residual/quase inativo)
  - ainda não em CNPJS_ALVO
Sorteio com seed fixa (reprodutível se os dados de entrada não mudarem --
não é escolha manual, mas também não é ruído puro a cada execução).

Saída: só imprime os candidatos escolhidos (CNPJ, nome, classe, gestor, PL)
para revisão humana antes de entrarem em CNPJS_ALVO manualmente (o mesmo
padrão de curadoria já usado nos 8 fundos atuais).

Uso: python sortear_fundos.py
"""

import os
import random
import zipfile

import httpx
import pandas as pd

from fundos import (
    CNPJS_ALVO,
    DATA_DIR,
    DEFAULT_USER_AGENT,
    garantir_historico_local,
    ler_arquivo_mensal,
    listar_arquivos_historico,
)
from log_etl import baixar_arquivo_http

PL_MINIMO = 10_000_000  # R$10M -- piso de relevância, não de "melhor fundo"
SEED = 20260708  # data da decisão -- reprodutível, não é escolha manual

URL_REGISTRO_ZIP = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip"

CATEGORIAS_ALVO = {
    "Cambial":       ["CAMBIAL"],
    "Ações":         ["AÇÕES", "ACOES"],
    "Multimercado":  ["MULTIMERCADO"],
    "Renda Fixa":    ["RENDA FIXA"],
}
# Crédito Privado não é uma CLASSE própria da CVM (essa é uma
# sub-classificação ANBIMA) -- aproximação: Renda Fixa cujo nome sinaliza a
# estratégia. Pode não achar nenhum candidato; nesse caso o script reporta
# 0, não força um resultado.
TERMOS_CREDITO_PRIVADO = ["CRÉDITO PRIVADO", "CREDITO PRIVADO", "DEBENTURE", "DEBÊNTURE"]


def normalizar_cnpj(cnpj: str) -> str:
    """Só dígitos -- registro_classe.csv usa CNPJ_Classe sem pontuação
    ("00016999000167"), o informe diário (fonte do PL) usa CNPJ_FUNDO_CLASSE
    pontuado ("00.016.999/0001-67"). Mesmo achado/abordagem de
    investigar_cvm_175.py::normalizar_cnpj."""
    return "".join(c for c in str(cnpj) if c.isdigit())


def garantir_registro_novo_local(client: httpx.Client) -> None:
    """Baixa registro_fundo_classe.zip (cadastro pós-RCVM175: fundo/classe/
    subclasse) se ainda não existir localmente -- universo de candidatos bem
    maior que cad_fi.csv (ver docstring do módulo)."""
    caminho = os.path.join(DATA_DIR, "registro_fundo_classe.zip")
    if os.path.exists(caminho):
        return
    print("→ Baixando cadastro novo CVM (registro_fundo_classe.zip)...")
    conteudo = baixar_arquivo_http(
        URL_REGISTRO_ZIP, client,
        user_agent=DEFAULT_USER_AGENT, max_attempts=3, timeout=60,
        msg_falha="  ✗ Falha ao baixar registro_fundo_classe.zip após 3 tentativas.",
    )
    if conteudo:
        with open(caminho, "wb") as f:
            f.write(conteudo)
        print(f"  ✓ registro_fundo_classe.zip salvo ({len(conteudo)} bytes)\n")


def carregar_pl_recente() -> dict[str, float]:
    """PL mais recente por CNPJ a partir dos informes diários já baixados
    (mês corrente + anterior, .csv ou .zip -- a CVM passou a publicar em
    .zip a partir de jul/2025, ver fundos.py::garantir_historico_local) --
    não baixa nada além disso.

    Vetorizado de propósito: ao contrário de fundos.py (que filtra pelos 8
    CNPJs alvo antes de processar linha a linha), este script olha o
    cadastro CVM INTEIRO -- um único mês de inf_diario_fi cobre ~30 mil
    fundos, centenas de milhares de linhas. Achado de produção: a primeira
    versão usava `.iterrows()` (a mesma lógica de fundos.py, copiada sem
    ajustar pra escala) e travou >8min num dispatch real antes de ser
    cancelada -- reescrito com operações nativas do pandas."""
    frames = []
    for caminho in listar_arquivos_historico():
        try:
            df = ler_arquivo_mensal(caminho)
        except Exception as e:
            print(f"  ⚠ Erro ao ler {os.path.basename(caminho)}: {e}")
            continue
        frames.append(df[["CNPJ_FUNDO", "DT_COMPTC", "VL_PATRIM_LIQ"]].rename(columns={"CNPJ_FUNDO": "cnpj"}))

    if not frames:
        return {}

    todos = pd.concat(frames, ignore_index=True)
    # Normaliza aqui pra bater com o CNPJ_Classe (sem pontuação) de
    # registro_classe.csv, usado por carregar_candidatos() -- ver
    # docstring do módulo.
    todos["cnpj"] = todos["cnpj"].str.strip().apply(normalizar_cnpj)
    todos["pl"] = pd.to_numeric(todos["VL_PATRIM_LIQ"].str.replace(",", ".", regex=False), errors="coerce")
    todos = todos.dropna(subset=["cnpj", "pl", "DT_COMPTC"])
    todos = todos.sort_values("DT_COMPTC")
    ultimo_por_cnpj = todos.drop_duplicates(subset=["cnpj"], keep="last")
    return dict(zip(ultimo_por_cnpj["cnpj"], ultimo_por_cnpj["pl"]))


def carregar_candidatos() -> pd.DataFrame:
    """Lê registro_classe.csv (universo de classes pós-RCVM175, ver docstring
    do módulo) + registro_fundo.csv (só pra trazer Gestor, que é atributo do
    fundo, não da classe) via join por ID_Registro_Fundo."""
    caminho_zip = os.path.join(DATA_DIR, "registro_fundo_classe.zip")
    with zipfile.ZipFile(caminho_zip) as zf:
        with zf.open("registro_classe.csv") as f:
            df = pd.read_csv(f, sep=";", dtype=str, low_memory=False, encoding="latin-1")
        with zf.open("registro_fundo.csv") as f:
            df_fundo = pd.read_csv(f, sep=";", dtype=str, low_memory=False, encoding="latin-1")

    df.columns = [c.strip() for c in df.columns]
    df_fundo.columns = [c.strip() for c in df_fundo.columns]
    # Achado de revisão: sem isso, um ID_Registro_Fundo duplicado em
    # registro_fundo.csv infla o merge (left join duplica a linha de classe
    # por cada match extra) -- sem warning nenhum do pandas. Devia ser 1:1,
    # mas a proteção custa uma linha.
    df_fundo = df_fundo.drop_duplicates(subset=["ID_Registro_Fundo"])

    df = df.merge(df_fundo[["ID_Registro_Fundo", "Gestor"]], on="ID_Registro_Fundo", how="left")
    df = df.rename(columns={
        "CNPJ_Classe": "CNPJ_FUNDO",
        "Denominacao_Social": "DENOM_SOCIAL",
        "Classificacao": "CLASSE",
        "Situacao": "SIT",
        "Gestor": "GESTOR",
    })
    # Achado de revisão: rename() ignora chaves ausentes em silêncio -- se
    # registro_classe.csv algum dia ganhar sua própria coluna "Gestor", o
    # merge geraria Gestor_x/Gestor_y (nenhuma literalmente "Gestor") e
    # GESTOR nunca seria criada, indistinguível de "coluna realmente
    # ausente" (todo fundo sairia com "N/D", sem erro). Crash explícito é
    # melhor que mascarar.
    assert "GESTOR" in df.columns, "coluna GESTOR não foi criada pelo rename -- schema de registro_fundo.csv mudou?"

    ja_rastreados = {normalizar_cnpj(c) for c in CNPJS_ALVO}
    df = df[~df["CNPJ_FUNDO"].apply(normalizar_cnpj).isin(ja_rastreados)]
    df = df[df["SIT"] == "Em Funcionamento Normal"]
    return df


def _elegiveis(df: pd.DataFrame, mask: pd.Series, pl_por_cnpj: dict[str, float]) -> pd.DataFrame:
    cands = df[mask].copy()
    cands["pl"] = cands["CNPJ_FUNDO"].apply(normalizar_cnpj).map(pl_por_cnpj)
    return cands[cands["pl"] >= PL_MINIMO]


def _linha_para_dict(linha: pd.Series, tamanho_pool: int) -> dict:
    return {
        "cnpj": linha["CNPJ_FUNDO"],
        "nome": linha.get("DENOM_SOCIAL", "N/D"),
        "classe": linha.get("CLASSE", "N/D"),
        "gestor": linha.get("GESTOR", "N/D"),
        "pl": linha["pl"],
        "candidatos_no_pool": tamanho_pool,
    }


def sortear(df: pd.DataFrame, pl_por_cnpj: dict[str, float]) -> dict[str, dict]:
    random.seed(SEED)
    escolhidos = {}

    classe_upper = df["CLASSE"].fillna("").str.upper()
    nome_upper = df["DENOM_SOCIAL"].fillna("").str.upper()

    # Diagnóstico: não confirmamos ainda os valores reais de Classificacao
    # pra fundos comuns (só vimos amostra de classe FII, com o campo vazio)
    # -- ver docstring do módulo. Se os termos de CATEGORIAS_ALVO abaixo não
    # baterem com os valores reais, aparece 0 em TODA categoria (não só
    # numa), e essa distribuição aqui mostra o que precisa ajustar.
    nao_vazias = classe_upper[classe_upper != ""]
    print(f"  [diagnóstico] {len(nao_vazias)}/{len(df)} classe(s) com Classificacao não-vazia")
    print(f"  [diagnóstico] top 15 valores de Classificacao:\n{nao_vazias.value_counts().head(15).to_string()}\n")

    for categoria, termos in CATEGORIAS_ALVO.items():
        mask = classe_upper.apply(lambda c, termos=termos: any(t in c for t in termos))
        # Achado de revisão: "0 candidatos" tem 2 causas raiz bem diferentes
        # -- termo de Classificacao não bate com nenhum valor real (0 na
        # máscara, antes até olhar PL) vs. fundos existem mas são pequenos
        # demais (máscara não-vazia, cortados pelo filtro de PL). Misturar
        # as duas na mesma mensagem ("PL >= R$...") empurra quem for
        # debugar pro caminho errado quando o problema é nomenclatura.
        if mask.sum() == 0:
            print(f"  ⚠ {categoria}: 0 fundo(s) com Classificacao contendo {termos} -- possível mismatch de nomenclatura, ver diagnóstico acima")
            continue
        cands = _elegiveis(df, mask, pl_por_cnpj)
        if cands.empty:
            print(f"  ⚠ {categoria}: {mask.sum()} fundo(s) na classificação, mas nenhum elegível (PL >= R${PL_MINIMO:,.0f})")
            continue
        linha = cands.sample(n=1, random_state=random.randint(0, 2**31 - 1)).iloc[0]
        escolhidos[categoria] = _linha_para_dict(linha, len(cands))

    mask_credito = classe_upper.str.contains("RENDA FIXA") & nome_upper.apply(
        lambda n: any(t.upper() in n for t in TERMOS_CREDITO_PRIVADO)
    )
    cands_credito = _elegiveis(df, mask_credito, pl_por_cnpj)
    if mask_credito.sum() == 0:
        print("  ⚠ Crédito Privado (aproximado por nome): 0 fundo(s) de Renda Fixa com nome batendo os termos -- possível mismatch de nomenclatura")
    elif cands_credito.empty:
        print(f"  ⚠ Crédito Privado (aproximado por nome): {mask_credito.sum()} fundo(s) batem o nome, mas nenhum elegível (PL >= R${PL_MINIMO:,.0f})")
    else:
        linha = cands_credito.sample(n=1, random_state=random.randint(0, 2**31 - 1)).iloc[0]
        escolhidos["Crédito Privado (aproximado)"] = _linha_para_dict(linha, len(cands_credito))

    return escolhidos


def run():
    print("=== Sorteio de novos fundos de referência (CVM) ===\n")
    os.makedirs(DATA_DIR, exist_ok=True)

    with httpx.Client() as client:
        garantir_registro_novo_local(client)
        garantir_historico_local(client)

    pl_por_cnpj = carregar_pl_recente()
    print(f"→ PL recente conhecido para {len(pl_por_cnpj)} fundo(s) (a partir dos informes já baixados)\n")

    df = carregar_candidatos()
    print(f"→ {len(df)} fundo(s) candidato(s) (ativos, ainda não rastreados)\n")

    escolhidos = sortear(df, pl_por_cnpj)

    print("\n=== RESULTADO DO SORTEIO (revisar antes de adicionar a CNPJS_ALVO) ===")
    if not escolhidos:
        print("Nenhum fundo sorteado -- revisar critérios (PL mínimo, categorias, dados baixados).")
        return

    for categoria, info in escolhidos.items():
        print(f"\n{categoria}:")
        for chave, valor in info.items():
            print(f"  {chave}: {valor}")


if __name__ == "__main__":
    run()
