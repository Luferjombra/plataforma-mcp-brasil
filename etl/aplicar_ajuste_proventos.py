"""
ETL — Ajuste por proventos (fechamento_adj em rv_historico_staging)

Aplica preco_ajustado = preco_bruto / fator_acumulado nos candles do COTAHIST
(rv_historico_staging) usando os eventos societários já coletados em
rv_eventos_societarios (ver etl/eventos_corporativos.py). Resolve o
bloqueador confirmado na validação cruzada COTAHIST vs brapi — ITUB4 e
MGLU3 divergiam ~3%/~5% porque o brapi retroajusta o histórico por
bonificação e o COTAHIST não (ver docs/adr/001-cotahist-migracao-rv.md).

fator_acumulado(data_pregao) = produto de `fator` de todo evento do ticker
com data_com >= data_pregao (eventos ainda "à frente" daquele pregão — o
mesmo critério que a B3/brapi usam para ajustar preço histórico).

Escopo: só processa tickers que já têm registro em rv_eventos_societarios
(hoje ~13, por causa do rate limit da brapi em eventos_corporativos.py —
ver ADR-001). Rodar de novo conforme a base de eventos crescer.

Uso:
    python etl/aplicar_ajuste_proventos.py
"""

from config import supabase
from log_etl import ETLRun

CHUNK = 500


def buscar_eventos_por_ticker() -> dict[str, list[dict]]:
    """{ticker: [{fator, data_com}, ...]} só para tickers com evento cadastrado."""
    res = (
        supabase.table("rv_eventos_societarios")
        .select("ticker,fator,data_com")
        .execute()
    )
    eventos_por_ticker: dict[str, list[dict]] = {}
    for row in res.data:
        if row.get("data_com") is None:
            continue  # sem data_com não dá pra saber a partir de quando o ajuste vale
        eventos_por_ticker.setdefault(row["ticker"], []).append(row)
    return eventos_por_ticker


def fator_acumulado(data_pregao: str, eventos: list[dict]) -> float:
    fator = 1.0
    for evento in eventos:
        if evento["data_com"] >= data_pregao:
            fator *= float(evento["fator"])
    return fator


def buscar_historico_staging(ticker: str) -> list[dict]:
    res = (
        supabase.table("rv_historico_staging")
        .select("ticker,data,fechamento")
        .eq("ticker", ticker)
        .execute()
    )
    return res.data


def calcular_ajustes(ticker: str, eventos: list[dict]) -> list[dict]:
    linhas = buscar_historico_staging(ticker)
    registros = []
    for linha in linhas:
        fechamento = linha.get("fechamento")
        if fechamento is None:
            continue
        fator = fator_acumulado(linha["data"], eventos)
        registros.append({
            "ticker": ticker,
            "data": linha["data"],
            "fechamento": fechamento,  # NOT NULL — precisa vir no payload do upsert (ver ADR-001)
            "fechamento_adj": round(float(fechamento) / fator, 4),
        })
    return registros


def upsert_ajustes(registros: list[dict]) -> int:
    total = 0
    for i in range(0, len(registros), CHUNK):
        batch = registros[i:i + CHUNK]
        supabase.table("rv_historico_staging").upsert(batch, on_conflict="ticker,data").execute()
        total += len(batch)
    return total


def run():
    print("=== ETL Ajuste por Proventos (fechamento_adj) ===\n")

    with ETLRun("ajuste_proventos") as run_ctx:
        eventos_por_ticker = buscar_eventos_por_ticker()
        tickers = sorted(eventos_por_ticker)
        print(f"{len(tickers)} ticker(s) com evento societário cadastrado: {tickers}\n")

        total_ajustado = 0
        for ticker in tickers:
            eventos = eventos_por_ticker[ticker]
            registros = calcular_ajustes(ticker, eventos)
            n = upsert_ajustes(registros)
            total_ajustado += n
            print(f"  ✓ {ticker}: {n} candle(s) ajustado(s) ({len(eventos)} evento(s))")

        run_ctx.set_rows(total_ajustado)

    print(f"\n=== Concluído — {total_ajustado} candle(s) ajustado(s) ===")


if __name__ == "__main__":
    run()
