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

Critério de qualidade antes do sorteio, não depois:
  - situação = "EM FUNCIONAMENTO NORMAL" (exclui fundo em liquidação)
  - patrimônio líquido >= PL_MINIMO (evita fundo residual/quase inativo)
  - ainda não em CNPJS_ALVO
Sorteio com seed fixa (reprodutível se os dados de entrada não mudarem --
não é escolha manual, mas também não é ruído puro a cada execução).

Saída: só imprime os candidatos escolhidos (CNPJ, nome, classe, gestor, PL)
para revisão humana antes de entrarem em CNPJS_ALVO manualmente (o mesmo
padrão de curadoria já usado nos 8 fundos atuais).

Uso: python sortear_fundos.py
"""

import glob
import os
import random

import httpx
import pandas as pd

from fundos import (
    CNPJS_ALVO,
    DATA_DIR,
    garantir_cadastro_local,
    garantir_historico_local,
)

PL_MINIMO = 10_000_000  # R$10M -- piso de relevância, não de "melhor fundo"
SEED = 20260708  # data da decisão -- reprodutível, não é escolha manual

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


def carregar_pl_recente() -> dict[str, float]:
    """PL mais recente por CNPJ a partir dos inf_diario_fi_*.csv já
    baixados (mês corrente + anterior) -- não baixa nada além disso.

    Vetorizado de propósito: ao contrário de fundos.py (que filtra pelos 8
    CNPJs alvo antes de processar linha a linha), este script olha o
    cadastro CVM INTEIRO -- um único mês de inf_diario_fi cobre ~30 mil
    fundos, centenas de milhares de linhas. Achado de produção: a primeira
    versão usava `.iterrows()` (a mesma lógica de fundos.py, copiada sem
    ajustar pra escala) e travou >8min num dispatch real antes de ser
    cancelada -- reescrito com operações nativas do pandas."""
    frames = []
    for caminho in glob.glob(os.path.join(DATA_DIR, "inf_diario_fi_*.csv")):
        df = pd.read_csv(caminho, sep=";", dtype=str, low_memory=False, encoding="latin-1")
        df.columns = [c.strip() for c in df.columns]
        col_cnpj = "CNPJ_FUNDO_CLASSE" if "CNPJ_FUNDO_CLASSE" in df.columns else "CNPJ_FUNDO"
        frames.append(df[[col_cnpj, "DT_COMPTC", "VL_PATRIM_LIQ"]].rename(columns={col_cnpj: "cnpj"}))

    if not frames:
        return {}

    todos = pd.concat(frames, ignore_index=True)
    todos["cnpj"] = todos["cnpj"].str.strip()
    todos["pl"] = pd.to_numeric(todos["VL_PATRIM_LIQ"].str.replace(",", ".", regex=False), errors="coerce")
    todos = todos.dropna(subset=["cnpj", "pl", "DT_COMPTC"])
    todos = todos.sort_values("DT_COMPTC")
    ultimo_por_cnpj = todos.drop_duplicates(subset=["cnpj"], keep="last")
    return dict(zip(ultimo_por_cnpj["cnpj"], ultimo_por_cnpj["pl"]))


def carregar_candidatos() -> pd.DataFrame:
    caminho = os.path.join(DATA_DIR, "cad_fi.csv")
    df = pd.read_csv(caminho, sep=";", dtype=str, low_memory=False, encoding="latin-1")
    df.columns = [c.strip() for c in df.columns]
    ja_rastreados = {c.strip() for c in CNPJS_ALVO}
    df = df[~df["CNPJ_FUNDO"].isin(ja_rastreados)]
    df = df[df["SIT"] == "EM FUNCIONAMENTO NORMAL"]
    return df


def _elegiveis(df: pd.DataFrame, mask: pd.Series, pl_por_cnpj: dict[str, float]) -> pd.DataFrame:
    cands = df[mask].copy()
    cands["pl"] = cands["CNPJ_FUNDO"].map(pl_por_cnpj)
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

    for categoria, termos in CATEGORIAS_ALVO.items():
        mask = classe_upper.apply(lambda c, termos=termos: any(t in c for t in termos))
        cands = _elegiveis(df, mask, pl_por_cnpj)
        if cands.empty:
            print(f"  ⚠ {categoria}: nenhum candidato elegível (PL >= R${PL_MINIMO:,.0f})")
            continue
        linha = cands.sample(n=1, random_state=random.randint(0, 2**31 - 1)).iloc[0]
        escolhidos[categoria] = _linha_para_dict(linha, len(cands))

    mask_credito = classe_upper.str.contains("RENDA FIXA") & nome_upper.apply(
        lambda n: any(t.upper() in n for t in TERMOS_CREDITO_PRIVADO)
    )
    cands_credito = _elegiveis(df, mask_credito, pl_por_cnpj)
    if cands_credito.empty:
        print("  ⚠ Crédito Privado (aproximado por nome): nenhum candidato elegível")
    else:
        linha = cands_credito.sample(n=1, random_state=random.randint(0, 2**31 - 1)).iloc[0]
        escolhidos["Crédito Privado (aproximado)"] = _linha_para_dict(linha, len(cands_credito))

    return escolhidos


def run():
    print("=== Sorteio de novos fundos de referência (CVM) ===\n")
    os.makedirs(DATA_DIR, exist_ok=True)

    with httpx.Client() as client:
        garantir_cadastro_local(client)
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
