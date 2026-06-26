"""
Rotas ANBIMA — Índices IMA/IDA, Debêntures, VNA
GET /anbima/indices             → lista séries disponíveis com último valor
GET /anbima/indices/{serie}     → histórico de um índice
GET /anbima/debentures          → lista debêntures com preço mais recente
GET /anbima/debentures/{codigo} → histórico de preços de uma debênture
GET /anbima/vna/{tipo}          → histórico VNA de NTN-B, LFT ou NTN-C
"""

from typing import Union
from fastapi import APIRouter, Query, HTTPException
from db import supabase

router = APIRouter()

INDICES_DISPONIVEIS = [
    "IMA-B", "IMA-B 5", "IMA-B 5+", "IMA-S", "IMA-GERAL",
    "IRF-M", "IRF-M 1", "IRF-M 1+",
    "IDA-DI", "IDA-GERAL", "IDA-IPCA",
]


@router.get("/indices")
def get_indices_resumo():
    """Retorna o último valor de cada índice IMA/IDA disponível."""
    res_last = (
        supabase.table("anbima_indices")
        .select("data")
        .order("data", desc=True)
        .limit(1)
        .execute()
    )
    if not res_last.data:
        return {"data": [], "total": 0}

    ultima_data = res_last.data[0]["data"]

    res = (
        supabase.table("anbima_indices")
        .select("indice,data,numero_indice,retorno_dia,retorno_mes,retorno_ano,duration")
        .eq("data", ultima_data)
        .order("indice")
        .execute()
    )

    return {
        "data": res.data or [],
        "total": len(res.data or []),
        "data_referencia": ultima_data,
        "series_disponiveis": INDICES_DISPONIVEIS,
    }


@router.get("/indices/{serie}")
def get_historico_indice(
    serie: str,
    limit: Union[int, str] = Query(252, description="Número de registros. Padrão: 252 (≈1 ano útil). Máx: 2000."),
):
    """Retorna histórico de um índice ANBIMA (IMA-B, IDA-DI, etc.)."""
    limit = max(1, min(int(limit), 2000))

    serie_decoded = serie.replace("-", " ").upper() if "+" not in serie else serie.upper()
    serie_options = [serie, serie_decoded, serie.upper()]

    res = None
    for s in serie_options:
        res = (
            supabase.table("anbima_indices")
            .select("indice,data,numero_indice,retorno_dia,retorno_mes,retorno_ano,duration")
            .eq("indice", s)
            .order("data", desc=True)
            .limit(limit)
            .execute()
        )
        if res.data:
            break

    if not res or not res.data:
        raise HTTPException(
            status_code=404,
            detail=f"Índice '{serie}' não encontrado. Disponíveis: {', '.join(INDICES_DISPONIVEIS)}"
        )

    return {"indice": res.data[0]["indice"], "data": res.data}


@router.get("/debentures")
def get_debentures(
    indexador: str = Query(None, description="Filtrar por indexador: CDI, IPCA, PRE"),
    limit: Union[int, str] = Query(50, description="Número de debêntures. Padrão: 50. Máx: 500."),
):
    """Lista debêntures com preço indicativo mais recente."""
    limit = max(1, min(int(limit), 500))

    res_last = (
        supabase.table("anbima_debentures_historico")
        .select("data")
        .order("data", desc=True)
        .limit(1)
        .execute()
    )
    if not res_last.data:
        return {"data": [], "total": 0}

    ultima_data = res_last.data[0]["data"]

    query = (
        supabase.table("anbima_debentures_historico")
        .select("codigo,data,pu_mercado,taxa_indicativa,spread_ipca,spread_cdi,duration,volume_negociado,"
                "anbima_debentures_cadastro(nome_emissor,indexador,data_vencimento,rating_nota,setor)")
        .eq("data", ultima_data)
        .order("volume_negociado", desc=True)
        .limit(limit)
    )

    if indexador:
        pass

    res = query.execute()

    return {
        "data": res.data or [],
        "total": len(res.data or []),
        "data_referencia": ultima_data,
    }


@router.get("/debentures/{codigo}")
def get_historico_debenture(
    codigo: str,
    limit: Union[int, str] = Query(252, description="Número de registros. Padrão: 252. Máx: 2000."),
):
    """Retorna histórico de preços e taxas de uma debênture."""
    limit = max(1, min(int(limit), 2000))

    cadastro = (
        supabase.table("anbima_debentures_cadastro")
        .select("*")
        .eq("codigo", codigo.upper())
        .limit(1)
        .execute()
    )
    if not cadastro.data:
        raise HTTPException(status_code=404, detail=f"Debênture '{codigo}' não encontrada.")

    historico = (
        supabase.table("anbima_debentures_historico")
        .select("data,pu_par,pu_mercado,taxa_indicativa,spread_ipca,spread_cdi,duration,volume_negociado")
        .eq("codigo", codigo.upper())
        .order("data", desc=True)
        .limit(limit)
        .execute()
    )

    return {
        "codigo": codigo.upper(),
        "cadastro": cadastro.data[0],
        "historico": historico.data or [],
    }


@router.get("/vna/{tipo}")
def get_vna(
    tipo: str,
    limit: Union[int, str] = Query(252, description="Número de registros. Padrão: 252. Máx: 2000."),
):
    """Retorna histórico do VNA (Valor Nominal de Atualização) de NTN-B, LFT ou NTN-C."""
    limit = max(1, min(int(limit), 2000))

    tipo_up = tipo.upper()
    if tipo_up not in ("NTN-B", "LFT", "NTN-C"):
        raise HTTPException(
            status_code=422,
            detail="Tipo inválido. Use: NTN-B, LFT ou NTN-C"
        )

    res = (
        supabase.table("anbima_titulos_vna")
        .select("codigo,data,vna")
        .eq("codigo", tipo_up)
        .order("data", desc=True)
        .limit(limit)
        .execute()
    )

    return {"codigo": tipo_up, "data": res.data or []}
