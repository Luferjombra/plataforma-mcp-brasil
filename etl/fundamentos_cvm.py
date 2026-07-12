"""
ETL — Fundamentos CVM (DFP) — Lucro Líquido, Patrimônio Líquido, ROE

Popula: rv_fundamentos

Pré-requisito: etl/crosswalk_cvm.py já rodado (precisa de rv_ativos.cd_cvm
populado -- sem isso não há candidato nenhum a processar). Roda via
offset de cron em etl.yml, não `needs:` (matrix jobs são independentes,
mesmo padrão de fund_analytics/fundos).

Fonte: https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/
dfp_cia_aberta_{ano}.zip -- zip anual com DRE_con (DRE consolidada) e
BPP_con (balanço patrimonial passivo consolidado). DFP é indexado por ano
fiscal de REFERÊNCIA, não de submissão -- o zip do ano corrente existe e
baixa com 200, mas a temporada de apresentação (prazo CVM ~abril do ano
seguinte) ainda não fechou; por isso tenta ano_atual-1 primeiro, depois
ano_atual-2, por último ano_atual. A CVM devolve 403 (não 404) pra uma
chave que ainda não existe -- not_found_status=(404, 403) é obrigatório.

Extração validada ao vivo 3x via workflow_dispatch (POC descartável, já
removida do repo): filtra por CD_CVM exato (nunca por nome -- risco real de misturar Lucro
Líquido de uma empresa com Patrimônio Líquido de outra com nome parecido,
achado independente de 2 revisões), ORDEM_EXERC == 'ÚLTIMO' (o mesmo CSV
duplica período atual/anterior), desempata por VERSAO máxima (retificação)
e depois CD_CONTA mais curto (conta-síntese). Lucro Líquido precisa de
várias variantes de DS_CONTA (fraseado difere por empresa, achado real com
BBDC4/BBAS3 -- bancos usam "resultado líquido" com mais frequência que
"lucro líquido").

CD_CVM vem do crosswalk (rv_ativos.cd_cvm, populado por crosswalk_cvm.py)
-- não há mais keyword/nome nesta etapa, ao contrário da POC original.

P/L fica fora de escopo (decisão da revisão de arquitetura que validou a
POC): calcular depois cruzando rv_ativos.market_cap / lucro_liquido.

Uso:
    python fundamentos_cvm.py --dry-run   # só relatório, não escreve nada
    python fundamentos_cvm.py              # extrai e grava de verdade
"""
import argparse
import io
import zipfile

import httpx
import pandas as pd

from log_etl import (
    ETLRun,
    DEFAULT_USER_AGENT,
    baixar_arquivo_http,
    buscar_paginado,
    hoje_brt,
    upsert_em_lotes,
)

URL_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS"

# Fraseados de DS_CONTA já validados na POC contra dados reais (empresas
# financeiras e não-financeiras) -- ordem importa, primeira que casar vence.
VARIANTES_LUCRO = [
    "lucro/prejuízo consolidado do período",
    "lucro/prejuízo do período",
    "lucro líquido consolidado do período",
    "lucro líquido do período",
    "resultado líquido consolidado do período",
    "resultado líquido do período",
]
VARIANTES_PL = [
    "patrimônio líquido consolidado",
    "patrimônio líquido",
]


def _baixar_zip_dfp(ano: int, client: httpx.Client) -> bytes | None:
    url = f"{URL_BASE}/dfp_cia_aberta_{ano}.zip"
    print(f"Tentando {url} ...")
    return baixar_arquivo_http(
        url, client,
        user_agent=DEFAULT_USER_AGENT,
        max_attempts=2, timeout=120,
        not_found_status=(404, 403),
        msg_404=f"  [info] DFP {ano} ainda não publicado ou indisponível.",
    )


def _ler_csv_do_zip(zf: zipfile.ZipFile, nome: str) -> pd.DataFrame | None:
    if nome not in zf.namelist():
        print(f"  [aviso] {nome} não encontrado no zip.")
        return None
    with zf.open(nome) as f:
        return pd.read_csv(f, sep=";", encoding="latin-1", decimal=",")


def _normalizar_escala(valor: float, escala: str | None) -> float:
    """DFP reporta VL_CONTA em milhares ('MIL') ou em unidade ('UNIDADE')
    dependendo da empresa -- não é constante no universo. Normaliza pra
    R$ cheio (mesma unidade de rv_ativos.market_cap, usado no futuro
    cálculo de P/L). Sem a coluna ESCALA_MOEDA no CSV, assume 'MIL' (o
    padrão de fato observado nas empresas testadas na POC)."""
    if escala is None:
        return valor * 1000
    escala_norm = str(escala).strip().upper()
    if escala_norm == "UNIDADE":
        return valor
    return valor * 1000  # 'MIL' ou qualquer outro valor não reconhecido


def _extrair_valor(df: pd.DataFrame, cd_cvm: int, variantes: list[str]) -> dict | None:
    """Filtra por CD_CVM exato + ORDEM_EXERC=='ÚLTIMO', tentando cada
    fraseado de `variantes` em ordem até achar alguma linha. Desempata por
    VERSAO máxima (retificação) e depois CD_CONTA mais curto (conta-síntese,
    não subitem). Retorna {"valor": R$ cheio, "versao": int,
    "ano_referencia": int|None (de DT_REFER se presente)} ou None."""
    tem_escala = "ESCALA_MOEDA" in df.columns
    tem_dt_refer = "DT_REFER" in df.columns

    for termo in variantes:
        mask = (
            (df["CD_CVM"] == cd_cvm)
            & (df["ORDEM_EXERC"] == "ÚLTIMO")
            & df["DS_CONTA"].str.contains(termo, case=False, na=False)
        )
        achados = df[mask]
        if achados.empty:
            continue

        versao_max = achados["VERSAO"].max()
        achados = achados[achados["VERSAO"] == versao_max]
        linha = achados.loc[achados["CD_CONTA"].str.len().idxmin()]

        escala = linha["ESCALA_MOEDA"] if tem_escala else None
        valor = _normalizar_escala(float(linha["VL_CONTA"]), escala)

        ano_referencia = None
        if tem_dt_refer:
            dt_refer = str(linha["DT_REFER"])
            if len(dt_refer) >= 4 and dt_refer[:4].isdigit():
                ano_referencia = int(dt_refer[:4])

        return {"valor": valor, "versao": int(versao_max), "ano_referencia": ano_referencia}

    return None


def main(dry_run: bool = False):
    print(f"=== ETL Fundamentos CVM (DFP) -- {hoje_brt().isoformat()} ===")
    if dry_run:
        print("(dry-run -- nada será escrito)")
    print()

    # Download/parsing do zip DFP entram dentro do ETLRun (não depois) --
    # achado de revisão: se as 3 tentativas de ano falharem, ou o zip não
    # tiver DRE_con/BPP_con, o job morria sem nenhuma linha em etl_runs,
    # mesma falha silenciosa que fundos.py evita envolvendo
    # garantir_cadastro_local/garantir_historico_local no ETLRun.
    with ETLRun("fundamentos_cvm") as run:
        ano_atual = hoje_brt().year
        conteudo = None
        ano_usado = None
        with httpx.Client(follow_redirects=True) as client:
            for ano in (ano_atual - 1, ano_atual - 2, ano_atual):
                conteudo = _baixar_zip_dfp(ano, client)
                if conteudo:
                    ano_usado = ano
                    break

        if not conteudo:
            raise RuntimeError("nenhum DFP disponível nos 3 anos tentados")

        print(f"\nOK -- baixado DFP {ano_usado} ({len(conteudo) / 1024:.0f} KB)\n")

        with zipfile.ZipFile(io.BytesIO(conteudo)) as zf:
            dre = _ler_csv_do_zip(zf, f"dfp_cia_aberta_DRE_con_{ano_usado}.csv")
            bpp = _ler_csv_do_zip(zf, f"dfp_cia_aberta_BPP_con_{ano_usado}.csv")

        if dre is None or bpp is None:
            raise RuntimeError("não achei DRE_con ou BPP_con consolidado no zip")

        print(f"DRE consolidado: {len(dre)} linhas, {dre['DENOM_CIA'].nunique()} empresas")
        print(f"BPP consolidado: {len(bpp)} linhas, {bpp['DENOM_CIA'].nunique()} empresas\n")

        candidatos = [
            c for c in buscar_paginado("rv_ativos", "ticker,cd_cvm")
            if c["cd_cvm"] is not None
        ]
        print(f"{len(candidatos)} tickers candidatos (com cd_cvm resolvido) em rv_ativos\n")

        registros = []
        sem_dados = []

        for c in candidatos:
            cd_cvm = c["cd_cvm"]
            lucro = _extrair_valor(dre, cd_cvm, VARIANTES_LUCRO)
            pl = _extrair_valor(bpp, cd_cvm, VARIANTES_PL)

            if lucro is None or pl is None:
                sem_dados.append(c["ticker"])
                continue

            valor_lucro = lucro["valor"]
            valor_pl = pl["valor"]
            roe = round(valor_lucro / valor_pl * 100, 4) if valor_pl else None
            ano_referencia = lucro["ano_referencia"] or pl["ano_referencia"] or ano_usado

            registros.append({
                "ticker": c["ticker"],
                "cd_cvm": cd_cvm,
                "ano_referencia": ano_referencia,
                "lucro_liquido": valor_lucro,
                "patrimonio_liquido": valor_pl,
                "roe": roe,
                "versao_dfp": max(lucro["versao"], pl["versao"]),
                "fonte": "cvm_dfp",
            })

        # Dedup por (ticker, ano_referencia) -- guarda defensiva contra o
        # erro real do Postgres quando 2 linhas do mesmo lote compartilham
        # a chave de conflito (mesmo padrão de eventos_corporativos.py).
        vistos: dict[tuple, dict] = {}
        for r in registros:
            vistos[(r["ticker"], r["ano_referencia"])] = r
        registros = list(vistos.values())

        if dry_run:
            print(f"[DRY-RUN] {len(registros)} registro(s) seriam upsertados -- nada escrito.")
            for r in registros[:20]:
                print(f"  {r['ticker']}: lucro={r['lucro_liquido']:,.2f} "
                      f"pl={r['patrimonio_liquido']:,.2f} roe={r['roe']}")
            n = 0
        else:
            n = upsert_em_lotes("rv_fundamentos", registros, on_conflict="ticker,ano_referencia")
        run.set_rows(n)

        print(f"{len(registros)}/{len(candidatos)} tickers com fundamentos extraídos (DFP {ano_usado}).")
        if sem_dados:
            print(f"Sem Lucro/PL extraível ({len(sem_dados)}): {sem_dados[:20]}")
            run.set_status(
                "partial",
                f"{len(sem_dados)} ticker(s) sem Lucro/PL no DFP {ano_usado}: {sem_dados[:20]}",
            )

    print("\n=== Concluído ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fundamentos CVM (DFP) -- Lucro Líquido/PL/ROE")
    parser.add_argument("--dry-run", action="store_true", help="Só relatório, não escreve nada")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
