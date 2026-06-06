from fastapi import APIRouter, Query, HTTPException
from db import supabase

router = APIRouter()


@router.get("/")
def get_fundos(
    classe: str = Query(None, description="Multimercado, Renda Fixa, Ações, FII"),
    gestor: str = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    """Lista fundos cadastrados."""
    query = supabase.table("fundos_cadastro").select("*").limit(limit)
    if classe:
        query = query.eq("classe_anbima", classe)
    if gestor:
        query = query.ilike("gestor", f"%{gestor}%")
    result = query.execute()
    return {"data": result.data, "total": len(result.data)}


@router.get("/analytics/{cnpj}")
def get_analytics(cnpj: str):
    """Retorna métricas analíticas de um fundo (Sharpe, Drawdown, etc)."""
    result = (
        supabase.table("fund_analytics_metrics")
        .select("*")
        .eq("cnpj", cnpj)
        .order("data_referencia", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Fundo não encontrado ou sem métricas.")
    return result.data[0]


@router.get("/historico/{cnpj}")
def get_historico_fundo(cnpj: str, limit: int = Query(252, ge=1, le=2000)):
    """Retorna histórico de cotas de um fundo."""
    result = (
        supabase.table("fundos_historico")
        .select("*")
        .eq("cnpj", cnpj)
        .order("data", desc=True)
        .limit(limit)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Fundo não encontrado.")
    return {"cnpj": cnpj, "data": result.data}
