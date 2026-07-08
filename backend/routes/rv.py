import logging

from fastapi import APIRouter, Query, HTTPException
from db import supabase
from postgrest_utils import sanitizar_busca

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/ativos")
def get_ativos(
    setor: str = Query(None),
    ativo: bool = Query(True),
    q: str = Query(None, description="Busca por ticker ou nome"),
    tipo: str = Query(None, description="Filtra por tipo exato (ex: FII)"),
    excluir_fii: bool = Query(False, description="Exclui tipo=FII (aba 'Ações' do frontend)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
):
    """Lista ativos RV paginada, com busca por ticker/nome e preço/variação
    diária calculados no banco.

    Paginação server-side (ADR-001, Fase 2, item E2): rv_ativos cobre o
    universo completo do COTAHIST (2.368 tickers) desde o corte — devolver
    tudo de uma vez sobrecarregava o frontend com um array gigante filtrado
    no browser. `q` busca por ticker/nome via ilike; sanitizado contra
    filter injection no `.or_()` do PostgREST (mesmo padrão de F9 em
    backend/routes/search.py)."""
    query = supabase.table("rv_ativos").select("*", count="exact").eq("ativo", ativo).order("ticker")
    if setor:
        query = query.eq("setor", setor)
    if tipo:
        query = query.eq("tipo", tipo)
    if excluir_fii:
        query = query.neq("tipo", "FII")
    if q:
        termo = sanitizar_busca(q.strip())
        if termo:
            query = query.or_(f"ticker.ilike.%{termo}%,nome.ilike.%{termo}%")

    inicio = (page - 1) * per_page
    result = query.range(inicio, inicio + per_page - 1).execute()
    data = list(result.data)

    # Variacao diaria calculada no banco via LAG() (migration 004) -- só
    # para os tickers desta página, não o universo inteiro.
    try:
        tickers_pagina = [a["ticker"] for a in data]
        if tickers_pagina:
            variacao = supabase.rpc("rv_variacao_diaria").in_("ticker", tickers_pagina).execute()
            por_ticker = {r["ticker"]: r for r in (variacao.data or [])}
        else:
            por_ticker = {}
        for a in data:
            v = por_ticker.get(a["ticker"], {})
            a["preco_atual"] = v.get("preco_atual")
            a["data_preco"]  = v.get("data_preco")
            a["var_dia_pct"] = v.get("var_dia_pct")
    except Exception as e:
        logger.warning(f"rv_variacao_diaria indisponivel ({e}); retornando ativos sem variacao.")
        for a in data:
            a.setdefault("preco_atual", None)
            a.setdefault("var_dia_pct", None)
            a.setdefault("data_preco", None)

    return {"data": data, "total": result.count or 0, "page": page, "per_page": per_page}


TAMANHO_PAGINA_HISTORICO = 1000


def _buscar_historico(ticker: str, limit: int) -> list[dict]:
    """Busca histórico de um ticker em blocos de até 1000 linhas via
    `.range()`. `limit` aceita até 2000 (F14), mas um único `.limit()`
    fica sujeito ao teto padrão de 1000 linhas do PostgREST -- mesma
    classe de bug do F13/E2 em `/rv/ativos`, aqui não observada hoje só
    porque nenhum ticker do universo tem mais de 1000 candles."""
    registros: list[dict] = []
    inicio = 0
    while len(registros) < limit:
        fim = min(inicio + TAMANHO_PAGINA_HISTORICO, limit) - 1
        pagina = (
            supabase.table("rv_historico")
            .select("*")
            .eq("ticker", ticker)
            .order("data", desc=True)
            .range(inicio, fim)
            .execute()
        )
        lote = pagina.data or []
        registros.extend(lote)
        if len(lote) < (fim - inicio + 1):
            break  # acabou o histórico antes de atingir `limit`
        inicio += TAMANHO_PAGINA_HISTORICO
    return registros


@router.get("/historico/{ticker}")
def get_historico(ticker: str, limit: int = Query(252, ge=1, le=2000, description="Número de registros de pregão. Padrão: 252 (≈1 ano útil). Máx: 2000.")):
    """Retorna historico de pregao de um ativo."""
    ticker = ticker.upper()
    dados = _buscar_historico(ticker, limit)
    if not dados:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} nao encontrado.")
    return {"ticker": ticker, "data": dados}
