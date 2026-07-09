"""
ETL — Fundos de Investimento
Fonte: CVM (Comissão de Valores Mobiliários), portal de dados abertos.

O cadastro (cad_fi.csv) e os informes diários (inf_diario_fi_AAAAMM.zip) são
baixados automaticamente a cada execução -- necessário porque o runner do
GitHub Actions começa de um checkout limpo (etl/data/cvm/ só tem .gitkeep,
os CSVs estão no .gitignore por serem grandes demais para o repo). Rodar
localmente com os arquivos já em etl/data/cvm/ pula o download (usa o que
já está no disco).

Uso: python fundos.py
"""

import os
import glob
import time
import zipfile
import io
import datetime
import httpx
import pandas as pd
from config import supabase
from log_etl import ETLRun, log_partial, hoje_brt, baixar_arquivo_http, DEFAULT_USER_AGENT
from log_etl import safe_float as _safe_float_base

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "cvm")
URL_CADASTRO = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv"
URL_HISTORICO_BASE = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS"
URL_REGISTRO_ZIP = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip"

# Fundos de referência — CNPJs validados no cadastro CVM
# Preferência por feeders (o que o cotista acessa diretamente)
# ATENÇÃO: duplicado em backend/routes/fundos.py::CNPJS_ALVO (backend e ETL
# são deploys separados, sem import cruzado) -- atualizar as duas listas.
CNPJS_ALVO = [
    "04.222.368/0001-55",  # Verde PVT Multimercado FI Financeiro (CIC)
    "04.311.271/0001-19",  # PS Verde D1 FI Financeiro em Cotas
    "01.221.890/0001-24",  # CSHG Verde FIC FIM
    "03.536.908/0001-02",  # CSHG Verde AM Star FIC FIF - Ações Responsabi
    "26.324.289/0001-98",  # Kinea Infra I FIF FI Incentivado Debêntures
    "26.324.298/0001-89",  # Kinea Infra FIC de Fundos Incentivados Infra RF
    "00.947.958/0001-94",  # Opportunity Market FIC de Fundos FI Financeiro
    "05.775.774/0001-08",  # Alaska Poland FI em Ações
    # Sorteados via sortear_fundos.py (pool registro_fundo/classe.csv,
    # ~33 mil candidatos) -- expansão pra categorias Cambial/Crédito
    # Privado que a plataforma ainda não cobria.
    "00.822.954/0001-80",  # Itaú B Cambial FIF (Cambial)
    "54.379.670/0001-90",  # Capannori FI Ações (Ações)
    "63.433.149/0001-84",  # Splendore RV FIF Multimercado (Multimercado)
    "54.463.768/0001-20",  # Sofie Infra FI Renda Fixa (Renda Fixa)
    "60.760.008/0001-88",  # Bradesco BKFD RF Crédito Privado (Crédito Privado, aprox.)
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_str(value, max_len: int = None) -> str | None:
    """Converte valor para string, retornando None se vazio/NaN."""
    if value is None:
        return None
    s = str(value).strip()
    if s in ("", "nan", "NaN"):
        return None
    return s[:max_len] if max_len else s


def safe_numeric(value) -> float | None:
    """Converte valor numérico, retornando None se inválido/NaN."""
    return _safe_float_base(value, replace_comma=True)


def parse_date(value) -> str | None:
    """Converte data CVM (YYYY-MM-DD ou DD/MM/YYYY) para ISO."""
    if not value or str(value).strip() in ("", "nan", "NaN"):
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(str(value).strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def normalizar_cnpj(cnpj: str) -> str:
    """Só dígitos -- o cadastro novo (registro_fundo.csv/registro_classe.csv)
    guarda CNPJ sem pontuação ("00016999000167"), diferente do legado
    cad_fi.csv e de CNPJS_ALVO ("00.016.999/0001-67"). Mesmo achado/
    abordagem de investigar_cvm_175.py e sortear_fundos.py."""
    return "".join(c for c in str(cnpj) if c.isdigit())


# ---------------------------------------------------------------------------
# Download (CVM)
# ---------------------------------------------------------------------------

def meses_a_baixar() -> list[str]:
    """Mês corrente + anterior (formato AAAAMM). Cobre o caso do informe do
    mês corrente ainda não ter sido publicado pela CVM sem depender de
    estado entre execuções (CI é stateless -- não há como saber qual foi o
    último mês baixado)."""
    ref = hoje_brt().replace(day=1)
    meses = [ref.strftime("%Y%m")]
    ref_anterior = ref - datetime.timedelta(days=1)
    meses.append(ref_anterior.replace(day=1).strftime("%Y%m"))
    return meses


def garantir_cadastro_local(client: httpx.Client) -> None:
    """Baixa cad_fi.csv se ainda não existir localmente."""
    caminho = os.path.join(DATA_DIR, "cad_fi.csv")
    if os.path.exists(caminho):
        return
    print("→ Baixando cadastro CVM (cad_fi.csv)...")
    conteudo = baixar_arquivo_http(
        URL_CADASTRO, client,
        # cad_fi.csv cobre TODOS os fundos da CVM (dezenas de milhares de
        # linhas) -- dezenas de MB, timeout maior que os outros downloads.
        # not_found_status fica no default (404,), de propósito -- achado de
        # revisão: diferente de inf_diario_fi (arquivo datado, "ainda não
        # publicado" é um estado real), cad_fi.csv é o cadastro único e
        # canônico, sempre deveria existir. Um 403 aqui é provavelmente
        # WAF/rate-limit real, não "não publicado" -- tratar como
        # not-found silencioso mascararia isso sem nem esgotar as
        # tentativas de retry.
        user_agent=DEFAULT_USER_AGENT, max_attempts=3, timeout=180,
        msg_falha="  ✗ Falha ao baixar cad_fi.csv após 3 tentativas — cadastro não será atualizado nesta execução.",
    )
    if conteudo:
        with open(caminho, "wb") as f:
            f.write(conteudo)
        print(f"  ✓ cad_fi.csv salvo ({len(conteudo)} bytes)\n")


def garantir_registro_novo_local(client: httpx.Client) -> None:
    """Baixa registro_fundo_classe.zip (cadastro pós-RCVM175: fundo/classe/
    subclasse) se ainda não existir localmente -- necessário pra achar
    cadastro de CNPJS_ALVO que não constam em cad_fi.csv (cadastro legado,
    ver carregar_cadastro_novo). Achado em produção: sem isso, um CNPJ
    sorteado via sortear_fundos.py (que usa esse cadastro maior) entra em
    CNPJS_ALVO mas fica sem linha em fundos_cadastro -- e o upsert de
    fundos_historico inteiro falha por causa da foreign key
    fundos_historico_cnpj_fkey."""
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


def garantir_historico_local(client: httpx.Client) -> None:
    """Baixa os informes diários (mês corrente + anterior) se ainda não
    existirem localmente. A CVM passou a publicar em .zip a partir de
    jul/2025 (mesma URL base e convenção de nome do .csv legado, achado via
    API CKAN do portal -- package_show em fi-doc-inf_diario -- depois que o
    .csv direto passou a dar 403 pra todo mês testado)."""
    for aaaamm in meses_a_baixar():
        nome = f"inf_diario_fi_{aaaamm}.zip"
        caminho = os.path.join(DATA_DIR, nome)
        if os.path.exists(caminho):
            continue
        url = f"{URL_HISTORICO_BASE}/{nome}"
        print(f"→ Baixando {nome}...", end=" ")
        conteudo = baixar_arquivo_http(
            url, client,
            # 1 linha por fundo por pregão, todos os fundos da CVM --
            # também pode chegar a dezenas/centenas de MB por mês.
            # not_found_status inclui 403 -- ver comentário em
            # garantir_cadastro_local (mesmo bucket, mesmo comportamento).
            user_agent=DEFAULT_USER_AGENT, max_attempts=2, timeout=180,
            not_found_status=(404, 403),
            msg_404="ainda não publicado",
        )
        if conteudo:
            with open(caminho, "wb") as f:
                f.write(conteudo)
            print(f"{len(conteudo)} bytes salvos")
        else:
            print("pulando")


# ---------------------------------------------------------------------------
# Cadastro
# ---------------------------------------------------------------------------

def carregar_cadastro_novo(cnpjs_faltantes: list[str]) -> pd.DataFrame:
    """Monta linhas de cadastro (schema compatível com cad_fi.csv) a partir
    do cadastro novo (registro_fundo.csv + registro_classe.csv, dentro de
    registro_fundo_classe.zip) -- só pros CNPJS_ALVO que carregar_cadastro()
    não achou em cad_fi.csv (cadastro legado, "não adaptados RCVM175").
    CNPJ_Fundo em registro_fundo.csv é sem pontuação; usa o valor original de
    CNPJS_ALVO (pontuado) como cnpj final, pra bater com o que
    fundos_historico grava (vindo do informe diário, também pontuado)."""
    caminho_zip = os.path.join(DATA_DIR, "registro_fundo_classe.zip")
    with zipfile.ZipFile(caminho_zip) as zf:
        with zf.open("registro_fundo.csv") as f:
            df_fundo = pd.read_csv(f, sep=";", dtype=str, low_memory=False, encoding="latin-1")
        with zf.open("registro_classe.csv") as f:
            df_classe = pd.read_csv(f, sep=";", dtype=str, low_memory=False, encoding="latin-1")

    df_fundo.columns = [c.strip() for c in df_fundo.columns]
    df_classe.columns = [c.strip() for c in df_classe.columns]

    faltantes_norm = {normalizar_cnpj(c): c for c in cnpjs_faltantes}
    df_fundo["_cnpj_norm"] = df_fundo["CNPJ_Fundo"].apply(normalizar_cnpj)
    df = df_fundo[df_fundo["_cnpj_norm"].isin(faltantes_norm)].copy()

    # Classificacao é atributo de classe, não de fundo -- pega a 1a classe
    # não-vazia de cada fundo (funciona bem pros fundos simples/sem múltiplas
    # classes que passam pelo sorteio; ver CATEGORIAS_ALVO em sortear_fundos.py).
    classe_por_fundo = (
        df_classe[["ID_Registro_Fundo", "Classificacao"]]
        .dropna(subset=["Classificacao"])
        .drop_duplicates(subset=["ID_Registro_Fundo"], keep="first")
    )
    df = df.merge(classe_por_fundo, on="ID_Registro_Fundo", how="left")

    df["CNPJ_FUNDO"] = df["_cnpj_norm"].map(faltantes_norm)
    df = df.rename(columns={
        "Denominacao_Social": "DENOM_SOCIAL",
        "Classificacao": "CLASSE",
        "Gestor": "GESTOR",
        "Administrador": "ADMIN",
        "Tipo_Fundo": "TP_FUNDO",
        "Data_Constituicao": "DT_CONST",
    })
    # cad_fi.csv usa "EM FUNCIONAMENTO NORMAL" (maiúsculo); o cadastro novo
    # usa "Em Funcionamento Normal" -- normaliza aqui pra upsert_cadastro()
    # não precisar saber de qual fonte cada linha veio.
    df["SIT"] = df["Situacao"].fillna("").str.upper()
    return df


def carregar_cadastro() -> pd.DataFrame | None:
    """Lê cad_fi.csv local e filtra pelos CNPJs alvo. Pros CNPJs alvo que não
    aparecem em cad_fi.csv (cadastro legado, "não adaptados RCVM175") --
    caso dos fundos sorteados via sortear_fundos.py, que vêm do cadastro
    novo -- complementa com carregar_cadastro_novo() (ver docstring lá)."""
    caminho = os.path.join(DATA_DIR, "cad_fi.csv")
    if not os.path.exists(caminho):
        print("  ⚠ cad_fi.csv não encontrado em etl/data/cvm/ — pulando cadastro.")
        print("    Baixe em: https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv\n")
        return None

    print(f"→ Lendo cadastro: {caminho}")
    df = pd.read_csv(caminho, sep=";", dtype=str, low_memory=False, encoding="latin-1")
    df.columns = [c.strip() for c in df.columns]
    cnpjs_limpos = [c.strip() for c in CNPJS_ALVO]
    df = df[df["CNPJ_FUNDO"].isin(cnpjs_limpos)].copy()
    print(f"  ✓ {len(df)} fundo(s) encontrado(s) no cadastro legado (cad_fi.csv)\n")

    achados_norm = {normalizar_cnpj(c) for c in df["CNPJ_FUNDO"]}
    faltantes = [c for c in cnpjs_limpos if normalizar_cnpj(c) not in achados_norm]
    if faltantes:
        caminho_zip = os.path.join(DATA_DIR, "registro_fundo_classe.zip")
        if os.path.exists(caminho_zip):
            df_novo = carregar_cadastro_novo(faltantes)
            print(f"  ✓ {len(df_novo)}/{len(faltantes)} fundo(s) encontrado(s) no cadastro novo (registro_fundo_classe.zip)\n")
            df = pd.concat([df, df_novo], ignore_index=True)
        else:
            print(f"  ⚠ {len(faltantes)} fundo(s) não encontrados em cad_fi.csv, e registro_fundo_classe.zip não disponível localmente\n")

    return df


def upsert_cadastro(df: pd.DataFrame) -> None:
    """Insere/atualiza fundos_cadastro."""
    # Remove duplicatas pelo CNPJ (cad_fi pode ter linhas repetidas)
    df = df.drop_duplicates(subset=["CNPJ_FUNDO"], keep="first")
    registros = []
    for _, row in df.iterrows():
        registros.append({
            "cnpj":           safe_str(row.get("CNPJ_FUNDO")),
            "nome":           safe_str(row.get("DENOM_SOCIAL"), 200) or "N/D",
            "nome_abreviado": safe_str(row.get("NOME_FANTASIA"), 100),
            "classe_anbima":  safe_str(row.get("CLASSE"), 50),
            "gestor":         safe_str(row.get("GESTOR"), 100),
            "administrador":  safe_str(row.get("ADMIN"), 100),
            "tipo_fundo":     safe_str(row.get("TP_FUNDO"), 30),
            "data_inicio":    parse_date(row.get("DT_CONST")),
            "ativo":          safe_str(row.get("SIT")) == "EM FUNCIONAMENTO NORMAL",
        })

    if registros:
        supabase.table("fundos_cadastro").upsert(registros, on_conflict="cnpj").execute()
        print(f"  ✓ {len(registros)} fundos inseridos/atualizados no cadastro\n")


# ---------------------------------------------------------------------------
# Histórico mensal (arquivos locais)
# ---------------------------------------------------------------------------

def listar_arquivos_historico() -> list[str]:
    """Retorna lista ordenada de arquivos .csv e .zip de inf_diario_fi_* em DATA_DIR."""
    csvs = glob.glob(os.path.join(DATA_DIR, "inf_diario_fi_*.csv"))
    zips = glob.glob(os.path.join(DATA_DIR, "inf_diario_fi_*.zip"))
    return sorted(csvs + zips)


def _ler_csv_bytes(dados: bytes, nome: str) -> pd.DataFrame:
    """Lê bytes de um CSV CVM e retorna DataFrame."""
    df = pd.read_csv(
        io.BytesIO(dados),
        sep=";",
        dtype=str,
        low_memory=False,
        encoding="latin-1",
    )
    df.columns = [c.strip() for c in df.columns]
    return df


def ler_arquivo_mensal(caminho: str) -> pd.DataFrame:
    """Lê um arquivo mensal de informe diário (.csv ou .zip -- a CVM passou a
    publicar em .zip a partir de jul/2025, ver garantir_historico_local) e
    normaliza a coluna de CNPJ pro nome comum "CNPJ_FUNDO" (a CVM usa
    CNPJ_FUNDO_CLASSE no formato novo, CNPJ_FUNDO no antigo). Levanta exceção
    se o arquivo/CSV interno não puder ser lido -- quem chama decide como
    tratar (ver processar_arquivo e sortear_fundos.py::carregar_pl_recente)."""
    if caminho.endswith(".zip"):
        with zipfile.ZipFile(caminho) as zf:
            # Pega o primeiro CSV dentro do zip
            csvs_internos = [n for n in zf.namelist() if n.endswith(".csv")]
            if not csvs_internos:
                raise ValueError(f"nenhum CSV dentro de {os.path.basename(caminho)}")
            with zf.open(csvs_internos[0]) as f:
                df = _ler_csv_bytes(f.read(), csvs_internos[0])
    else:
        with open(caminho, "rb") as f:
            df = _ler_csv_bytes(f.read(), os.path.basename(caminho))

    col_cnpj = "CNPJ_FUNDO_CLASSE" if "CNPJ_FUNDO_CLASSE" in df.columns else "CNPJ_FUNDO"
    return df.rename(columns={col_cnpj: "CNPJ_FUNDO"})


def processar_arquivo(caminho: str, cnpjs: list[str]) -> pd.DataFrame | None:
    """Lê um arquivo mensal (.csv ou .zip) e filtra pelos CNPJs alvo."""
    try:
        df = ler_arquivo_mensal(caminho)
        filtrado = df[df["CNPJ_FUNDO"].isin(cnpjs)].copy()
        return filtrado if not filtrado.empty else None

    except Exception as e:
        print(f"  ⚠ Erro ao ler {os.path.basename(caminho)}: {e}")
        return None


def upsert_historico(df: pd.DataFrame) -> int:
    """Insere histórico de cotas no Supabase. Com retry de 3 tentativas."""
    # Remove duplicatas cnpj+data dentro do mesmo arquivo
    df = df.drop_duplicates(subset=["CNPJ_FUNDO", "DT_COMPTC"], keep="first")
    registros = []
    for _, row in df.iterrows():
        cnpj = safe_str(row.get("CNPJ_FUNDO"))
        data = parse_date(row.get("DT_COMPTC"))
        valor_cota = safe_numeric(row.get("VL_QUOTA"))

        if not cnpj or not data or valor_cota is None:
            continue

        nr_cotst = row.get("NR_COTST")
        cotistas = None
        if nr_cotst and str(nr_cotst).strip() not in ("", "nan", "NaN"):
            try:
                cotistas = int(float(str(nr_cotst).replace(",", ".")))
            except (ValueError, TypeError):
                pass

        registros.append({
            "cnpj":           cnpj,
            "data":           data,
            "valor_cota":     valor_cota,
            "patrimonio_liq": safe_numeric(row.get("VL_PATRIM_LIQ")),
            "captacao":       safe_numeric(row.get("CAPTC_DIA")),
            "resgates":       safe_numeric(row.get("RESG_DIA")),
            "cotistas":       cotistas,
        })

    if not registros:
        return 0

    last_exc = None
    for attempt in range(1, 4):
        try:
            result = (
                supabase.table("fundos_historico")
                .upsert(registros, on_conflict="cnpj,data")
                .execute()
            )
            return len(result.data)
        except Exception as e:
            last_exc = e
            if attempt < 3:
                wait = 2 ** (attempt - 1)
                print(f"    ⚠ Upsert tentativa {attempt}/3 — aguardando {wait}s... ({e})")
                time.sleep(wait)

    raise last_exc


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    print("=== ETL Fundos de Investimento (CVM) ===\n")

    os.makedirs(DATA_DIR, exist_ok=True)

    erros = []
    total = 0

    with ETLRun("fundos_historico") as batch_run:
        with httpx.Client() as client:
            garantir_cadastro_local(client)
            garantir_registro_novo_local(client)
            garantir_historico_local(client)

        # 1. Cadastro (opcional — segue sem se o download falhar)
        df_cad = carregar_cadastro()
        if df_cad is not None:
            upsert_cadastro(df_cad)

        # 2. Histórico
        cnpjs = [c.strip() for c in CNPJS_ALVO]
        arquivos = listar_arquivos_historico()

        if not arquivos:
            print("⚠ Nenhum arquivo inf_diario_fi_* disponível (download falhou e nada em cache local).\n")
            batch_run.set_status("error", "Download de inf_diario_fi_* falhou e não há arquivo local em cache.")
            return

        print(f"→ {len(arquivos)} arquivo(s) encontrado(s) em etl/data/cvm/\n")

        for arq in arquivos:
            nome = os.path.basename(arq)
            print(f"→ Processando {nome}...", end=" ")

            try:
                df_mes = processar_arquivo(arq, cnpjs)

                if df_mes is None:
                    print("sem dados para os fundos alvo")
                    continue

                salvos = upsert_historico(df_mes)
                total += salvos
                print(f"{salvos} registros salvos")

            except Exception as e:
                erros.append(f"{nome}: {e}")
                print(f"ERRO: {e}")

        batch_run.set_rows(total)

    if erros and total > 0:
        log_partial("fundos_historico", total, "; ".join(erros))
        print(f"\n⚠ {len(erros)} arquivo(s) com erro:")
        for e in erros:
            print(f"  - {e}")

    print(f"\n=== Concluído — {total} registros históricos salvos ===")


if __name__ == "__main__":
    run()
