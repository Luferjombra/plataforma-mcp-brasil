"""
ETL — Promoção COTAHIST staging -> produção (ADR-001, Fase 2, Passo 5)

Copia rv_ativos_staging/rv_historico_staging (universo completo do COTAHIST,
~2.366 tickers — ver decisão de escopo no ADR-001) para rv_ativos/rv_historico
(produção, hoje alimentada pelo brapi.dev via rv_historico.py), marcando
fonte='cotahist'.

Pré-requisito: migration 012_fonte_producao.sql executada (adiciona a coluna
`fonte` em rv_ativos/rv_historico — não existia antes, apesar do que o ADR-001
dizia originalmente).

Precedência por fonte: o upsert por (ticker, data) sobrescreve a linha de
produção existente com o dado do COTAHIST — já validado (0 divergências
depois do ajuste por proventos, ver validar_cotahist.py --usar-ajustado).
Onde o COTAHIST não tem dado para aquele (ticker, data) — ex.: ELET3/RBRF11
no período em que pararam de negociar sob esse código, ver ADR-001 item 5 —
a linha de produção do brapi.dev simplesmente não é tocada, porque upsert
nunca deleta o que não está no payload. É assim que a precedência por fonte
funciona na prática, sem lógica condicional extra.

rv_historico tem FK para rv_ativos(ticker) — por isso promove ativos primeiro.
O upsert de rv_ativos só manda ticker/nome/tipo/fonte: nunca toca
setor/subsetor/market_cap/free_float (exclusivas do brapi `fundamental=true`)
porque o upsert do PostgREST só atualiza as colunas presentes no payload.

Uso:
    python etl/promover_cotahist.py --dry-run   # só relatório, não escreve nada
    python etl/promover_cotahist.py              # promove de verdade
"""

import argparse

from config import supabase
from log_etl import ETLRun
from rv_historico import ATIVOS
from validar_cotahist import comparar_ticker

CHUNK = 500
TAMANHO_PAGINA = 1000


def buscar_paginado(tabela: str, colunas: str) -> list[dict]:
    """Pagina com .range() para não bater no limite padrão de 1000 linhas
    do PostgREST — já causou bug real neste projeto (validar_cotahist.py,
    diagnosticar_ticker_sucessor.py)."""
    todos = []
    inicio = 0
    while True:
        res = (
            supabase.table(tabela)
            .select(colunas)
            .range(inicio, inicio + TAMANHO_PAGINA - 1)
            .execute()
        )
        if not res.data:
            break
        todos.extend(res.data)
        if len(res.data) < TAMANHO_PAGINA:
            break
        inicio += TAMANHO_PAGINA
    return todos


def contar(tabela: str) -> int:
    return supabase.table(tabela).select("*", count="exact").limit(1).execute().count or 0


# ── Dry-run ───────────────────────────────────────────────────────────────────

def dry_run():
    print("=== DRY-RUN — promoção COTAHIST staging -> produção (nada será escrito) ===\n")

    tickers_staging = {r["ticker"] for r in buscar_paginado("rv_ativos_staging", "ticker")}
    tickers_producao = {r["ticker"] for r in buscar_paginado("rv_ativos", "ticker")}

    novos = tickers_staging - tickers_producao
    ja_existentes = tickers_staging & tickers_producao

    print(f"Tickers em rv_ativos_staging (universo completo): {len(tickers_staging)}")
    print(f"Tickers em rv_ativos (produção atual):             {len(tickers_producao)}")
    print(f"  -> novos (serão inseridos):                                        {len(novos)}")
    print(f"  -> já existentes (metadata será atualizada para fonte='cotahist'): {len(ja_existentes)}\n")

    # Overlap de histórico só é possível nos tickers que já existem em produção
    # hoje (a curadoria via brapi, ~30). Para o resto do universo, staging é
    # 100% linha nova — não precisa comparar linha a linha.
    print("Overlap de histórico (só possível nos tickers já em produção hoje):")
    total_overlap = 0
    for ticker in [a["ticker"] for a in ATIVOS]:
        if ticker not in tickers_producao:
            continue
        r = comparar_ticker(ticker, limiar=999, cutoff="2000-01-01")
        total_overlap += r["datas_comuns"]
    print(f"  Linhas que serão SOBRESCRITAS (mesmo ticker+data já em produção): ~{total_overlap}")
    print("  (já validado em validar_cotahist.py --usar-ajustado: 0 divergências nessas linhas)\n")

    n_hist_staging = contar("rv_historico_staging")
    n_hist_producao = contar("rv_historico")
    print(f"Linhas em rv_historico_staging (total):  {n_hist_staging}")
    print(f"Linhas em rv_historico (produção atual): {n_hist_producao}")
    print(f"  -> linhas novas estimadas:        ~{n_hist_staging - total_overlap}")
    print(f"  -> linhas sobrescritas estimadas: ~{total_overlap}")

    print("\n=== Fim do dry-run — nada foi escrito ===")


# ── Promoção real ─────────────────────────────────────────────────────────────

def promover():
    print("=== Promoção COTAHIST staging -> produção ===\n")

    with ETLRun("promover_cotahist") as run:
        print("[1/2] Promovendo rv_ativos...")
        ativos_staging = buscar_paginado("rv_ativos_staging", "ticker,nome,tipo")
        n_ativos = 0
        for i in range(0, len(ativos_staging), CHUNK):
            lote = [{**a, "fonte": "cotahist"} for a in ativos_staging[i:i + CHUNK]]
            supabase.table("rv_ativos").upsert(lote, on_conflict="ticker").execute()
            n_ativos += len(lote)
        print(f"  ✓ {n_ativos} ticker(s) promovido(s)\n")

        print("[2/2] Promovendo rv_historico...")
        historico_staging = buscar_paginado(
            "rv_historico_staging",
            "ticker,data,abertura,maxima,minima,fechamento,fechamento_adj,volume,negocios",
        )
        n_hist = 0
        for i in range(0, len(historico_staging), CHUNK):
            lote = [{**h, "fonte": "cotahist"} for h in historico_staging[i:i + CHUNK]]
            supabase.table("rv_historico").upsert(lote, on_conflict="ticker,data").execute()
            n_hist += len(lote)
            print(f"  ...{n_hist}/{len(historico_staging)}", end="\r")

        run.set_rows(n_ativos + n_hist)
        print(f"\n  ✓ {n_hist} linha(s) de histórico promovida(s)")

    print("\n=== Promoção concluída ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promoção COTAHIST staging -> produção (ADR-001, Fase 2)")
    parser.add_argument("--dry-run", action="store_true", help="Só relatório, não escreve nada")
    args = parser.parse_args()

    if args.dry_run:
        dry_run()
    else:
        promover()
