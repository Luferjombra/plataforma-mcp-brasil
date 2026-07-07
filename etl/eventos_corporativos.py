"""
ETL — Eventos Corporativos (brapi dividendsData)

Popula: rv_eventos_societarios + rv_proventos

Fonte confirmada via teste real (ver histórico de commits —
testar_brapi_dividends.py, removido após validação): a brapi já expõe
bonificação/desdobramento/grupamento com fator numérico exato via
`dividends=true`, além de dividendo/JCP.

Resolve o bloqueador confirmado na validação cruzada COTAHIST vs brapi
(ver docs/adr/001-cotahist-migracao-rv.md): ITUB4 e MGLU3 divergiam de
forma sistemática (~3% e ~5%) por causa de bonificações com ex-direito
em dez/2025 que o brapi retroajusta no preço histórico e o COTAHIST
não. Com `rv_eventos_societarios` populada, dá para calcular
preco_ajustado = preco_bruto / fator para datas anteriores a data_com.

Mesma lista de tickers de rv_historico.py (ATIVOS) — reaproveita
BRAPI_BASE/BRAPI_TOKEN/brapi_headers de lá para não duplicar config.

Uso:
    python etl/eventos_corporativos.py
"""

import time

import httpx

from config import supabase
from log_etl import ETLRun, log_partial, retry_request
from rv_historico import ATIVOS, BRAPI_BASE, brapi_headers

TIPOS_EVENTO_CONHECIDOS = {"BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"}
TIPOS_PROVENTO_CONHECIDOS = {"DIVIDENDO", "JCP"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def extrair_data(iso_str: str | None) -> str | None:
    """'2025-12-18T03:00:00.000Z' -> '2025-12-18'. brapi usa 03:00 UTC = 00:00 BRT,
    então pegar só a parte da data já dá o dia correto no fuso do Brasil."""
    if not iso_str:
        return None
    return iso_str[:10]


def mapear_tipo(label: str | None, conhecidos: set) -> str:
    label_norm = (label or "").strip().upper()
    return label_norm if label_norm in conhecidos else "OUTROS"


def montar_observacoes(label: str | None, remarks: str | None, conhecidos: set) -> str | None:
    partes = []
    label_norm = (label or "").strip().upper()
    if label_norm not in conhecidos:
        partes.append(f"label_original={label}")
    if remarks:
        partes.append(remarks)
    return " | ".join(partes) if partes else None


# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_eventos_societarios(ticker: str, stock_dividends: list) -> list[dict]:
    registros = []
    for item in stock_dividends:
        data_aprovacao = extrair_data(item.get("approvedOn"))
        fator = item.get("factor")
        if data_aprovacao is None or fator is None:
            continue  # UNIQUE (ticker, tipo, data_aprovacao) exige data_aprovacao

        label = item.get("label")
        registros.append({
            "ticker": ticker,
            "tipo": mapear_tipo(label, TIPOS_EVENTO_CONHECIDOS),
            "fator": fator,
            "fator_descricao": item.get("completeFactor"),
            "data_aprovacao": data_aprovacao,
            "data_com": extrair_data(item.get("lastDatePrior")),
            "isin_code": item.get("isinCode") or item.get("assetIssued"),
            "observacoes": montar_observacoes(label, item.get("remarks"), TIPOS_EVENTO_CONHECIDOS),
        })
    return registros


def parse_proventos(ticker: str, cash_dividends: list) -> list[dict]:
    registros = []
    for item in cash_dividends:
        data_pagamento = extrair_data(item.get("paymentDate"))
        valor = item.get("rate")
        if data_pagamento is None or valor is None:
            continue  # UNIQUE (ticker, tipo, data_pagamento, valor_por_acao) exige os dois

        label = item.get("label")
        registros.append({
            "ticker": ticker,
            "tipo": mapear_tipo(label, TIPOS_PROVENTO_CONHECIDOS),
            "valor_por_acao": valor,
            "data_aprovacao": extrair_data(item.get("approvedOn")),
            "data_com": extrair_data(item.get("lastDatePrior")),
            "data_pagamento": data_pagamento,
            "isin_code": item.get("isinCode") or item.get("assetIssued"),
            "observacoes": montar_observacoes(label, item.get("remarks"), TIPOS_PROVENTO_CONHECIDOS),
        })
    return registros


# ── Busca ─────────────────────────────────────────────────────────────────────

def buscar_dividendos(ticker: str, client: httpx.Client) -> tuple[list, list]:
    """Retorna (stockDividends, cashDividends) do dividendsData da brapi."""
    params = {"dividends": "true", "fundamental": "false"}
    resp = retry_request(client, f"{BRAPI_BASE}/quote/{ticker}", params=params, timeout=30)
    results = resp.json().get("results", [])
    if not results:
        return [], []

    dividends_data = results[0].get("dividendsData") or {}
    return dividends_data.get("stockDividends", []), dividends_data.get("cashDividends", [])


# ── Supabase ──────────────────────────────────────────────────────────────────

def upsert_eventos_societarios(registros: list[dict]) -> int:
    if not registros:
        return 0
    res = (
        supabase.table("rv_eventos_societarios")
        .upsert(registros, on_conflict="ticker,tipo,data_aprovacao")
        .execute()
    )
    return len(res.data)


def upsert_proventos(registros: list[dict]) -> int:
    if not registros:
        return 0
    res = (
        supabase.table("rv_proventos")
        .upsert(registros, on_conflict="ticker,tipo,data_pagamento,valor_por_acao")
        .execute()
    )
    return len(res.data)


# ── Runner ────────────────────────────────────────────────────────────────────

def run():
    print("=== ETL Eventos Corporativos (brapi dividendsData) ===\n")

    tickers = [a["ticker"] for a in ATIVOS]
    erros = []

    with ETLRun("eventos_corporativos_batch") as batch_run:
        total_eventos = total_proventos = 0

        with httpx.Client(headers=brapi_headers()) as client:
            for ticker in tickers:
                print(f"→ {ticker}...")

                try:
                    with ETLRun(f"eventos_{ticker}") as run_ctx:
                        stock_raw, cash_raw = buscar_dividendos(ticker, client)

                        eventos = parse_eventos_societarios(ticker, stock_raw)
                        proventos = parse_proventos(ticker, cash_raw)

                        n_eventos = upsert_eventos_societarios(eventos)
                        n_proventos = upsert_proventos(proventos)

                        run_ctx.set_rows(n_eventos + n_proventos)
                        total_eventos += n_eventos
                        total_proventos += n_proventos

                        print(f"  ✓ {n_eventos} evento(s) societário(s), {n_proventos} provento(s)\n")

                except Exception as e:
                    erros.append(f"{ticker}: {e}")
                    print(f"  ✗ Erro: {e}\n")

                time.sleep(4)  # mesmo rate limit do rv_historico.py

        batch_run.set_rows(total_eventos + total_proventos)

    if erros:
        log_partial("eventos_corporativos_batch", total_eventos + total_proventos, "; ".join(erros))
        print(f"\n⚠ {len(erros)} erro(s):")
        for e in erros:
            print(f"  - {e}")

    print(f"\n=== Concluído — {total_eventos} eventos societários, {total_proventos} proventos ===")


if __name__ == "__main__":
    run()
