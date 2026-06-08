"""
ETL — Renda Variável (B3)
Fonte: brapi.dev (API oficial brasileira, mais estável que yfinance)
Popula: rv_ativos + rv_historico

Variáveis de ambiente (opcionais):
    BRAPI_TOKEN  — token gratuito em https://brapi.dev (aumenta rate limit)

Sem token: funciona com limite menor (~15 req/min).
"""

import math
import datetime
import time
import httpx
import os
from config import supabase
from log_etl import ETLRun, log_partial, retry_request

BRAPI_BASE = "https://brapi.dev/api"
BRAPI_TOKEN = os.getenv("BRAPI_TOKEN", "")  # opcional

# Histórico: últimos 5 anos usando startDate/endDate (mais robusto que range= no plano free)
BRAPI_START_YEARS = 5

# Principais ações do Ibovespa
ATIVOS = [
    {"ticker": "PETR4", "nome": "Petróleo Brasileiro S.A. - Petrobras PN",          "setor": "Petróleo e Gás",    "tipo": "PN"},
    {"ticker": "VALE3", "nome": "Vale S.A. ON",                                      "setor": "Mineração",         "tipo": "ON"},
    {"ticker": "ITUB4", "nome": "Itaú Unibanco Holding S.A. PN",                    "setor": "Financeiro",        "tipo": "PN"},
    {"ticker": "BBDC4", "nome": "Banco Bradesco S.A. PN",                           "setor": "Financeiro",        "tipo": "PN"},
    {"ticker": "BBAS3", "nome": "Banco do Brasil S.A. ON",                          "setor": "Financeiro",        "tipo": "ON"},
    {"ticker": "WEGE3", "nome": "WEG S.A. ON",                                      "setor": "Indústria",         "tipo": "ON"},
    {"ticker": "RENT3", "nome": "Localiza Rent a Car S.A. ON",                      "setor": "Serviços",          "tipo": "ON"},
    {"ticker": "LREN3", "nome": "Lojas Renner S.A. ON",                             "setor": "Varejo",            "tipo": "ON"},
    {"ticker": "MGLU3", "nome": "Magazine Luiza S.A. ON",                           "setor": "Varejo",            "tipo": "ON"},
    {"ticker": "ABEV3", "nome": "Ambev S.A. ON",                                    "setor": "Consumo",           "tipo": "ON"},
    {"ticker": "SUZB3", "nome": "Suzano S.A. ON",                                   "setor": "Papel e Celulose",  "tipo": "ON"},
    {"ticker": "RDOR3", "nome": "Rede D'Or São Luiz S.A. ON",                      "setor": "Saúde",             "tipo": "ON"},
    {"ticker": "HAPV3", "nome": "Hapvida Participações e Investimentos S.A. ON",    "setor": "Saúde",             "tipo": "ON"},
    {"ticker": "CSAN3", "nome": "Cosan S.A. ON",                                    "setor": "Energia",           "tipo": "ON"},
    {"ticker": "ELET3", "nome": "Centrais Elétricas Brasileiras S.A. ON",          "setor": "Energia",           "tipo": "ON"},
    {"ticker": "VIVT3", "nome": "Telefônica Brasil S.A. ON",                        "setor": "Telecomunicações",  "tipo": "ON"},
    # FIIs — Fundos Imobiliários
    {"ticker": "BTLG11", "nome": "BTG Pactual Logística FII",                       "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "HGLG11", "nome": "CSHG Logística FII",                              "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "XPLG11", "nome": "XP Log FII",                                      "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "KNRI11", "nome": "Kinea Renda Imobiliária FII",                     "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "MXRF11", "nome": "Maxi Renda FII",                                  "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "BCFF11", "nome": "BTG Pactual Fundo de Fundos FII",                 "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "HGRE11", "nome": "CSHG Real Estate FII",                            "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "VISC11", "nome": "Vinci Shopping Centers FII",                      "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "XPML11", "nome": "XP Malls FII",                                    "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "GGRC11", "nome": "GGR Covepi Renda FII",                            "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "KFOF11", "nome": "Kinea Fundo de Fundos FII",                       "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "CPTS11", "nome": "Capitânia Securities II FII",                     "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "PVBI11", "nome": "VBI Prime Properties FII",                        "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "RBRF11", "nome": "RBR Alpha Multiestratégia FII",                   "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "TRXF11", "nome": "TRX Real Estate FII",                             "setor": "Fundos Imobiliários", "tipo": "FII"},
    {"ticker": "BRCR11", "nome": "BC Fund FII",                                     "setor": "Fundos Imobiliários", "tipo": "FII"},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_float(value) -> float | None:
    try:
        f = float(value)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def brapi_headers() -> dict:
    headers = {"User-Agent": "plataforma-mcp-brasil/1.0 (github.com/lufer-jom)"}
    if BRAPI_TOKEN:
        headers["Authorization"] = f"Bearer {BRAPI_TOKEN}"
    return headers


def buscar_historico(ticker: str, client: httpx.Client) -> list[dict]:
    """
    Busca série histórica do ticker via brapi.dev.
    Retorna lista de dicts com keys: date(unix ts), open, high, low, close, volume, adjustedClose.
    """
    today = datetime.date.today()
    start = (today - datetime.timedelta(days=BRAPI_START_YEARS * 365)).strftime("%Y-%m-%d")
    end = today.strftime("%Y-%m-%d")
    params = {
        "startDate": start,
        "endDate": end,
        "interval": "1d",
        "fundamental": "false",
        "dividends": "false",
    }
    if BRAPI_TOKEN:
        params["token"] = BRAPI_TOKEN

    url = f"{BRAPI_BASE}/quote/{ticker}"
    resp = retry_request(client, url, params=params, timeout=30)
    data = resp.json()

    results = data.get("results", [])
    if not results:
        return []

    return results[0].get("historicalDataPrice", [])


def buscar_info(ticker: str, client: httpx.Client) -> dict:
    """Busca metadados do ativo (nome, setor, market cap)."""
    try:
        params = {"fundamental": "true"}
        if BRAPI_TOKEN:
            params["token"] = BRAPI_TOKEN
        resp = retry_request(client, f"{BRAPI_BASE}/quote/{ticker}", params=params, timeout=20)
        results = resp.json().get("results", [])
        return results[0] if results else {}
    except Exception:
        return {}


# ── Supabase ──────────────────────────────────────────────────────────────────

def upsert_ativo(ativo: dict, info: dict, status: str = "ativo") -> None:
    record = {
        "ticker": ativo["ticker"],
        "nome": info.get("longName") or ativo["nome"],
        "setor": ativo["setor"],
        "tipo": ativo["tipo"],
        "market_cap": info.get("marketCap"),
        "free_float": None,
        "ativo": status == "ativo",
        "status": status,
    }
    supabase.table("rv_ativos").upsert(record, on_conflict="ticker").execute()


def upsert_historico(ticker: str, candles: list[dict]) -> int:
    """Converte candles brapi.dev e faz upsert no Supabase."""
    registros = []
    for c in candles:
        try:
            # brapi retorna timestamp Unix em segundos
            ts = c.get("date")
            if not ts:
                continue
            data_iso = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).date().isoformat()

            fechamento = safe_float(c.get("close"))
            if fechamento is None:
                continue

            registros.append({
                "ticker": ticker,
                "data": data_iso,
                "abertura": safe_float(c.get("open")),
                "maxima": safe_float(c.get("high")),
                "minima": safe_float(c.get("low")),
                "fechamento": fechamento,
                "fechamento_adj": safe_float(c.get("adjustedClose") or c.get("close")),
                "volume": safe_float(c.get("volume")),
            })
        except Exception:
            continue

    if not registros:
        return 0

    result = (
        supabase.table("rv_historico")
        .upsert(registros, on_conflict="ticker,data")
        .execute()
    )
    return len(result.data)


# ── Runner ────────────────────────────────────────────────────────────────────

def run():
    print("=== ETL Renda Variável (B3 via brapi.dev) ===\n")
    if BRAPI_TOKEN:
        print(f"  Token: {BRAPI_TOKEN[:8]}...\n")
    else:
        print("  ⚠ Sem BRAPI_TOKEN — usando tier gratuito (limite reduzido)\n")

    erros = []

    with ETLRun("rv_historico_batch") as batch_run:
        total_rows = 0

        with httpx.Client(headers=brapi_headers()) as client:
            for ativo in ATIVOS:
                ticker = ativo["ticker"]
                print(f"→ {ticker}...")

                try:
                    with ETLRun(f"rv_{ticker}") as run:
                        candles = buscar_historico(ticker, client)

                        if not candles:
                            print(f"  ⚠ Sem dados históricos — marcando como delisted\n")
                            upsert_ativo(ativo, {}, status="delisted")
                            run.set_rows(0)
                            continue

                        # Determina status pelo candle mais recente
                        ultimo_ts = candles[-1].get("date", 0)
                        ultimo_dia = datetime.datetime.fromtimestamp(ultimo_ts, tz=datetime.timezone.utc).date()
                        dias_atraso = (datetime.date.today() - ultimo_dia).days
                        status = "delisted" if dias_atraso > 30 else "ativo"

                        info = buscar_info(ticker, client)
                        upsert_ativo(ativo, info, status=status)
                        salvos = upsert_historico(ticker, candles)
                        run.set_rows(salvos)
                        total_rows += salvos

                        flag = "⚠ delisted" if status == "delisted" else "✓"
                        print(f"  {flag} {salvos} registros | último pregão: {ultimo_dia}\n")

                except Exception as e:
                    erros.append(f"{ticker}: {e}")
                    print(f"  ✗ Erro: {e}\n")

                # Delay para respeitar rate limit do plano free (~15 req/min)
                time.sleep(4)

        batch_run.set_rows(total_rows)

    if erros:
        log_partial("rv_historico_batch", total_rows, "; ".join(erros))
        print(f"
⚠ {len(erros)} erro(s):")
        for e in erros:
            print(f"  - {e}")

    print("
=== Concluído ===")


if __name__ == "__main__":
    run()
  ⚠ Sem BRAPI_TOKEN — usando tier gratuito (limite reduzido)\n")

    erros = []

    with ETLRun("rv_historico_batch") as batch_run:
        total_rows = 0

        with httpx.Client(headers=brapi_headers()) as client:
            for ativo in ATIVOS:
                ticker = ativo["ticker"]
                print(f"→ {ticker}...")

                try:
                    with ETLRun(f"rv_{ticker}") as run:
                        candles = buscar_historico(ticker, client)

                        if not candles:
                            print(f"  ⚠ Sem dados históricos — marcando como delisted\n")
                            upsert_ativo(ativo, {}, status="delisted")
                            run.set_rows(0)
                            continue

                        ultimo_ts = candles[-1].get("date", 0)
                        ultimo_dia = datetime.datetime.fromtimestamp(ultimo_ts, tz=datetime.timezone.utc).date()
                        dias_atraso = (datetime.date.today() - ultimo_dia).days
                        status = "delisted" if dias_atraso > 30 else "ativo"

                        info = buscar_info(ticker, client)
                        upsert_ativo(ativo, info, status=status)
                        salvos = upsert_historico(ticker, candles)
                        run.set_rows(salvos)
                        total_rows += salvos

                        flag = "⚠ delisted" if status == "delisted" else "✓"
                        print(f"  {flag} {salvos} registros | último pregão: {ultimo_dia}\n")

                except Exception as e:
                    erros.append(f"{ticker}: {e}")
                    print(f"  ✗ Erro: {e}\n")

                # Delay para respeitar rate limit do plano free (~15 req/min)
                time.sleep(4)

        batch_run.set_rows(total_rows)

    if erros:
        log_partial("rv_historico_batch", total_rows, "; ".join(erros))
        print(f"\n⚠ {len(erros)} erro(s):")
        for e in erros:
            print(f"  - {e}")

    print("\n=== Concluído ===")


if __name__ == "__main__":
    run()
