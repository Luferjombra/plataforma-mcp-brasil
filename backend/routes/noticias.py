from fastapi import APIRouter, Query
from db import supabase

router = APIRouter()


@router.get("/")
def get_noticias(
    categoria: str = Query(None, description="Macro, Renda Variável, Renda Fixa, Fundos"),
    ticker: str = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Retorna feed de notícias financeiras."""
    query = (
        supabase.table("noticias")
        .select("*")
        .order("publicado_em", desc=True)
        .limit(limit)
    )
    if categoria:
        query = query.eq("categoria", categoria)
    result = query.execute()

    # filtro por ticker (array contains)
    data = result.data
    if ticker:
        data = [n for n in data if ticker.upper() in (n.get("tickers_rel") or [])]

    return {"data": data, "total": len(data)}
