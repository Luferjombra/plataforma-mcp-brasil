"""
POC pontual -- diagnosticar o fraseado real de DS_CONTA que bancos usam no
DFP, pra descobrir por que BBDC4/BBAS3/BSLI4/BRSR3/BRSR5/BRSR6/ABCB4 (e o
resto dos 78 tickers "sem Lucro/PL extraível") não batem com nenhuma das
6+2 variantes já tentadas em fundamentos_cvm.py.

Não é ETL de produção. Busca os cd_cvm já resolvidos pelo crosswalk pros
tickers problemáticos, baixa o DFP 2025 e imprime TODAS as linhas
DS_CONTA/CD_CONTA (ORDEM_EXERC='ÚLTIMO') de cada empresa -- tanto do DRE
(candidatas a Lucro Líquido) quanto do BPP (candidatas a Patrimônio
Líquido) -- pra ver o texto de verdade, não adivinhar.

Uso: python poc_diagnostico_bancos.py
"""
import io
import zipfile

import httpx
import pandas as pd

from config import supabase
from log_etl import DEFAULT_USER_AGENT, baixar_arquivo_http, hoje_brt

TICKERS_PROBLEMA = [
    "BBDC4", "BBAS3", "BSLI4", "BRSR3", "BRSR5", "BRSR6", "ABCB4",
    "EMBR3", "PETZ3", "CGAS3", "BRAP3", "BRAP4", "AALR3",
]

URL_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS"


def main():
    print(f"=== Diagnóstico DS_CONTA -- bancos e outros tickers problema -- {hoje_brt().isoformat()} ===\n")

    res = (
        supabase.table("rv_ativos")
        .select("ticker,nome,cd_cvm")
        .in_("ticker", TICKERS_PROBLEMA)
        .execute()
    )
    mapa_ticker_cvm = {r["ticker"]: (r["cd_cvm"], r["nome"]) for r in res.data}
    print("cd_cvm encontrados:")
    for t in TICKERS_PROBLEMA:
        if t in mapa_ticker_cvm:
            print(f"  {t}: cd_cvm={mapa_ticker_cvm[t][0]} nome={mapa_ticker_cvm[t][1]}")
        else:
            print(f"  {t}: NÃO ENCONTRADO em rv_ativos")
    print()

    ano_atual = hoje_brt().year
    conteudo = None
    ano_usado = None
    with httpx.Client(follow_redirects=True) as client:
        for ano in (ano_atual - 1, ano_atual - 2, ano_atual):
            url = f"{URL_BASE}/dfp_cia_aberta_{ano}.zip"
            print(f"Tentando {url} ...")
            conteudo = baixar_arquivo_http(
                url, client, user_agent=DEFAULT_USER_AGENT,
                max_attempts=2, timeout=120, not_found_status=(404, 403),
            )
            if conteudo:
                ano_usado = ano
                break

    if not conteudo:
        print("FALHA: nenhum DFP disponível. Diagnóstico inconclusivo.")
        return

    print(f"\nOK -- baixado DFP {ano_usado} ({len(conteudo) / 1024:.0f} KB)\n")

    with zipfile.ZipFile(io.BytesIO(conteudo)) as zf:
        with zf.open(f"dfp_cia_aberta_DRE_con_{ano_usado}.csv") as f:
            dre = pd.read_csv(f, sep=";", encoding="latin-1", decimal=",")
        with zf.open(f"dfp_cia_aberta_BPP_con_{ano_usado}.csv") as f:
            bpp = pd.read_csv(f, sep=";", encoding="latin-1", decimal=",")

    print(f"Colunas DRE: {list(dre.columns)}")
    print(f"Colunas BPP: {list(bpp.columns)}\n")

    for ticker in TICKERS_PROBLEMA:
        if ticker not in mapa_ticker_cvm:
            continue
        cd_cvm, nome = mapa_ticker_cvm[ticker]
        print("=" * 70)
        print(f"{ticker} ({nome}, CD_CVM {cd_cvm})")
        print("=" * 70)

        print("-- DRE (ORDEM_EXERC='ÚLTIMO') --")
        mask_dre = (dre["CD_CVM"] == cd_cvm) & (dre["ORDEM_EXERC"] == "ÚLTIMO")
        linhas_dre = dre[mask_dre].sort_values("CD_CONTA")
        if linhas_dre.empty:
            print("  [nenhuma linha encontrada -- CD_CVM pode não ter DRE nesse ano]")
        for _, row in linhas_dre.iterrows():
            print(f"  CD_CONTA={row['CD_CONTA']:10s} VERSAO={row['VERSAO']:>2} "
                  f"VL_CONTA={row['VL_CONTA']:>18,.2f}  DS_CONTA={row['DS_CONTA']}")

        print("-- BPP (ORDEM_EXERC='ÚLTIMO') --")
        mask_bpp = (bpp["CD_CVM"] == cd_cvm) & (bpp["ORDEM_EXERC"] == "ÚLTIMO")
        linhas_bpp = bpp[mask_bpp].sort_values("CD_CONTA")
        if linhas_bpp.empty:
            print("  [nenhuma linha encontrada]")
        for _, row in linhas_bpp.iterrows():
            print(f"  CD_CONTA={row['CD_CONTA']:10s} VERSAO={row['VERSAO']:>2} "
                  f"VL_CONTA={row['VL_CONTA']:>18,.2f}  DS_CONTA={row['DS_CONTA']}")
        print()


if __name__ == "__main__":
    main()
