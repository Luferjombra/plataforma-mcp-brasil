from fastapi import APIRouter, Query, HTTPException
from db import supabase

router = APIRouter()


@router.get("/ativos")
def get_ativos(setor: str = Query(None), ativo: bool = Query(True)):
    """Lista ativos de renda variável."""
    query = supabase.table("rv_ativos").select("*").eq("ativo", ativo)
    if setor:
        query = query.eq("setor", setor)
    result = query.execute()
    return {"data": result.data, "total": len(result.data)}


@router.get("/historico/{ticker}")
def get_historico(ticker: str, limit: int = Query(252, ge=1, le=2000)):
    """Retorna histórico de pregão de um ativo."""
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
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} não encontrado.")
    return {"ticker": ticker, "data": result.data}
