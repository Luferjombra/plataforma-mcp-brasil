import re
from db import supabase

# Padrões para identificar ativos
RE_TICKER = re.compile(r'\b([A-Z]{4}[0-9]{1,2})\b')
RE_CNPJ = re.compile(r'\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}')


def _identificar_ativo(pergunta: str) -> tuple[str | None, str | None]:
    """Retorna (ativo, classe): ex ('PETR4', 'rv') ou (cnpj, 'fundo')."""
    upper = pergunta.upper()

    ticker = RE_TICKER.search(upper)
    if ticker:
        return ticker.group(1), "rv"

    cnpj = RE_CNPJ.search(pergunta)
    if cnpj:
        return cnpj.group(0), "fundo"

    # Indicadores
    for serie in ["IPCA", "SELIC", "CDI", "PIB"]:
        if serie in upper:
            return serie.lower(), "indicador"

    return None, None


def _classificar_intencao(pergunta: str) -> str:
    lower = pergunta.lower()
    if any(w in lower for w in ["risco", "drawdown", "volatil", "sharpe"]):
        return "risco"
    if any(w in lower for w in ["compar", "versus", "vs", "melhor", "pior"]):
        return "comparacao"
    if any(w in lower for w in ["rentab", "retorno", "rendeu", "performance"]):
        return "performance"
    return "explicacao"


async def build_context(pergunta: str) -> dict:
    ativo, classe = _identificar_ativo(pergunta)
    intencao = _classificar_intencao(pergunta)
    dados = {}

    if classe == "rv" and ativo:
        result = (
            supabase.table("rv_historico")
            .select("data,fechamento_adj,volume")
            .eq("ticker", ativo)
            .order("data", desc=True)
            .limit(30)
            .execute()
        )
        dados = {"ticker": ativo, "historico": result.data}

    elif classe == "fundo" and ativo:
        hist = (
            supabase.table("fundos_historico")
            .select("data,valor_cota,patrimonio_liq")
            .eq("cnpj", ativo)
            .order("data", desc=True)
            .limit(30)
            .execute()
        )
        metricas = (
            supabase.table("fund_analytics_metrics")
            .select("*")
            .eq("cnpj", ativo)
            .order("data_referencia", desc=True)
            .limit(1)
            .execute()
        )
        dados = {"cnpj": ativo, "historico": hist.data, "metricas": metricas.data}

    elif classe == "indicador" and ativo:
        result = (
            supabase.table("indicadores_economicos")
            .select("data,valor,unidade")
            .eq("serie", ativo)
            .order("data", desc=True)
            .limit(24)
            .execute()
        )
        dados = {"serie": ativo, "historico": result.data}

    return {"ativo": ativo, "intencao": intencao, "dados": dados}
