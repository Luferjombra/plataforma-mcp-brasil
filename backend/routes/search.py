from fastapi import APIRouter, Query
from db import supabase

router = APIRouter()

@router.get("")
def search(q: str = Query(..., min_length=1, max_length=100), limit: int = Query(5, ge=1, le=20)):
    """Busca ativos, títulos e fundos por nome ou código."""
    q = q.strip()
    pattern = f"%{q}%"

    rv = (
        supabase.table("rv_ativos")
        .select("ticker, nome, setor, tipo")
        .or_(f"ticker.ilike.{pattern},nome.ilike.{pattern}")
        .eq("ativo", True)
        .limit(limit)
        .execute()
    )

    rf = (
        supabase.table("rf_titulos")
        .select("codigo, nome_display, indexador, taxa_atual, data_vencimento")
        .or_(f"codigo.ilike.{pattern},nome_display.ilike.{pattern},indexador.ilike.{pattern}")
        .eq("ativo", True)
        .limit(limit)
        .execute()
    )

    fundos_q = (
        supabase.table("fundos_cadastro")
        .select("cnpj, nome_fundo, gestor, tipo_fundo")
        .or_(f"nome_fundo.ilike.{pattern},gestor.ilike.{pattern},cnpj.ilike.{pattern}")
        .limit(limit)
        .execute()
    )

    return {
        "q": q,
        "rv": rv.data or [],
        "rf": rf.data or [],
        "fundos": fundos_q.data or [],
        "total": len(rv.data or []) + len(rf.data or []) + len(fundos_q.data or []),
    }
