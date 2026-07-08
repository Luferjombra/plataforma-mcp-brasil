"""
Diagnóstico pontual — ticker sucessor de ELET3/RBRF11 (ADR-001, Fase 2, item 5)

As janelas de data de ELET3 e RBRF11 nas duas fontes são completamente
disjuntas (staging para em nov/out-2025, produção só retoma em mar/2026,
gap de 4-5,5 meses sem dado em nenhuma das duas — ver validar_cotahist.py
e ADR-001). Hipótese: rebatização de ticker ou evento societário. Este
script busca, no universo completo do COTAHIST (rv_ativos_staging), um
candidato a ticker sucessor com nome parecido e histórico começando perto
de onde o código original parou.

Descartável — apagar depois de resolver o item 5 do ADR-001.

Uso:
    python etl/diagnosticar_ticker_sucessor.py
"""

from config import supabase

TICKERS_INVESTIGAR = ["ELET3", "RBRF11"]


def buscar_ficha(ticker: str) -> dict | None:
    res = (
        supabase.table("rv_ativos_staging")
        .select("ticker,nome,tipo,codbdi,especi_raw")
        .eq("ticker", ticker)
        .execute()
    )
    return res.data[0] if res.data else None


def buscar_todos_ativos() -> list[dict]:
    """Universo completo do COTAHIST staging, buscado 1x e filtrado em Python.
    Um ILIKE '%termo%' direto no Postgres via PostgREST derrubou o worker do
    Supabase (Cloudflare 'Worker threw exception') — mais barato trazer tudo
    de uma vez (poucas mil linhas) do que fazer scan textual no servidor."""
    res = supabase.table("rv_ativos_staging").select("ticker,nome,tipo,codbdi,especi_raw").execute()
    return res.data


def buscar_candidatos(todos_ativos: list[dict], termo: str, ticker_original: str) -> list[dict]:
    """Tickers do universo completo com nome parecido, exceto o próprio."""
    termo_lower = termo.lower()
    return [
        r for r in todos_ativos
        if r["ticker"] != ticker_original and termo_lower in (r["nome"] or "").lower()
    ]


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
    print("=== Diagnóstico: ticker sucessor de ELET3/RBRF11 ===\n")

    todos_ativos = buscar_todos_ativos()
    print(f"{len(todos_ativos)} ativo(s) no universo rv_ativos_staging\n")

    for ticker in TICKERS_INVESTIGAR:
        print(f"→ {ticker}")
        try:
            ficha = buscar_ficha(ticker)
            if ficha is None:
                print("  ⚠ não encontrado em rv_ativos_staging\n")
                continue

            print(f"  ficha: nome={ficha['nome']!r} tipo={ficha['tipo']} "
                  f"codbdi={ficha['codbdi']!r} especi_raw={ficha['especi_raw']!r}")

            primeira, ultima, n = primeira_ultima_data(ticker)
            print(f"  histórico staging: {n} dia(s), {primeira} .. {ultima}")

            termo = ficha["nome"].split()[0] if ficha["nome"] else None
            if not termo or len(termo) < 4:
                print("  [aviso] nome curto/vazio demais para buscar candidatos por similaridade\n")
                continue

            candidatos = buscar_candidatos(todos_ativos, termo, ticker)
            print(f"  candidatos com nome parecido ('{termo}'): {len(candidatos)}")
            for c in candidatos:
                p, u, n2 = primeira_ultima_data(c["ticker"])
                print(f"    - {c['ticker']} (nome={c['nome']!r}, tipo={c['tipo']}): "
                      f"{n2} dia(s), {p} .. {u}")
        except Exception as e:
            print(f"  ✗ erro ao investigar {ticker}: {e}")
        print()

    print("=== Concluído ===")


if __name__ == "__main__":
    run()
