"""
Diagnóstico pontual — dimensionar universo real do COTAHIST (ADR-001, Fase 2,
Passo 4 — decisão de escopo)

O diagnóstico anterior (diagnosticar_ticker_sucessor.py, já removido) buscou
"todos os ativos" de rv_ativos_staging sem contornar o limite padrão de 1000
linhas do PostgREST (o mesmo bug já corrigido em validar_cotahist.py) — o
"1000 ativos" medido ali é o teto do PostgREST, não o total real.

Este script usa count="exact" (só o header Content-Range, sem baixar as
linhas) para pegar números exatos: nº de tickers distintos já vistos em 1
ano de staging, nº de linhas em rv_historico_staging, e o mesmo para a
produção (curadoria atual) — base para estimar storage/custo de expandir
o universo exposto (Passo 4).

Descartável — apagar depois de usar os números na decisão de escopo.

Uso:
    python etl/medir_universo_storage.py
"""

from config import supabase


def contar(tabela: str, filtros: dict | None = None) -> int:
    q = supabase.table(tabela).select("*", count="exact").limit(1)
    if filtros:
        for campo, valor in filtros.items():
            q = q.eq(campo, valor)
    return q.execute().count or 0


def run():
    print("=== Dimensionar universo COTAHIST (staging) vs produção (brapi) ===\n")

    n_ativos_staging = contar("rv_ativos_staging")
    n_hist_staging = contar("rv_historico_staging")
    print(f"rv_ativos_staging (tickers distintos já vistos, universo completo): {n_ativos_staging}")
    print(f"rv_historico_staging (linhas, ~1 ano, universo completo): {n_hist_staging}")

    n_ativos_prod = contar("rv_ativos")
    n_hist_prod = contar("rv_historico")
    print(f"\nrv_ativos (produção, curadoria atual): {n_ativos_prod}")
    print(f"rv_historico (produção, curadoria atual): {n_hist_prod}")

    n_eventos = contar("rv_eventos_societarios")
    n_proventos = contar("rv_proventos")
    print(f"\nrv_eventos_societarios: {n_eventos}")
    print(f"rv_proventos: {n_proventos}")

    if n_hist_staging and n_ativos_staging:
        media_linhas_por_ticker = n_hist_staging / n_ativos_staging
        print(f"\nMédia de linhas/ticker no staging (1 ano): {media_linhas_por_ticker:.0f}")

    print("\n=== Concluído ===")


if __name__ == "__main__":
    run()
