import logging

from fastapi import APIRouter, Query, HTTPException
from db import supabase

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/ativos")
def get_ativos(setor: str = Query(None), ativo: bool = Query(True)):
    """Lista ativos RV com preco atual e variacao diaria calculada."""
    query = supabase.table("rv_ativos").select("*").eq("ativo", ativo)
    if setor:
        query = query.eq("setor", setor)
    ativos_result = query.execute()
    data = list(ativos_result.data)

    # Variacao diaria calculada no banco via LAG() (migration 004)
    try:
        variacao = supabase.rpc("rv_variacao_diaria").execute()
        por_ticker = {r["ticker"]: r for r in (variacao.data or [])}
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
def get_historico(ticker: str, limit: int = Query(252, ge=1, le=2000)):
    """Retorna historico de pregao de um ativo."""
    ticker = ticker.upper()
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
