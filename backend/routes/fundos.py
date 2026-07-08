from fastapi import APIRouter, Query, HTTPException
from db import supabase

router = APIRouter()

# CNPJs dos fundos monitorados pela plataforma
# ATENÇÃO: duplicado de etl/fundos.py::CNPJS_ALVO (backend e ETL são deploys
# separados, sem import cruzado) -- ao adicionar/remover um fundo, atualizar
# as duas listas. Achado de revisão: esquecer aqui faz o ETL gravar dado
# certinho no banco enquanto o fundo simplesmente não aparece no site.
CNPJS_ALVO = [
    "04.222.368/0001-55",  # Verde PVT Multimercado
    "04.311.271/0001-19",  # PS Verde D1
    "01.221.890/0001-24",  # CSHG Verde FIC FIM
    "03.536.908/0001-02",  # CSHG Verde AM Star
    "26.324.289/0001-98",  # Kinea Infra I FIF
    "26.324.298/0001-89",  # Kinea Infra FIC
    "00.947.958/0001-94",  # Opportunity Market
    "05.775.774/0001-08",  # Alaska Poland
]

# Nomes de exibição para o frontend
NOMES_DISPLAY = {
    "04.222.368/0001-55": "Verde PVT Multimercado",
    "04.311.271/0001-19": "PS Verde D1",
    "01.221.890/0001-24": "CSHG Verde FIC FIM",
    "03.536.908/0001-02": "CSHG Verde AM Star",
    "26.324.289/0001-98": "Kinea Infra I FIF",
    "26.324.298/0001-89": "Kinea Infra FIC",
    "00.947.958/0001-94": "Opportunity Market",
    "05.775.774/0001-08": "Alaska Poland",
}


@router.get("/")
def get_fundos(
    classe: str = Query(None, description="Multimercado, Renda Fixa, Ações, FII"),
    gestor: str = Query(None),
    limit: int = Query(50, ge=1, le=500, description="Número de fundos a retornar. Padrão: 50. Máx: 500."),
):
    """Lista fundos monitorados pela plataforma."""
    query = (
        supabase.table("fundos_cadastro")
        .select("*")
        .in_("cnpj", CNPJS_ALVO)
        .limit(limit)
    )
    if classe:
        query = query.eq("classe_anbima", classe)
    if gestor:
        query = query.ilike("gestor", f"%{gestor}%")
    result = query.execute()
    # Injeta nome de exibição
    for fundo in result.data:
        cnpj = fundo.get("cnpj", "")
        if cnpj in NOMES_DISPLAY:
            fundo["nome_display"] = NOMES_DISPLAY[cnpj]
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


@router.get("/historico/{cnpj:path}")
def get_historico_fundo(cnpj: str, limit: int = Query(252, ge=1, le=2000, description="Número de registros de cota. Padrão: 252. Máx: 2000.")):
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
