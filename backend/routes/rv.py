import logging
from typing import Union

from fastapi import APIRouter, Query, HTTPException
from db import supabase

logger = logging.getLogger(__name__)
router = APIRouter()

TAMANHO_PAGINA = 1000


def _buscar_paginado(construir_query):
    """Pagina com .range() para não bater no limite padrão de 1000 linhas
    do PostgREST. `construir_query` é chamado de novo a cada página (uma
    query builder do Supabase não pode ser reexecutada) e deve retornar uma
    query/rpc builder SEM `.range()` — esta função aplica o range.

    Necessário desde que rv_ativos passou a cobrir o universo completo do
    COTAHIST (2.368 tickers, ver ADR-001) — antes da promoção a curadoria de
    ~30 tickers nunca chegava perto do limite."""
    todos = []
    inicio = 0
    while True:
        res = construir_query().range(inicio, inicio + TAMANHO_PAGINA - 1).execute()
        if not res.data:
            break
        todos.extend(res.data)
        if len(res.data) < TAMANHO_PAGINA:
            break
        inicio += TAMANHO_PAGINA
    return todos


@router.get("/ativos")
def get_ativos(setor: str = Query(None), ativo: bool = Query(True)):
    """Lista ativos RV com preco atual e variacao diaria calculada."""
    def construir_ativos():
        # .order() é obrigatório com paginação via LIMIT/OFFSET — sem ordem
        # explícita o Postgres não garante a mesma ordem entre execuções,
        # o que pode pular ou duplicar tickers entre uma página e outra.
        query = supabase.table("rv_ativos").select("*").eq("ativo", ativo).order("ticker")
        if setor:
            query = query.eq("setor", setor)
        return query

    data = _buscar_paginado(construir_ativos)

    # Variacao diaria calculada no banco via LAG() (migration 004)
    try:
        variacao = _buscar_paginado(lambda: supabase.rpc("rv_variacao_diaria"))
        por_ticker = {r["ticker"]: r for r in variacao}
        for a in data:
            v = por_ticker.get(a["ticker"], {})
            a["preco_atual"] = v.get("preco_atual")
            a["data_preco"]  = v.get("data_preco")
            a["var_dia_pct"] = v.get("var_dia_pct")
    except Exception as e:
        logger.warning(f"rv_variacao_diaria indisponivel ({e}); retornando ativos sem variacao.")
        for a in data:
            a.setdefault("preco_atual", None)
            a.setdefault("var_dia_pct", None)
            a.setdefault("data_preco", None)

    return {"data": data, "total": len(data)}


@router.get("/historico/{ticker}")
def get_historico(ticker: str, limit: Union[int, str] = Query(252, description="Número de registros de pregão (inteiro). Padrão: 252 (≈1 ano útil). Máx: 2000.")):
    """Retorna historico de pregao de um ativo."""
    ticker = ticker.upper()
    limit = max(1, min(int(limit), 2000))
    result = (
        supabase.table("rv_historico")
        .select("*")
        .eq("ticker", ticker)
        .order("data", desc=True)
        .limit(limit)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} nao encontrado.")
    return {"ticker": ticker, "data": result.data}
