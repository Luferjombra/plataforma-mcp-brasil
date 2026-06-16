"""
ETL — Fundos de Investimento
Fonte: CVM (Comissão de Valores Mobiliários) — arquivos locais

Como usar:
1. Acesse no navegador: https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/
2. Baixe os arquivos mensais desejados (ex: inf_diario_fi_202401.csv ... inf_diario_fi_202506.csv)
3. Salve todos em: etl/data/cvm/
4. (Opcional) Para atualizar cadastro: baixe cad_fi.csv do link
   https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv
   e salve como: etl/data/cvm/cad_fi.csv
5. Execute: python fundos.py
"""

import os
import glob
import math
import time
import zipfile
import io
import datetime
import pandas as pd
from config import supabase
from log_etl import ETLRun, log_partial

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "cvm")

# Fundos de referência — CNPJs validados no cadastro CVM
# Preferência por feeders (o que o cotista acessa diretamente)
CNPJS_ALVO = [
    "04.222.368/0001-55",  # Verde PVT Multimercado FI Financeiro (CIC)
    "04.311.271/0001-19",  # PS Verde D1 FI Financeiro em Cotas
    "01.221.890/0001-24",  # CSHG Verde FIC FIM
    "03.536.908/0001-02",  # CSHG Verde AM Star FIC FIF - Ações Responsabi
    "26.324.289/0001-98",  # Kinea Infra I FIF FI Incentivado Debêntures
    "26.324.298/0001-89",  # Kinea Infra FIC de Fundos Incentivados Infra RF
    "00.947.958/0001-94",  # Opportunity Market FIC de Fundos FI Financeiro
    "05.775.774/0001-08",  # Alaska Poland FI em Ações
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
    try:
        v = float(str(value).replace(",", "."))
        return None if math.isnan(v) or math.isinf(v) else v
    except (ValueError, TypeError):
        return None


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


# ---------------------------------------------------------------------------
# Cadastro
# ---------------------------------------------------------------------------

def carregar_cadastro() -> pd.DataFrame | None:
    """Lê cad_fi.csv local e filtra pelos CNPJs alvo."""
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
    print(f"  ✓ {len(df)} fundos encontrados no cadastro\n")
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


def processar_arquivo(caminho: str, cnpjs: list[str]) -> pd.DataFrame | None:
    """Lê um arquivo mensal (.csv ou .zip) e filtra pelos CNPJs alvo."""
    try:
        if caminho.endswith(".zip"):
            with zipfile.ZipFile(caminho) as zf:
                # Pega o primeiro CSV dentro do zip
                csvs_internos = [n for n in zf.namelist() if n.endswith(".csv")]
                if not csvs_internos:
                    print(f"  ⚠ Nenhum CSV dentro de {os.path.basename(caminho)}")
                    return None
                with zf.open(csvs_internos[0]) as f:
                    df = _ler_csv_bytes(f.read(), csvs_internos[0])
        else:
            with open(caminho, "rb") as f:
                df = _ler_csv_bytes(f.read(), os.path.basename(caminho))

        # CVM usa CNPJ_FUNDO_CLASSE no formato novo, CNPJ_FUNDO no antigo
        col_cnpj = "CNPJ_FUNDO_CLASSE" if "CNPJ_FUNDO_CLASSE" in df.columns else "CNPJ_FUNDO"
        df = df.rename(columns={col_cnpj: "CNPJ_FUNDO"})
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
    print("=== ETL Fundos de Investimento (arquivos CVM locais) ===\n")

    os.makedirs(DATA_DIR, exist_ok=True)

    erros = []
    total = 0

    with ETLRun("fundos_historico") as batch_run:
        # 1. Cadastro (opcional — depende do cad_fi.csv estar baixado)
        df_cad = carregar_cadastro()
        if df_cad is not None:
            upsert_cadastro(df_cad)

        # 2. Histórico
        cnpjs = [c.strip() for c in CNPJS_ALVO]
        arquivos = listar_arquivos_historico()

        if not arquivos:
            print("⚠ Nenhum arquivo inf_diario_fi_*.csv encontrado em etl/data/cvm/")
            print("  Baixe os arquivos mensais em:")
            print("  https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/")
            print("  e salve nessa pasta.\n")
            batch_run.set_rows(0)
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
