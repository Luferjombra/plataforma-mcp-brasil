"""
Diagnóstico pontual — ticker sucessor de RBRF11 (ADR-001, Fase 2, item 5)

Reabertura do item 5: a primeira rodada buscou candidatos usando a primeira
palavra do nome truncado do COTAHIST ('FII RBRALPHA' -> 'FII'), termo genérico
demais (bate em centenas de FIIs). O termo distintivo real é 'RBRALPHA'.

Descartável — apagar depois de resolver o item 5 do ADR-001.

Uso:
    python etl/diagnosticar_ticker_sucessor.py
"""

from config import supabase

TICKER = "RBRF11"
TERMO_BUSCA = "RBRALPHA"


def buscar_ficha(ticker: str) -> dict | None:
    res = (
        supabase.table("rv_ativos_staging")
        .select("ticker,nome,tipo,codbdi,especi_raw")
        .eq("ticker", ticker)
        .execute()
    )
    return res.data[0] if res.data else None


def buscar_todos_ativos() -> list[dict]:
    res = supabase.table("rv_ativos_staging").select("ticker,nome,tipo,codbdi,especi_raw").execute()
    return res.data


def primeira_ultima_data(ticker: str) -> tuple[str | None, str | None, int]:
    res = (
        supabase.table("rv_historico_staging")
        .select("data")
        .eq("ticker", ticker)
        .order("data")
        .execute()
    )
    datas = [r["data"] for r in res.data]
    if not datas:
        return None, None, 0
    return datas[0], datas[-1], len(datas)


def run():
    print(f"=== Diagnóstico: ticker sucessor de {TICKER} (termo='{TERMO_BUSCA}') ===\n")

    ficha = buscar_ficha(TICKER)
    print(f"ficha {TICKER}: {ficha}")
    primeira, ultima, n = primeira_ultima_data(TICKER)
    print(f"histórico staging: {n} dia(s), {primeira} .. {ultima}\n")

    todos_ativos = buscar_todos_ativos()
    termo_lower = TERMO_BUSCA.lower()
    candidatos = [
        r for r in todos_ativos
        if r["ticker"] != TICKER and termo_lower in (r["nome"] or "").lower()
    ]

    print(f"candidatos com '{TERMO_BUSCA}' no nome: {len(candidatos)}")
    for c in candidatos:
        p, u, n2 = primeira_ultima_data(c["ticker"])
        print(f"  - {c['ticker']} (nome={c['nome']!r}, tipo={c['tipo']}): {n2} dia(s), {p} .. {u}")

    print("\n=== Concluído ===")


if __name__ == "__main__":
    run()
