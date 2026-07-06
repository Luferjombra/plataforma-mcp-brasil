"""
Validação cruzada — COTAHIST (staging) vs brapi (produção)

Compara rv_historico (produção, alimentada pelo brapi.dev via
rv_historico.py) com rv_historico_staging (COTAHIST, Fase 1 — ver
ADR-001) para os tickers já cobertos pela lista curada de
rv_historico.py ("famílias" pré-definidas).

Não escreve nada em nenhuma tabela — só lê e reporta. É o item 1 da
Fase 2 (validação cruzada) descrita em ADR-001, pré-requisito antes de
promover o COTAHIST a fonte de produção.

Uso:
    python etl/validar_cotahist.py                # todos os tickers de ATIVOS[]
    python etl/validar_cotahist.py --limiar 2.0    # % de divergência para marcar como suspeito (padrão 1%)
"""

import argparse

from config import supabase
from log_etl import ETLRun
from rv_historico import ATIVOS

LIMIAR_PADRAO = 1.0  # % de divergência no fechamento para marcar como suspeito
MAX_DIVERGENCIAS_IMPRESSAS = 5


def buscar_historico(tabela: str, ticker: str) -> dict:
    """Retorna {data: {fechamento, volume}} para um ticker numa tabela."""
    res = (
        supabase.table(tabela)
        .select("data,fechamento,volume")
        .eq("ticker", ticker)
        .execute()
    )
    return {r["data"]: r for r in res.data}


def comparar_ticker(ticker: str, limiar: float) -> dict:
    prod = buscar_historico("rv_historico", ticker)
    staging = buscar_historico("rv_historico_staging", ticker)

    datas_comuns = sorted(set(prod) & set(staging))
    divergencias = []
    for data in datas_comuns:
        p, s = prod[data], staging[data]
        fp, fs = p.get("fechamento"), s.get("fechamento")
        if fp is None or fs is None or fp == 0:
            continue
        diff_pct = abs(fp - fs) / fp * 100
        if diff_pct > limiar:
            divergencias.append({"data": data, "brapi": fp, "cotahist": fs, "diff_pct": round(diff_pct, 2)})

    return {
        "ticker": ticker,
        "datas_comuns": len(datas_comuns),
        "divergencias": divergencias,
        "so_producao": len(prod) - len(datas_comuns),
        "so_staging": len(staging) - len(datas_comuns),
    }


def run(limiar: float = LIMIAR_PADRAO):
    print("=== Validação cruzada — COTAHIST (staging) vs brapi (produção) ===\n")

    tickers = [a["ticker"] for a in ATIVOS]
    print(f"Comparando {len(tickers)} tickers (famílias pré-definidas de rv_historico.py)")
    print(f"Limiar de divergência: {limiar}%\n")

    with ETLRun("validacao_cotahist_brapi") as run_ctx:
        total_datas_comuns = 0
        total_divergencias = 0
        tickers_sem_overlap = []
        tickers_com_divergencia = []

        for ticker in tickers:
            r = comparar_ticker(ticker, limiar)
            total_datas_comuns += r["datas_comuns"]

            if r["datas_comuns"] == 0:
                tickers_sem_overlap.append(ticker)
                print(f"  ⚠ {ticker}: sem datas em comum "
                      f"(só produção={r['so_producao']}, só staging={r['so_staging']})")
                continue

            pct_divergente = len(r["divergencias"]) / r["datas_comuns"] * 100
            flag = "✗" if r["divergencias"] else "✓"
            print(f"  {flag} {ticker}: {r['datas_comuns']} datas em comum, "
                  f"{len(r['divergencias'])} divergência(s) > {limiar}% ({pct_divergente:.1f}%)")

            if r["divergencias"]:
                tickers_com_divergencia.append(ticker)
                total_divergencias += len(r["divergencias"])
                for d in r["divergencias"][:MAX_DIVERGENCIAS_IMPRESSAS]:
                    print(f"      {d['data']}: brapi={d['brapi']} cotahist={d['cotahist']} ({d['diff_pct']}%)")
                if len(r["divergencias"]) > MAX_DIVERGENCIAS_IMPRESSAS:
                    print(f"      ... e mais {len(r['divergencias']) - MAX_DIVERGENCIAS_IMPRESSAS} divergência(s)")

        print("\n" + "=" * 60)
        print("RESUMO")
        print("=" * 60)
        print(f"Tickers comparados:            {len(tickers)}")
        print(f"Sem overlap de datas:          {len(tickers_sem_overlap)} — {tickers_sem_overlap}")
        print(f"Com divergência > {limiar}%:        {len(tickers_com_divergencia)} — {tickers_com_divergencia}")
        print(f"Total de datas comparadas:     {total_datas_comuns}")
        print(f"Total de divergências:         {total_divergencias}")

        run_ctx.set_rows(total_datas_comuns)

    print("\n=== Concluído ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validação cruzada COTAHIST (staging) vs brapi (produção)")
    parser.add_argument("--limiar", type=float, default=LIMIAR_PADRAO,
                        help=f"Divergência percentual no fechamento para marcar como suspeito (padrão: {LIMIAR_PADRAO})")
    args = parser.parse_args()

    run(limiar=args.limiar)
