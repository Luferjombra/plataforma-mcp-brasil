from fastapi import APIRouter, Query, HTTPException
from db import supabase

router = APIRouter()


@router.get("/ativos")
def get_ativos(setor: str = Query(None), ativo: bool = Query(True)):
    """Lista ativos RV com preco atual e variacao diaria calculada."""
    query = supabase.table("rv_ativos").select("*").eq("ativo", ativo)
    if setor:
        query = query.eq("setor", setor)
    ativos_result = query.execute()
    data = list(ativos_result.data)

    # Busca os ultimos 2 pregoes para calcular variacao diaria
    try:
        recent = (
            supabase.table("rv_historico")
            .select("data, ticker, fechamento")
            .order("data", desc=True)
            .limit(600)
            .execute()
        )
        rows = recent.data or []
        all_dates = sorted(set(r["data"] for r in rows), reverse=True)

        if all_dates:
            d1 = all_dates[0]
            d2 = all_dates[1] if len(all_dates) > 1 else None
            d1_prices = {r["ticker"]: r["fechamento"] for r in rows if r["data"] == d1}
            d2_prices = {r["ticker"]: r["fechamento"] for r in rows if r["data"] == d2} if d2 else {}

            for a in data:
                ticker = a["ticker"]
                preco = d1_prices.get(ticker)
                ant   = d2_prices.get(ticker)
                a["preco_atual"]  = preco
                a["data_preco"]   = d1 if preco is not None else None
                if preco is not None and ant and ant > 0:
                    a["var_dia_pct"] = round((preco - ant) / ant * 100, 2)
                else:
                    a["var_dia_pct"] = None
    except Exception:
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
