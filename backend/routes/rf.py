"""
Rotas de Renda Fixa — Tesouro Direto
GET /rf/titulos          → lista todos os títulos com taxa atual
GET /rf/historico/{cod} → histórico de taxas de um título
"""

from typing import Union
from fastapi import APIRouter, Query
from db import supabase

router = APIRouter()

# Nomes amigáveis para exibição no frontend
NOMES_DISPLAY: dict[str, str] = {
    "LFT":   "Tesouro Selic",
    "IPCA":  "Tesouro IPCA+",
    "IPCAS": "Tesouro IPCA+ Juros Sem.",
    "PRE":   "Tesouro Prefixado",
    "PRES":  "Tesouro Prefixado Juros Sem.",
    "RENDA": "Tesouro RendA+",
    "EDUCA": "Tesouro Educa+",
    "IGPM":  "Tesouro IGP-M+",
}

# Cores por indexador (para serialização ao frontend)
CORES: dict[str, str] = {
    "SELIC": "#10b981",  # verde
    "IPCA":  "#3b82f6",  # azul
    "PRE":   "#f59e0b",  # amarelo
    "IGPM":  "#8b5cf6",  # roxo
    "OTHER": "#6b7280",  # cinza
}


@router.get("/titulos")
def get_titulos():
    """
    Retorna todos os títulos Tesouro com a taxa mais recente disponível.
    Apenas títulos com ativo=true (com dados nos últimos 30 dias) são retornados.
    """
    # 1. Buscar todos os títulos ativos
    res_titulos = (
        supabase.table("rf_titulos")
        .select("codigo,nome,indexador,data_vencimento,ativo")
        .eq("tipo", "Tesouro")
        .eq("ativo", True)
        .order("indexador")
        .execute()
    )
    titulos = res_titulos.data
    if not titulos:
        return {"data": [], "total": 0}

    # 2. Encontrar a data mais recente no histórico
    res_last = (
        supabase.table("rf_historico")
        .select("data")
        .order("data", desc=True)
        .limit(1)
        .execute()
    )
    latest_date = res_last.data[0]["data"] if res_last.data else None

    # 3. Buscar taxas para essa data
    taxas_map: dict[str, dict] = {}
    if latest_date:
        res_taxas = (
            supabase.table("rf_historico")
            .select("codigo,data,taxa_mercado,pu_mercado")
            .eq("data", latest_date)
            .execute()
        )
        for row in res_taxas.data:
            taxas_map[row["codigo"]] = row

    # 4. Montar resposta enriquecida
    codigo_para_tipo = {}
    for prefixo, tipo in [
        ("IPCAS_", "IPCAS"), ("PRES_", "PRES"), ("RENDA_", "RENDA"),
        ("EDUCA_", "EDUCA"), ("IPCA_", "IPCA"), ("PRE_", "PRE"),
        ("LFT_", "LFT"), ("IGPM_", "IGPM"),
    ]:
        pass  # monta mapa abaixo

    resultado = []
    for t in titulos:
        codigo = t["codigo"]
        tipo = codigo.split("_")[0] if "_" in codigo else "OTHER"
        taxa_info = taxas_map.get(codigo, {})
        resultado.append({
            **t,
            "tipo_curto":    tipo,
            "nome_display":  NOMES_DISPLAY.get(tipo, t["nome"]),
            "cor":           CORES.get(t.get("indexador", "OTHER"), CORES["OTHER"]),
            "taxa_atual":    taxa_info.get("taxa_mercado"),
            "pu_atual":      taxa_info.get("pu_mercado"),
            "data_taxa":     taxa_info.get("data"),
        })

    return {"data": resultado, "total": len(resultado), "data_referencia": latest_date}


@router.get("/historico/{codigo}")
def get_historico_rf(
    codigo: str,
    limit: Union[int, str] = Query(252, description="Número de registros (inteiro). Padrão: 252 (≈1 ano útil). Máx: 2000."),
):
    """Retorna o histórico de taxas/preços de um título. limit: número de pontos (padrão 252 = ~1 ano útil)."""
    limit = max(1, min(int(limit), 2000))
    res = (
        supabase.table("rf_historico")
        .select("codigo,data,taxa_mercado,pu_mercado,taxa_compra,pu_compra")
        .eq("codigo", codigo)
        .order("data", desc=True)
        .limit(limit)
        .execute()
    )
    return {"codigo": codigo, "data": res.data}
