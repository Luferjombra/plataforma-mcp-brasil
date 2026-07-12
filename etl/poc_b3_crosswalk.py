"""
POC pontual -- validar o crosswalk ticker -> CD_CVM via B3 (listedCompaniesProxy).

Não é ETL de produção. Objetivo: confirmar se o endpoint não-oficial da B3
(GetInitialCompanies, usado pela própria página "Empresas Listadas" da B3)
está acessível e o que ele devolve -- e se resolve os casos que a POC de
fundamentos CVM deixou pendentes por ambiguidade de nome (RENT3, SUZB3) ou
sem match (ELET3), cruzando com os CD_CVM já confirmados via DFP (BBAS3=1023,
BBDC4=906, PETR4=9512, VALE3=4170, WEGE3=5410, etc.) como sanity check.

Endpoint (não documentado oficialmente pela B3, mas usado publicamente --
ver referências na conversa que originou esta POC):
https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/
GetInitialCompanies/{payload_base64}

payload = {"language": "pt-br", "pageNumber": N, "pageSize": M}

Fase 1 (descoberta): 1 página pequena, imprime status + estrutura crua do
JSON -- não sabemos os nomes de campo reais até ver uma resposta de verdade.
Fase 2 (só roda se a fase 1 confirmar o formato): pagina tudo e cruza com os
tickers de teste.

Uso: python poc_b3_crosswalk.py
"""
import base64
import json

import httpx

URL_BASE = "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetInitialCompanies"

# CD_CVM já confirmados na POC de fundamentos CVM (sanity check) + os 3
# pendentes que motivaram essa investigação.
TICKERS_TESTE = {
    "BBAS3": 1023,
    "BBDC4": 906,
    "PETR4": 9512,
    "VALE3": 4170,
    "WEGE3": 5410,
    "RENT3": None,  # ambíguo na CVM: 24813 (Fleet) ou 19739 (Rent a Car)?
    "SUZB3": None,  # ambíguo na CVM: 13986 (S.A.) ou 9067 (Holding)?
    "ELET3": None,  # sem match na CVM
}

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; poc-crosswalk/1.0)"}


def _montar_url(page_number=1, page_size=120):
    payload = {"language": "pt-br", "pageNumber": page_number, "pageSize": page_size}
    payload_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    return f"{URL_BASE}/{payload_b64}"


def _fase1_descoberta(client: httpx.Client) -> bool:
    print("=" * 60)
    print("FASE 1 -- descoberta (1 página pequena)")
    print("=" * 60)
    url = _montar_url(page_number=1, page_size=10)
    print(f"URL: {url[:110]}...\n")
    try:
        resp = client.get(url)
    except Exception as e:
        print(f"[FALHA] erro de conexão: {type(e).__name__}: {e}")
        return False

    print(f"Status: {resp.status_code}")
    print(f"Primeiros 800 chars da resposta:\n{resp.text[:800]}\n")

    if resp.status_code != 200:
        print("FALHA: não retornou 200. POC inconclusiva.")
        return False

    try:
        data = resp.json()
    except Exception as e:
        print(f"[FALHA] resposta não é JSON válido: {type(e).__name__}: {e}")
        return False

    print(f"Chaves do JSON top-level: {list(data.keys())}")
    results = data.get("results", [])
    print(f"'results': {len(results)} empresas na primeira página\n")
    if results:
        print("Estrutura do primeiro item:")
        print(json.dumps(results[0], indent=2, ensure_ascii=False))
    return bool(results)


def _fase2_crosswalk(client: httpx.Client):
    print()
    print("=" * 60)
    print("FASE 2 -- paginar tudo e cruzar com tickers de teste")
    print("=" * 60)

    todas_empresas = []
    page = 1
    while True:
        url = _montar_url(page_number=page, page_size=120)
        resp = client.get(url)
        if resp.status_code != 200:
            print(f"  página {page}: status {resp.status_code}, parando")
            break
        data = resp.json()
        results = data.get("results", [])
        if not results:
            print(f"  página {page}: vazia, parando")
            break
        todas_empresas.extend(results)
        print(f"  página {page}: +{len(results)} empresas (acumulado: {len(todas_empresas)})")
        if len(results) < 120:
            break
        page += 1
        if page > 30:  # safety cap
            print("  [aviso] atingiu cap de 30 páginas, parando")
            break

    print(f"\nTotal de empresas coletadas: {len(todas_empresas)}\n")
    if not todas_empresas:
        print("Nenhuma empresa coletada -- não dá pra cruzar. POC inconclusiva.")
        return

    campo_ticker = None
    campo_codcvm = None
    campo_nome = None
    exemplo = todas_empresas[0]
    for candidato in ("issuingCompany", "ticker", "companyCode"):
        if candidato in exemplo:
            campo_ticker = candidato
            break
    for candidato in ("codeCVM", "code", "cvmCode", "codCvm"):
        if candidato in exemplo:
            campo_codcvm = candidato
            break
    for candidato in ("tradingName", "companyName", "corporateName"):
        if candidato in exemplo:
            campo_nome = candidato
            break

    print(f"Campo detectado p/ ticker: {campo_ticker!r}")
    print(f"Campo detectado p/ CD_CVM: {campo_codcvm!r}")
    print(f"Campo detectado p/ nome:   {campo_nome!r}\n")

    print("Cruzamento com tickers de teste:")
    for ticker, cd_cvm_esperado in TICKERS_TESTE.items():
        prefixo = ticker[:4]
        candidatos = [
            e for e in todas_empresas
            if campo_ticker and str(e.get(campo_ticker, "")).upper().startswith(prefixo)
        ]
        if not candidatos:
            print(f"  [SEM MATCH] {ticker} (prefixo {prefixo})")
            continue
        for c in candidatos:
            cd_cvm_real = c.get(campo_codcvm) if campo_codcvm else "?"
            nome_real = c.get(campo_nome) if campo_nome else "?"
            bate = ""
            if cd_cvm_esperado is not None:
                bate = " [BATE]" if str(cd_cvm_real) == str(cd_cvm_esperado) else f" [DIVERGE, esperado {cd_cvm_esperado}]"
            print(f"  {ticker}: ticker_b3={c.get(campo_ticker)} CD_CVM={cd_cvm_real} nome={nome_real}{bate}")


def main():
    print("POC B3 listedCompaniesProxy -- crosswalk ticker -> CD_CVM\n")
    with httpx.Client(timeout=30, headers=HEADERS) as client:
        ok = _fase1_descoberta(client)
        if not ok:
            print("\nFase 1 não confirmou o formato esperado -- pulando fase 2.")
            return
        _fase2_crosswalk(client)


if __name__ == "__main__":
    main()
