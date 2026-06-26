"""
Rotas ANBIMA — Índices IMA/IDA, Debêntures, CRI, CRA, VNA
GET /anbima/indices             → lista séries disponíveis com último valor
GET /anbima/indices/{serie}     → histórico de um índice
GET /anbima/debentures          → lista debêntures com preço mais recente
GET /anbima/debentures/{codigo} → histórico de preços de uma debênture
GET /anbima/cri                 → lista CRI com preço mais recente
GET /anbima/cri/{codigo}        → histórico de preços de um CRI
GET /anbima/cra                 → lista CRA com preço mais recente
GET /anbima/cra/{codigo}        → histórico de preços de um CRA
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


def _get_sparklines(tipo: str, n: int) -> dict:
    """Retorna as últimas N taxas_indicativas de cada ativo, por código."""
    tabela = f"anbima_{tipo}_historico"
    res = (
        supabase.table(tabela)
        .select("data,codigo,taxa_indicativa")
        .order("data", desc=True)
        .limit(min(n * 300, 2000))
        .execute()
    )
    if not res.data:
        return {}

    datas_vistas: list[str] = []
    datas_set: set[str] = set()
    for row in res.data:
        d = row["data"]
        if d not in datas_set:
            datas_set.add(d)
            datas_vistas.append(d)
        if len(datas_vistas) >= n:
            break

    datas_validas = set(datas_vistas)
    from collections import defaultdict
    series: dict[str, list[float]] = defaultdict(list)
    rows_filtrados = sorted(
        [r for r in res.data if r["data"] in datas_validas and r["taxa_indicativa"] is not None],
        key=lambda x: x["data"],
    )
    for row in rows_filtrados:
        series[row["codigo"]].append(float(row["taxa_indicativa"]))

    return dict(series)


@router.get("/debentures/sparklines")
def get_debentures_sparklines(
    n: int = Query(7, ge=2, le=30, description="Número de datas de referência"),
):
    """Últimas N taxas_indicativas por debênture (para sparklines)."""
    return {"data": _get_sparklines("debentures", n)}


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


def _get_credito_privado_lista(tipo: str, indexador: str | None, limit: int):
    """Retorna lista de CRI ou CRA com preço mais recente."""
    tabela_h = f"anbima_{tipo}_historico"
    tabela_c = f"anbima_{tipo}_cadastro"

    res_last = (
        supabase.table(tabela_h)
        .select("data")
        .order("data", desc=True)
        .limit(1)
        .execute()
    )
    if not res_last.data:
        return {"data": [], "total": 0}

    ultima_data = res_last.data[0]["data"]

    join_col = f"{tabela_c}(cedente,securitizadora,indexador,data_vencimento,rating_nota,serie)"
    query = (
        supabase.table(tabela_h)
        .select(f"codigo,data,pu_mercado,taxa_indicativa,spread_ipca,spread_cdi,duration,volume_negociado,{join_col}")
        .eq("data", ultima_data)
        .order("volume_negociado", desc=True)
        .limit(limit)
    )
    res = query.execute()
    return {"data": res.data or [], "total": len(res.data or []), "data_referencia": ultima_data}


def _get_credito_privado_historico(tipo: str, codigo: str, limit: int):
    """Retorna histórico de um CRI ou CRA."""
    tabela_h = f"anbima_{tipo}_historico"
    tabela_c = f"anbima_{tipo}_cadastro"

    cadastro = (
        supabase.table(tabela_c)
        .select("*")
        .eq("codigo", codigo.upper())
        .limit(1)
        .execute()
    )
    if not cadastro.data:
        raise HTTPException(status_code=404, detail=f"{tipo.upper()} '{codigo}' não encontrado.")

    historico = (
        supabase.table(tabela_h)
        .select("data,pu_par,pu_mercado,taxa_indicativa,spread_ipca,spread_cdi,duration,volume_negociado")
        .eq("codigo", codigo.upper())
        .order("data", desc=True)
        .limit(limit)
        .execute()
    )
    return {"codigo": codigo.upper(), "cadastro": cadastro.data[0], "historico": historico.data or []}


@router.get("/cri/sparklines")
def get_cri_sparklines(
    n: int = Query(7, ge=2, le=30, description="Número de datas de referência"),
):
    """Últimas N taxas_indicativas por CRI (para sparklines)."""
    return {"data": _get_sparklines("cri", n)}


@router.get("/cri")
def get_cri(
    indexador: str = Query(None, description="Filtrar por indexador: CDI, IPCA, PRE, TR"),
    limit: Union[int, str] = Query(50, description="Número de CRIs. Padrão: 50. Máx: 500."),
):
    """Lista CRI (Certificados de Recebíveis Imobiliários) com preço indicativo mais recente."""
    return _get_credito_privado_lista("cri", indexador, max(1, min(int(limit), 500)))


@router.get("/cri/{codigo}")
def get_historico_cri(
    codigo: str,
    limit: Union[int, str] = Query(252, description="Número de registros. Padrão: 252. Máx: 2000."),
):
    """Retorna histórico de preços e taxas de um CRI."""
    return _get_credito_privado_historico("cri", codigo, max(1, min(int(limit), 2000)))


@router.get("/cra/sparklines")
def get_cra_sparklines(
    n: int = Query(7, ge=2, le=30, description="Número de datas de referência"),
):
    """Últimas N taxas_indicativas por CRA (para sparklines)."""
    return {"data": _get_sparklines("cra", n)}


@router.get("/cra")
def get_cra(
    indexador: str = Query(None, description="Filtrar por indexador: CDI, IPCA, PRE, IGPM"),
    limit: Union[int, str] = Query(50, description="Número de CRAs. Padrão: 50. Máx: 500."),
):
    """Lista CRA (Certificados de Recebíveis do Agronegócio) com preço indicativo mais recente."""
    return _get_credito_privado_lista("cra", indexador, max(1, min(int(limit), 500)))


@router.get("/cra/{codigo}")
def get_historico_cra(
    codigo: str,
    limit: Union[int, str] = Query(252, description="Número de registros. Padrão: 252. Máx: 2000."),
):
    """Retorna histórico de preços e taxas de um CRA."""
    return _get_credito_privado_historico("cra", codigo, max(1, min(int(limit), 2000)))


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
