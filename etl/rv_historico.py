"""
ETL — Renda Variável (B3)
Fonte: Yahoo Finance via yfinance
Popula: rv_ativos + rv_historico
"""

import math
import yfinance as yf
import datetime
from config import supabase


def safe_float(value) -> float | None:
    """Converte valor para float, retornando None se NaN/None/inválido."""
    try:
        f = float(value)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None

# Tickers iniciais — principais ações do Ibovespa
# yfinance exige sufixo .SA para ativos B3
ATIVOS = [
    {"ticker": "PETR4", "nome": "Petróleo Brasileiro S.A. - Petrobras PN", "setor": "Petróleo e Gás", "tipo": "PN"},
    {"ticker": "VALE3", "nome": "Vale S.A. ON", "setor": "Mineração", "tipo": "ON"},
    {"ticker": "ITUB4", "nome": "Itaú Unibanco Holding S.A. PN", "setor": "Financeiro", "tipo": "PN"},
    {"ticker": "BBDC4", "nome": "Banco Bradesco S.A. PN", "setor": "Financeiro", "tipo": "PN"},
    {"ticker": "BBAS3", "nome": "Banco do Brasil S.A. ON", "setor": "Financeiro", "tipo": "ON"},
    {"ticker": "WEGE3", "nome": "WEG S.A. ON", "setor": "Indústria", "tipo": "ON"},
    {"ticker": "RENT3", "nome": "Localiza Rent a Car S.A. ON", "setor": "Serviços", "tipo": "ON"},
    {"ticker": "LREN3", "nome": "Lojas Renner S.A. ON", "setor": "Varejo", "tipo": "ON"},
    {"ticker": "MGLU3", "nome": "Magazine Luiza S.A. ON", "setor": "Varejo", "tipo": "ON"},
    {"ticker": "ABEV3", "nome": "Ambev S.A. ON", "setor": "Consumo", "tipo": "ON"},
    {"ticker": "SUZB3", "nome": "Suzano S.A. ON", "setor": "Papel e Celulose", "tipo": "ON"},
    {"ticker": "RDOR3", "nome": "Rede D'Or São Luiz S.A. ON", "setor": "Saúde", "tipo": "ON"},
    {"ticker": "HAPV3", "nome": "Hapvida Participações e Investimentos S.A. ON", "setor": "Saúde", "tipo": "ON"},
    {"ticker": "CSAN3", "nome": "Cosan S.A. ON", "setor": "Energia", "tipo": "ON"},
    {"ticker": "ELET3", "nome": "Centrais Elétricas Brasileiras S.A. ON", "setor": "Energia", "tipo": "ON"},
    {"ticker": "VIVT3", "nome": "Telefônica Brasil S.A. ON", "setor": "Telecomunicações", "tipo": "ON"},
]

DATA_INICIO = "2020-01-01"


def upsert_ativo(ativo: dict, info: dict, status: str = "ativo") -> None:
    """Insere/atualiza cadastro do ativo."""
    record = {
        "ticker": ativo["ticker"],
        "nome": ativo["nome"],
        "setor": ativo["setor"],
        "tipo": ativo["tipo"],
        "market_cap": info.get("marketCap"),
        "free_float": None,
        "ativo": status == "ativo",
        "status": status,
    }
    supabase.table("rv_ativos").upsert(record, on_conflict="ticker").execute()


def upsert_historico(ticker: str, df) -> int:
    """Converte DataFrame do yfinance e faz upsert no Supabase."""
    registros = []
    for data, row in df.iterrows():
        try:
            fechamento = safe_float(row["Close"])
            if fechamento is None:
                continue  # linha sem fechamento é inválida
            registros.append({
                "ticker": ticker,
                "data": data.date().isoformat(),
                "abertura": safe_float(row["Open"]),
                "maxima": safe_float(row["High"]),
                "minima": safe_float(row["Low"]),
                "fechamento": fechamento,
                "fechamento_adj": safe_float(row.get("Adj Close", row["Close"])),
                "volume": safe_float(row["Volume"]),
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


def registrar_log(ticker: str, status: str, novos: int, total: int, erro: str = None):
    supabase.table("etl_log").insert({
        "job_nome": f"rv_{ticker}",
        "status": status,
        "registros_novos": novos,
        "registros_total": total,
        "erro_msg": erro,
        "data_inicio_carga": DATA_INICIO,
        "data_fim_carga": datetime.date.today().isoformat(),
    }).execute()


def run():
    print("=== ETL Renda Variável (B3) ===\n")

    for ativo in ATIVOS:
        ticker = ativo["ticker"]
        ticker_yf = f"{ticker}.SA"
        print(f"→ Baixando {ticker}...")

        try:
            yf_ticker = yf.Ticker(ticker_yf)
            info = {}
            try:
                info = yf_ticker.info or {}
            except Exception:
                pass

            # Tenta buscar histórico — inclui período mais amplo para pegar último pregão
            df = yf_ticker.history(start=DATA_INICIO, auto_adjust=False)

            if df.empty:
                # Tenta período mais amplo para capturar último pregão antes do delisting
                df = yf_ticker.history(period="max", auto_adjust=False)

            if df.empty:
                print(f"  ⚠ Delisted sem dados históricos — registrando como delisted\n")
                upsert_ativo(ativo, info, status="delisted")
                registrar_log(ticker, "partial", 0, 0, "delisted - sem dados históricos")
                continue

            # Remove timezone do índice
            df.index = df.index.tz_localize(None)

            # Determina status: se último pregão > 30 dias atrás, provável delisted
            ultimo_pregao = df.index[-1].date()
            dias_sem_dados = (datetime.date.today() - ultimo_pregao).days
            status = "delisted" if dias_sem_dados > 30 else "ativo"

            if status == "delisted":
                print(f"  ⚠ Último pregão: {ultimo_pregao} ({dias_sem_dados} dias atrás) → marcado como delisted")

            upsert_ativo(ativo, info, status=status)
            salvos = upsert_historico(ticker, df)
            registrar_log(ticker, "success", salvos, len(df))
            print(f"  ✓ {salvos} registros salvos | status: {status}\n")

        except Exception as e:
            registrar_log(ticker, "error", 0, 0, str(e))
            print(f"  ✗ Erro: {e}\n")

    print("=== Concluído ===")


if __name__ == "__main__":
    run()
