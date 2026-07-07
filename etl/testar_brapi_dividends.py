"""
Script de teste descartável — verifica se dividends=true é liberado no
free tier da brapi, e se o payload cobre a bonificação de ITUB4/MGLU3
confirmada por notícia na validação cruzada (ver ADR-001).

Não escreve em nenhuma tabela. Não faz parte do pipeline de produção —
apagar depois de decidir se a brapi serve como fonte de eventos
corporativos.

Uso:
    python etl/testar_brapi_dividends.py
"""

import json
import os

import httpx

BRAPI_BASE = "https://brapi.dev/api"
BRAPI_TOKEN = os.getenv("BRAPI_TOKEN", "")

TICKERS_TESTE = ["ITUB4", "MGLU3"]


def testar(ticker: str, client: httpx.Client):
    print(f"\n{'=' * 60}")
    print(f"GET /quote/{ticker}?dividends=true")
    print("=" * 60)

    params = {"dividends": "true", "fundamental": "false"}
    if BRAPI_TOKEN:
        params["token"] = BRAPI_TOKEN

    headers = {"User-Agent": "plataforma-mcp-brasil/1.0 (teste dividends)"}
    if BRAPI_TOKEN:
        headers["Authorization"] = f"Bearer {BRAPI_TOKEN}"

    try:
        resp = client.get(f"{BRAPI_BASE}/quote/{ticker}", params=params, headers=headers, timeout=30)
    except Exception as e:
        print(f"  ✗ Erro de conexão: {e}")
        return

    print(f"  Status: {resp.status_code}")

    if resp.status_code != 200:
        print(f"  Corpo (primeiros 500 chars): {resp.text[:500]}")
        return

    data = resp.json()
    results = data.get("results", [])
    if not results:
        print("  ⚠ 200 OK mas sem 'results' — payload:")
        print(f"  {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
        return

    result = results[0]
    chaves = list(result.keys())
    print(f"  Chaves no results[0]: {chaves}")

    dividends_data = result.get("dividendsData")
    if dividends_data is None:
        print("  ⚠ Campo 'dividendsData' ausente — dividends=true pode não ter tido efeito (plano free?)")
        return

    print(f"  ✓ dividendsData presente — chaves: {list(dividends_data.keys())}")

    for chave, valor in dividends_data.items():
        if not isinstance(valor, list):
            print(f"    {chave}: {valor}")
            continue

        labels = sorted({item.get("label") for item in valor if isinstance(item, dict) and "label" in item})
        print(f"    {chave}: {len(valor)} registro(s) — labels distintos: {labels}")

        # Eventos com data (approvedOn ou paymentDate) em nov/dez de 2025 — janela da
        # bonificação confirmada por notícia (ex-direito 26/12 ITUB4, 30/12 MGLU3)
        for item in valor:
            if not isinstance(item, dict):
                continue
            datas = [str(item.get("approvedOn") or ""), str(item.get("paymentDate") or "")]
            if any(d.startswith("2025-11") or d.startswith("2025-12") for d in datas):
                print(f"      [candidato dez/2025] {json.dumps(item, ensure_ascii=False)}")


def run():
    print("=== Teste — brapi dividends=true (free tier?) ===")
    print(f"Token configurado: {'sim' if BRAPI_TOKEN else 'não (free tier sem token)'}")

    with httpx.Client() as client:
        for ticker in TICKERS_TESTE:
            testar(ticker, client)

    print("\n=== Concluído — script de teste, não apaga nem grava nada ===")


if __name__ == "__main__":
    run()
