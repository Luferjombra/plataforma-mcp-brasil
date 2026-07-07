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
    python etl/validar_cotahist.py --usar-ajustado # compara fechamento (brapi) x fechamento_adj (staging)
                                                    # — usar depois de rodar aplicar_ajuste_proventos.py
"""

import argparse
import datetime

from config import supabase
from log_etl import ETLRun
from rv_historico import ATIVOS

LIMIAR_PADRAO = 1.0  # % de divergência no fechamento para marcar como suspeito
MAX_DIVERGENCIAS_IMPRESSAS = 5
JANELA_DIAS_PADRAO = 400  # cobre a janela de backfill do COTAHIST (1 ano) com folga


CAMPOS_OHLC = ["abertura", "maxima", "minima", "fechamento"]


def buscar_historico(tabela: str, ticker: str, cutoff: str) -> dict:
    """
    Retorna {data: {abertura, maxima, minima, fechamento, fechamento_adj, volume}}
    para um ticker numa tabela, só a partir de `cutoff`. Sem esse filtro,
    tickers com >1000 registros batem no limite padrão do PostgREST e a
    consulta volta truncada (e sem garantia de quais linhas vêm — pode não
    cobrir a janela recente).
    """
    res = (
        supabase.table(tabela)
        .select("data,abertura,maxima,minima,fechamento,fechamento_adj,volume")
        .eq("ticker", ticker)
        .gte("data", cutoff)
        .execute()
    )
    return {r["data"]: r for r in res.data}


def diff_pct(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or a == 0:
        return None
    return round(abs(a - b) / a * 100, 2)


def comparar_ticker(ticker: str, limiar: float, cutoff: str, usar_ajustado: bool = False) -> dict:
    prod = buscar_historico("rv_historico", ticker, cutoff)
    staging = buscar_historico("rv_historico_staging", ticker, cutoff)

    # Com --usar-ajustado, compara o fechamento já ajustado por proventos do
    # brapi contra fechamento_adj do staging (ver aplicar_ajuste_proventos.py)
    # em vez do fechamento bruto do COTAHIST — é o que valida se o ajuste
    # zerou a divergência de ITUB4/MGLU3 (ver ADR-001).
    campo_staging_fechamento = "fechamento_adj" if usar_ajustado else "fechamento"

    datas_comuns = sorted(set(prod) & set(staging))
    divergencias = []
    for data in datas_comuns:
        p, s = prod[data], staging[data]
        diffs = {campo: diff_pct(p.get(campo), s.get(campo)) for campo in CAMPOS_OHLC}
        diffs["fechamento"] = diff_pct(p.get("fechamento"), s.get(campo_staging_fechamento))
        diff_fechamento = diffs["fechamento"]
        if diff_fechamento is not None and diff_fechamento > limiar:
            cotahist = {c: s.get(c) for c in CAMPOS_OHLC}
            cotahist["fechamento"] = s.get(campo_staging_fechamento)
            divergencias.append({
                "data": data,
                "brapi": {c: p.get(c) for c in CAMPOS_OHLC},
                "cotahist": cotahist,
                "diff_pct": diffs,
            })

    return {
        "ticker": ticker,
        "datas_comuns": len(datas_comuns),
        "divergencias": divergencias,
        "so_producao": len(prod) - len(datas_comuns),
        "so_staging": len(staging) - len(datas_comuns),
    }


def run(limiar: float = LIMIAR_PADRAO, janela_dias: int = JANELA_DIAS_PADRAO, usar_ajustado: bool = False):
    print("=== Validação cruzada — COTAHIST (staging) vs brapi (produção) ===\n")

    cutoff = (datetime.date.today() - datetime.timedelta(days=janela_dias)).isoformat()
    tickers = [a["ticker"] for a in ATIVOS]
    print(f"Comparando {len(tickers)} tickers (famílias pré-definidas de rv_historico.py)")
    print(f"Janela: últimos {janela_dias} dias (desde {cutoff}) — limiar de divergência: {limiar}%")
    if usar_ajustado:
        print("Modo: fechamento (brapi) x fechamento_adj (staging) — validando ajuste por proventos\n")
    else:
        print()

    with ETLRun("validacao_cotahist_brapi") as run_ctx:
        total_datas_comuns = 0
        total_divergencias = 0
        tickers_sem_overlap = []
        tickers_com_divergencia = []

        for ticker in tickers:
            r = comparar_ticker(ticker, limiar, cutoff, usar_ajustado)
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
                    campos_str = " | ".join(
                        f"{c}: brapi={d['brapi'][c]} cotahist={d['cotahist'][c]} ({d['diff_pct'][c]}%)"
                        for c in CAMPOS_OHLC if d["diff_pct"][c] is not None
                    )
                    print(f"      {d['data']}: {campos_str}")
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
    parser.add_argument("--janela-dias", type=int, default=JANELA_DIAS_PADRAO,
                        help=f"Quantos dias retroagir na comparação (padrão: {JANELA_DIAS_PADRAO})")
    parser.add_argument("--usar-ajustado", action="store_true",
                        help="Compara fechamento (brapi) x fechamento_adj (staging), em vez do fechamento bruto — "
                             "usar depois de rodar aplicar_ajuste_proventos.py")
    args = parser.parse_args()

    run(limiar=args.limiar, janela_dias=args.janela_dias, usar_ajustado=args.usar_ajustado)
