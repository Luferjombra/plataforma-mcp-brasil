"""
ETL — Crosswalk ticker -> CD_CVM (via B3 listedCompaniesProxy)

Popula: rv_ativos.cd_cvm

Pré-requisito para etl/fundamentos_cvm.py: sem cd_cvm resolvido, não dá
pra buscar Lucro Líquido/Patrimônio Líquido no DFP da CVM (a extração é
por CD_CVM exato, nunca por nome -- ver etl/fundamentos_cvm.py).

Fonte: endpoint não-oficial da própria página "Empresas Listadas" da B3
(https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/
GetInitialCompanies/{payload_base64}, payload = {"language":"pt-br",
"pageNumber":N,"pageSize":M}). Validado ao vivo via workflow_dispatch (POC
descartável, já removida do repo): 200 OK sem autenticação, ~3.475
empresas/instrumentos paginados em ~10s,
campos confirmados issuingCompany (prefixo de 4 letras do ticker),
codeCVM, tradingName. 5/5 sanity checks bateram com os CD_CVM já
confirmados via DFP (BBAS3->1023, BBDC4->906, PETR4->9512, VALE3->4170,
WEGE3->5410) e resolveu 2 casos que o matching por nome no DFP deixava
genuinamente ambíguos (RENT3->19739 Localiza Rent A Car, não 24813
Localiza Fleet; SUZB3->13986 Suzano S.A., não 9067 Suzano Holding).
ELET3 continua sem match nem no cadastro da B3 -- esperado, não é falha
deste script (fica marcado como não encontrado, não derruba o job).

Escopo: só tickers tipo IN ('ON', 'PN') em rv_ativos -- só companhias
abertas arquivam DFP na CVM (FII/ETF/FUNDO_LISTADO/OUTROS não).

Uso:
    python crosswalk_cvm.py --dry-run   # só relatório, não escreve nada
    python crosswalk_cvm.py              # resolve de verdade
"""
import argparse
import base64
import json

import httpx

from log_etl import ETLRun, buscar_paginado, retry_request, upsert_em_lotes

URL_BASE = "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetInitialCompanies"

# ~3.475 empresas/instrumentos confirmados via POC -- abaixo disso a
# resposta da B3 provavelmente veio truncada/incompleta (mudança de
# formato do endpoint não-oficial, paginação quebrada, etc.). Não grava
# um crosswalk parcial silenciosamente: aborta com exceção (status='error').
MINIMO_EMPRESAS_ESPERADO = 3000

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; plataforma-mcp-brasil/1.0)"}


def _montar_url(page_number: int, page_size: int = 120) -> str:
    payload = {"language": "pt-br", "pageNumber": page_number, "pageSize": page_size}
    payload_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    return f"{URL_BASE}/{payload_b64}"


def _buscar_todas_empresas_b3(client: httpx.Client) -> list[dict]:
    empresas: list[dict] = []
    page = 1
    while True:
        resp = retry_request(client, _montar_url(page, 120), timeout=30)
        results = resp.json().get("results", [])
        if not results:
            break
        empresas.extend(results)
        print(f"  página {page}: +{len(results)} empresas (acumulado: {len(empresas)})")
        if len(results) < 120:
            break
        page += 1
        if page > 40:  # safety cap -- ~29 páginas esperadas pra 3.475 registros
            print("  [aviso] atingiu cap de 40 páginas, parando")
            break
    return empresas


def _montar_mapa_prefixo_cd_cvm(empresas: list[dict]) -> tuple[dict[str, int], list[str]]:
    """issuingCompany (prefixo de 4 letras) -> codeCVM. Descarta (loga)
    prefixos com codeCVM conflitante entre registros -- não deveria
    acontecer, mas não é motivo pra derrubar o job inteiro se acontecer."""
    mapa: dict[str, int] = {}
    conflitos: list[str] = []
    for e in empresas:
        prefixo = str(e.get("issuingCompany", "")).upper().strip()
        cd_cvm = e.get("codeCVM")
        if not prefixo or cd_cvm is None:
            continue
        cd_cvm = int(cd_cvm)
        if prefixo in mapa and mapa[prefixo] != cd_cvm:
            conflitos.append(prefixo)
            continue
        mapa[prefixo] = cd_cvm
    return mapa, conflitos


def main(dry_run: bool = False):
    print("=== ETL Crosswalk CVM (B3 -> rv_ativos.cd_cvm) ===")
    if dry_run:
        print("(dry-run -- nada será escrito)")
    print()

    # nome também precisa vir junto: rv_ativos.nome é NOT NULL sem default,
    # e o PostgREST valida essa constraint no INSERT do upsert mesmo quando
    # o conflito sempre ocorre (mesmo gotcha documentado em
    # promover_cotahist.py, que por isso manda ticker/nome/tipo/fonte).
    candidatos = [
        c for c in buscar_paginado("rv_ativos", "ticker,tipo,nome")
        if c["tipo"] in ("ON", "PN")
    ]
    print(f"{len(candidatos)} tickers candidatos (tipo ON/PN) em rv_ativos\n")

    with ETLRun("crosswalk_cvm") as run:
        with httpx.Client(headers=HEADERS) as client:
            empresas = _buscar_todas_empresas_b3(client)

        print(f"\nTotal de empresas coletadas da B3: {len(empresas)}\n")
        if len(empresas) < MINIMO_EMPRESAS_ESPERADO:
            raise RuntimeError(
                f"B3 devolveu só {len(empresas)} empresas (esperado >= "
                f"{MINIMO_EMPRESAS_ESPERADO}) -- abortando sem gravar crosswalk incompleto"
            )

        mapa, conflitos = _montar_mapa_prefixo_cd_cvm(empresas)

        resolvidos = []
        nao_encontrados = []
        for c in candidatos:
            cd_cvm = mapa.get(c["ticker"][:4])
            if cd_cvm is None:
                nao_encontrados.append(c["ticker"])
            else:
                resolvidos.append({"ticker": c["ticker"], "nome": c["nome"], "cd_cvm": cd_cvm})

        # payload só ticker+nome+cd_cvm -- upsert do PostgREST só toca as
        # colunas presentes, não sobrescreve setor/subsetor/market_cap/etc
        # (mesma garantia usada em promover_cotahist.py). `nome` entra só
        # pra satisfazer o NOT NULL sem default, não pra ser alterado (o
        # valor mandado é o mesmo já existente na linha).
        if dry_run:
            print(f"[DRY-RUN] {len(resolvidos)}/{len(candidatos)} tickers seriam resolvidos -- nada escrito.")
            n = 0
        else:
            n = upsert_em_lotes("rv_ativos", resolvidos, on_conflict="ticker")
        run.set_rows(n)

        print(f"{len(resolvidos)}/{len(candidatos)} tickers resolvidos.")
        if nao_encontrados:
            print(f"Sem match ({len(nao_encontrados)}): {nao_encontrados}")
        if conflitos:
            print(f"Conflito de prefixo ({len(conflitos)}): {conflitos}")

        if nao_encontrados or conflitos:
            run.set_status(
                "partial",
                f"{len(nao_encontrados)} sem match, {len(conflitos)} conflito(s) de prefixo: "
                f"{nao_encontrados[:20]}",
            )

    print("\n=== Concluído ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crosswalk CVM (B3 -> rv_ativos.cd_cvm)")
    parser.add_argument("--dry-run", action="store_true", help="Só relatório, não escreve nada")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
