"""
ETL — Tesouro Direto
Fonte: Tesouro Transparente (API pública, sem Cloudflare WAF)
CSV: PrecoTaxaTesouroDireto.csv — todos os títulos desde 2002
Destino: rf_titulos + rf_historico no Supabase

Uso:
    cd etl
    .\\venv\\Scripts\\Activate.ps1
    python rf_tesouro.py

Pré-requisito:
    Executar database/schema_rf_migration.sql no Supabase antes da primeira carga.
"""

import os
import sys
import httpx
import pandas as pd
from io import StringIO
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import supabase

# ── Fonte de dados ────────────────────────────────────────────────────────────
# CSV com todo histórico (sem Cloudflare — acesso direto OK)
CSV_URL = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv"
)

# ── Mapeamento de tipo de título ──────────────────────────────────────────────
# Ordem importa: prefixos mais longos primeiro para evitar match parcial errado
TYPE_MAP = [
    ("Tesouro IPCA+ com Juros Semestrais", "IPCAS", "IPCA"),
    ("Tesouro Prefixado com Juros Semestrais", "PRES",  "PRE"),
    ("Tesouro RendA+",                         "RENDA", "IPCA"),
    ("Tesouro Educa+",                         "EDUCA", "IPCA"),
    ("Tesouro IPCA+",                          "IPCA",  "IPCA"),
    ("Tesouro Prefixado",                      "PRE",   "PRE"),
    ("Tesouro Selic",                          "LFT",   "SELIC"),
    ("Tesouro IGP-M+",                         "IGPM",  "IGPM"),
]

NOMES_DISPLAY = {
    "LFT":   "Tesouro Selic",
    "IPCA":  "Tesouro IPCA+",
    "IPCAS": "Tesouro IPCA+ Juros Sem.",
    "PRE":   "Tesouro Prefixado",
    "PRES":  "Tesouro Prefixado Juros Sem.",
    "RENDA": "Tesouro RendA+",
    "EDUCA": "Tesouro Educa+",
    "IGPM":  "Tesouro IGP-M+",
}


def detectar_tipo(nome_titulo: str) -> tuple[str, str]:
    """Retorna (tipo_curto, indexador) para um nome de título."""
    for prefixo, tipo, indexador in TYPE_MAP:
        if nome_titulo.strip().startswith(prefixo):
            return tipo, indexador
    return "OTHER", "OTHER"


def gerar_codigo(nome_titulo: str, data_vencimento: date) -> str:
    """Gera código único: TIPO_YYYY-MM-DD. Cabe em VARCHAR(30)."""
    tipo, _ = detectar_tipo(nome_titulo)
    return f"{tipo}_{data_vencimento.strftime('%Y-%m-%d')}"


def safe_float(val) -> float | None:
    """Converte valor brasileiro (vírgula como decimal) para float, ou None."""
    try:
        if pd.isna(val):
            return None
        v = float(str(val).replace(".", "").replace(",", "."))
        return round(v, 6) if v != 0 else None
    except Exception:
        return None


def registrar_log(status: str, novos: int, total: int, erro: str = None):
    supabase.table("etl_log").insert({
        "job_nome": "rf_tesouro",
        "status": status,
        "registros_novos": novos,
        "registros_total": total,
        "erro_msg": erro,
    }).execute()


def run():
    print("=" * 55)
    print("ETL Tesouro Direto")
    print("=" * 55)

    # ── 1. Download do CSV ────────────────────────────────────
    print("\n[1/4] Baixando CSV do Tesouro Transparente...")
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; plataforma-mcp-brasil/1.0; "
            "+https://github.com/Luferjombra/plataforma-mcp-brasil)"
        )
    }
    try:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            resp = client.get(CSV_URL, headers=headers)
            resp.raise_for_status()
        conteudo = resp.text
    except Exception as e:
        print(f"  ✗ Erro ao baixar CSV: {e}")
        registrar_log("error", 0, 0, f"Download falhou: {e}")
        return

    print(f"  ✓ {len(conteudo) / 1024:.0f} KB baixados")

    # ── 2. Parse do CSV ───────────────────────────────────────
    print("\n[2/4] Processando CSV...")
    try:
        # O CSV usa separador ';', encoding UTF-8 com BOM, decimal ','
        df = pd.read_csv(
            StringIO(conteudo),
            sep=";",
            encoding="utf-8-sig",
            decimal=",",
            thousands=".",
        )
    except Exception:
        # Fallback: latin-1
        try:
            df = pd.read_csv(
                StringIO(conteudo),
                sep=";",
                encoding="latin-1",
                decimal=",",
                thousands=".",
            )
        except Exception as e:
            print(f"  ✗ Erro ao parsear CSV: {e}")
            registrar_log("error", 0, 0, f"Parse falhou: {e}")
            return

    print(f"  {len(df):,} linhas · colunas: {list(df.columns)}")

    # Normalizar nomes de colunas (remover espaços extras)
    df.columns = [c.strip() for c in df.columns]

    # Colunas esperadas
    col_tipo  = "Tipo Titulo"
    col_venc  = "Data Vencimento"
    col_base  = "Data Base"
    col_tvend = "Taxa Venda Manha"
    col_tcomp = "Taxa Compra Manha"
    col_pvend = "PU Venda Manha"
    col_pcomp = "PU Compra Manha"

    # Verificar colunas mínimas
    for col in [col_tipo, col_venc, col_base]:
        if col not in df.columns:
            msg = f"Coluna '{col}' não encontrada. Colunas disponíveis: {list(df.columns)}"
            print(f"  ✗ {msg}")
            registrar_log("error", 0, 0, msg)
            return

    # Parsear datas (formato DD/MM/YYYY)
    df[col_venc] = pd.to_datetime(df[col_venc], dayfirst=True, errors="coerce")
    df[col_base] = pd.to_datetime(df[col_base], dayfirst=True, errors="coerce")
    df.dropna(subset=[col_base, col_venc, col_tipo], inplace=True)

    # Filtrar: apenas 2020 em diante (reduz carga inicial)
    df = df[df[col_base] >= "2020-01-01"].copy()
    print(f"  {len(df):,} linhas após filtro 2020+")

    # Gerar código único por título
    df["codigo"] = df.apply(
        lambda r: gerar_codigo(r[col_tipo], r[col_venc].date()), axis=1
    )

    # ── 3. Upsert — rf_titulos ────────────────────────────────
    print("\n[3/4] Atualizando rf_titulos...")
    titulos_df = df[[col_tipo, col_venc, "codigo"]].drop_duplicates("codigo").copy()
    titulos_rows = []
    for _, row in titulos_df.iterrows():
        tipo, indexador = detectar_tipo(row[col_tipo].strip())
        titulos_rows.append({
            "codigo":          row["codigo"],
            "nome":            row[col_tipo].strip(),
            "emissor":         "Tesouro Nacional",
            "tipo":            "Tesouro",
            "indexador":       indexador,
            "data_vencimento": row[col_venc].strftime("%Y-%m-%d"),
        })

    supabase.table("rf_titulos").upsert(titulos_rows, on_conflict="codigo").execute()
    print(f"  ✓ {len(titulos_rows)} títulos")

    # Marcar títulos com dados recentes como ativos
    data_recente = date.today().replace(month=date.today().month - 1 if date.today().month > 1 else 12).isoformat()
    df_recentes = df[df[col_base] >= data_recente]["codigo"].unique().tolist()
    if df_recentes:
        supabase.table("rf_titulos").update({"ativo": True}).in_("codigo", df_recentes).execute()
    # Marcar sem dados recentes como inativos
    codigos_todos = [r["codigo"] for r in titulos_rows]
    codigos_inativos = [c for c in codigos_todos if c not in df_recentes]
    if codigos_inativos:
        supabase.table("rf_titulos").update({"ativo": False}).in_("codigo", codigos_inativos).execute()

    # ── 4. Upsert — rf_historico ──────────────────────────────
    print("\n[4/4] Atualizando rf_historico...")
    hist_rows = []
    for _, row in df.iterrows():
        t_vend = safe_float(row.get(col_tvend)) if col_tvend in df.columns else None
        t_comp = safe_float(row.get(col_tcomp)) if col_tcomp in df.columns else None
        p_vend = safe_float(row.get(col_pvend)) if col_pvend in df.columns else None
        p_comp = safe_float(row.get(col_pcomp)) if col_pcomp in df.columns else None

        if t_vend is None and p_vend is None:
            continue

        hist_rows.append({
            "codigo":       row["codigo"],
            "data":         row[col_base].strftime("%Y-%m-%d"),
            "taxa_mercado": t_vend,   # taxa venda = yield que o investidor recebe
            "pu_mercado":   p_vend,   # PU venda = preço que o investidor paga
            "taxa_compra":  t_comp,   # taxa compra = recompra pelo Tesouro
            "pu_compra":    p_comp,   # PU compra = recompra pelo Tesouro
        })

    print(f"  {len(hist_rows):,} registros para upsert...")
    CHUNK = 500
    for i in range(0, len(hist_rows), CHUNK):
        batch = hist_rows[i : i + CHUNK]
        supabase.table("rf_historico").upsert(batch, on_conflict="codigo,data").execute()
        pct = (i + len(batch)) / len(hist_rows) * 100
        print(f"  ...{i + len(batch):,}/{len(hist_rows):,} ({pct:.0f}%)", end="\r")

    print(f"\n  ✓ rf_historico — {len(hist_rows):,} registros")

    registrar_log("success", len(hist_rows), len(hist_rows))
    print("\n=== ETL Tesouro Direto concluído ===")


if __name__ == "__main__":
    run()
