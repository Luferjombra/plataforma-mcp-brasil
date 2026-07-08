import asyncio
from typing import Union

from fastapi import APIRouter, Query
from db import supabase
from postgrest_utils import sanitizar_busca

router = APIRouter()


def _buscar_rv(pattern: str, limit: int):
    return (
        supabase.table("rv_ativos")
        .select("ticker, nome, setor, tipo")
        .or_(f"ticker.ilike.{pattern},nome.ilike.{pattern}")
        .eq("ativo", True)
        .limit(limit)
        .execute()
    )


def _buscar_rf(pattern: str, limit: int):
    return (
        supabase.table("rf_titulos")
        .select("codigo, nome_display, indexador, taxa_atual, data_vencimento")
        .or_(f"codigo.ilike.{pattern},nome_display.ilike.{pattern},indexador.ilike.{pattern}")
        .eq("ativo", True)
        .limit(limit)
        .execute()
    )


def _buscar_fundos(pattern: str, limit: int):
    return (
        supabase.table("fundos_cadastro")
        .select("cnpj, nome_fundo, gestor, tipo_fundo")
        .or_(f"nome_fundo.ilike.{pattern},gestor.ilike.{pattern},cnpj.ilike.{pattern}")
        .limit(limit)
        .execute()
    )


@router.get("")
async def search(q: str = Query(..., min_length=1, max_length=100), limit: Union[int, str] = Query(5, description="Número máximo de resultados por categoria (inteiro). Padrão: 5. Máx: 20.")):
    """Busca ativos, títulos e fundos por nome ou código (3 queries em paralelo)."""
    limit = max(1, min(int(limit), 20))
    q = q.strip()
    pattern = f"%{sanitizar_busca(q)}%"

    # Cliente supabase é síncrono — roda as 3 buscas em threads concorrentes
    rv, rf, fundos_q = await asyncio.gather(
        asyncio.to_thread(_buscar_rv, pattern, limit),
        asyncio.to_thread(_buscar_rf, pattern, limit),
        asyncio.to_thread(_buscar_fundos, pattern, limit),
    )

    return {
        "q": q,
        "rv": rv.data or [],
        "rf": rf.data or [],
        "fundos": fundos_q.data or [],
        "total": len(rv.data or []) + len(rf.data or []) + len(fundos_q.data or []),
    }
