from typing import Union
from fastapi import APIRouter, Query, HTTPException
from db import supabase

router = APIRouter()


@router.get("/")
def get_indicadores(
    serie: str = Query(None, description="ipca, selic, cdi, pib"),
    limit: Union[int, str] = Query(252, description="Número de registros (inteiro). Padrão: 252. Máx: 2000."),
):
    """Retorna histórico de indicadores econômicos."""
    limit = max(1, min(int(limit), 2000))
    query = supabase.table("indicadores_economicos").select("*").order("data", desc=True).limit(limit)

    if serie:
        query = query.eq("serie", serie.lower())

    result = query.execute()
    return {"data": result.data, "total": len(result.data)}


@router.get("/series")
def get_series_disponiveis():
    """Lista as séries disponíveis no banco."""
    result = supabase.table("indicadores_economicos").select("serie").execute()
    series = list({row["serie"] for row in result.data})
    return {"series": sorted(series)}
