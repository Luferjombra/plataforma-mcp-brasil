"""
ETL — Promoção COTAHIST staging -> produção (ADR-001, Fase 2, Passo 5)

Copia rv_ativos_staging/rv_historico_staging (universo completo do COTAHIST,
~2.366 tickers — ver decisão de escopo no ADR-001) para rv_ativos/rv_historico
(produção, hoje alimentada pelo brapi.dev via rv_historico.py), marcando
fonte='cotahist'.

Pré-requisito: migration 012_widen_ticker_producao.sql executada (alarga
`ticker` para VARCHAR(12) em rv_ativos/rv_historico — a coluna `fonte` já
existia desde a migration 008, ao contrário do que uma versão anterior deste
script/ADR afirmava).

Precedência por fonte: o upsert por (ticker, data) sobrescreve a linha de
produção existente com o dado do COTAHIST — já validado (0 divergências
depois do ajuste por proventos, ver validar_cotahist.py --usar-ajustado).
Onde o COTAHIST não tem dado para aquele (ticker, data) — ex.: ELET3/RBRF11
no período em que pararam de negociar sob esse código, ver ADR-001 item 5 —
a linha de produção do brapi.dev simplesmente não é tocada, porque upsert
nunca deleta o que não está no payload.

CUIDADO — fechamento_adj: `aplicar_ajuste_proventos.py` só populou essa
coluna em staging para os tickers com evento societário cadastrado (hoje
ITUB4/MGLU3/PETR4/VALE3). Para o resto do universo, fechamento_adj é NULL em
staging — mas em produção (via rv_historico.py) ela é sempre preenchida pela
brapi. Mandar fechamento_adj=None no payload do upsert SOBRESCREVE o valor
real já existente em produção com NULL (PostgREST só pula colunas ausentes do
payload, não colunas presentes com valor null). Por isso o upsert de
histórico é feito em dois lotes: linhas com fechamento_adj (mandam a coluna)
e linhas sem (omitem a chave inteira do payload).

rv_historico tem FK para rv_ativos(ticker) — por isso promove ativos primeiro.
O upsert de rv_ativos só manda ticker/nome/tipo/fonte: nunca toca
setor/subsetor/market_cap/free_float (exclusivas do brapi `fundamental=true`)
porque o upsert do PostgREST só atualiza as colunas presentes no payload.

Uso:
    python etl/promover_cotahist.py --dry-run   # só relatório, não escreve nada
    python etl/promover_cotahist.py              # promove de verdade
"""

import argparse
from collections import defaultdict

from config import supabase
from log_etl import ETLRun

CHUNK = 500
TAMANHO_PAGINA = 1000


def buscar_paginado(tabela: str, colunas: str, filtros: dict | None = None) -> list[dict]:
    """Pagina com .range() para não bater no limite padrão de 1000 linhas
    do PostgREST — já causou bug real neste projeto (validar_cotahist.py,
    diagnosticar_ticker_sucessor.py)."""
    todos = []
    inicio = 0
    while True:
        q = supabase.table(tabela).select(colunas)
        if filtros:
            for campo, valor in filtros.items():
                q = q.eq(campo, valor)
        res = q.range(inicio, inicio + TAMANHO_PAGINA - 1).execute()
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

    with ETLRun("promover_cotahist_dry_run") as run:
        tickers_staging = {r["ticker"] for r in buscar_paginado("rv_ativos_staging", "ticker")}
        tickers_producao = {r["ticker"] for r in buscar_paginado("rv_ativos", "ticker")}

        novos = tickers_staging - tickers_producao
        ja_existentes = tickers_staging & tickers_producao

        print(f"Tickers em rv_ativos_staging (universo completo): {len(tickers_staging)}")
        print(f"Tickers em rv_ativos (produção atual):             {len(tickers_producao)}")
        print(f"  -> novos (serão inseridos):                                        {len(novos)}")
        print(f"  -> já existentes (metadata será atualizada para fonte='cotahist'): {len(ja_existentes)}\n")

        # Overlap de histórico só é possível nos tickers que JÁ EXISTEM EM
        # PRODUÇÃO HOJE (fato do banco, não a lista ATIVOS[] do código — um
        # ticker removido de ATIVOS mas ainda com linhas em rv_historico, ex.
        # BCFF11, ainda seria sobrescrito de verdade e precisa entrar na conta).
        #
        # Achado real (não hipotético): a versão anterior fazia 2 chamadas
        # paginadas por ticker de ja_existentes -- rápido quando só existiam
        # os ~31 tickers curados em produção (contexto original, pré-corte),
        # mas ja_existentes passou a ser quase o universo inteiro (~2.335
        # tickers) depois que o corte de 2026-07-08 promoveu tudo pra
        # produção. Isso virou ~4.670 round-trips sequenciais -- um dry-run
        # que devia levar segundos travou por dezenas de minutos. Corrigido
        # pra 2 buscas em bloco (staging inteiro + produção inteira, cada
        # uma já paginada com segurança) seguidas de agrupamento em memória
        # -- poucas centenas de páginas no total, não milhares de chamadas.
        print("Overlap de histórico (só possível nos tickers já em produção hoje):")
        staging_rows = buscar_paginado("rv_historico_staging", "ticker,data,fechamento_adj")
        producao_rows = buscar_paginado("rv_historico", "ticker,data")

        datas_staging_por_ticker: dict[str, set] = defaultdict(set)
        ajuste_por_ticker: dict[str, int] = defaultdict(int)
        for r in staging_rows:
            datas_staging_por_ticker[r["ticker"]].add(r["data"])
            if r.get("fechamento_adj") is not None:
                ajuste_por_ticker[r["ticker"]] += 1

        datas_producao_por_ticker: dict[str, set] = defaultdict(set)
        for r in producao_rows:
            datas_producao_por_ticker[r["ticker"]].add(r["data"])

        total_overlap = 0
        total_com_ajuste = 0
        for ticker in ja_existentes:
            overlap = datas_staging_por_ticker[ticker] & datas_producao_por_ticker[ticker]
            total_overlap += len(overlap)
            total_com_ajuste += ajuste_por_ticker[ticker]

        print(f"  Linhas que serão SOBRESCRITAS (mesmo ticker+data já em produção): ~{total_overlap}")
        print("  (já validado em validar_cotahist.py --usar-ajustado: 0 divergências nessas linhas)")
        print(f"  Linhas do staging com fechamento_adj calculado (evento societário cadastrado): {total_com_ajuste}")
        print("  As demais NÃO mandam fechamento_adj no payload — preserva o valor já existente em produção\n")

        n_hist_staging = contar("rv_historico_staging")
        n_hist_producao = contar("rv_historico")
        print(f"Linhas em rv_historico_staging (total):  {n_hist_staging}")
        print(f"Linhas em rv_historico (produção atual): {n_hist_producao}")
        print(f"  -> linhas novas estimadas:        ~{n_hist_staging - total_overlap}")
        print(f"  -> linhas sobrescritas estimadas: ~{total_overlap}")

        run.set_rows(n_hist_staging)

    print("\n=== Fim do dry-run — nada foi escrito ===")


# ── Promoção real ─────────────────────────────────────────────────────────────

def _upsert_em_lotes(tabela: str, registros: list[dict], on_conflict: str) -> int:
    n = 0
    for i in range(0, len(registros), CHUNK):
        lote = registros[i:i + CHUNK]
        supabase.table(tabela).upsert(lote, on_conflict=on_conflict).execute()
        n += len(lote)
    return n


def promover():
    print("=== Promoção COTAHIST staging -> produção ===\n")

    with ETLRun("promover_cotahist") as run:
        print("[1/2] Promovendo rv_ativos...")
        ativos_staging = buscar_paginado("rv_ativos_staging", "ticker,nome,tipo")
        ativos_payload = [{**a, "fonte": "cotahist"} for a in ativos_staging]
        n_ativos = _upsert_em_lotes("rv_ativos", ativos_payload, on_conflict="ticker")
        print(f"  ✓ {n_ativos} ticker(s) promovido(s)\n")

        print("[2/2] Promovendo rv_historico...")
        historico_staging = buscar_paginado(
            "rv_historico_staging",
            "ticker,data,abertura,maxima,minima,fechamento,fechamento_adj,volume,negocios",
        )

        # Ver docstring do módulo: nunca mandar fechamento_adj=None no upsert,
        # senão sobrescreve com NULL o valor já calculado em produção pela
        # brapi para os tickers sem evento societário cadastrado em staging.
        com_ajuste = [h for h in historico_staging if h.get("fechamento_adj") is not None]
        sem_ajuste = [
            {k: v for k, v in h.items() if k != "fechamento_adj"}
            for h in historico_staging if h.get("fechamento_adj") is None
        ]

        n_hist = 0
        n_hist += _upsert_em_lotes(
            "rv_historico",
            [{**h, "fonte": "cotahist"} for h in com_ajuste],
            on_conflict="ticker,data",
        )
        n_hist += _upsert_em_lotes(
            "rv_historico",
            [{**h, "fonte": "cotahist"} for h in sem_ajuste],
            on_conflict="ticker,data",
        )

        run.set_rows(n_ativos + n_hist)
        print(f"  ✓ {n_hist} linha(s) de histórico promovida(s) "
              f"({len(com_ajuste)} com fechamento_adj, {len(sem_ajuste)} sem)")

    print("\n=== Promoção concluída ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promoção COTAHIST staging -> produção (ADR-001, Fase 2)")
    parser.add_argument("--dry-run", action="store_true", help="Só relatório, não escreve nada")
    args = parser.parse_args()

    if args.dry_run:
        dry_run()
    else:
        promover()
