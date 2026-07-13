import logging

from fastapi import APIRouter, Query, HTTPException
from cache_utils import cache_ttl
from db import supabase
from postgrest_utils import sanitizar_busca

logger = logging.getLogger(__name__)
router = APIRouter()


# P7: rv_ativos e rv_historico só mudam 1x/dia (ETL noturno) -- cache TTL em
# memória evita bater no Supabase a cada carregamento de página. maxsize
# folgado porque `q` (busca livre) pode gerar bastante combinação de chave.
@router.get("/ativos")
@cache_ttl(ttl_seconds=300, maxsize=500)
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


CAMPOS_ORDENAVEIS_SCREENER = {"roe", "lucro_liquido", "patrimonio_liquido"}


@router.get("/screener")
@cache_ttl(ttl_seconds=300, maxsize=200)
def get_screener(
    setor: str = Query(None, description="Filtra por setor de rv_ativos"),
    q: str = Query(None, description="Busca por ticker"),
    roe_min: float = Query(None, description="ROE mínimo, em %"),
    sort: str = Query("roe", description="Campo de ordenação: roe, lucro_liquido ou patrimonio_liquido"),
    order: str = Query("desc", description="asc ou desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Screener fundamentalista -- Lucro Líquido/Patrimônio Líquido/ROE
    extraídos do DFP da CVM (etl/fundamentos_cvm.py), cruzados com o
    cadastro de rv_ativos (nome/setor/tipo/market_cap).

    Cobertura é parcial -- nem toda ação ON/PN com cd_cvm resolvido tem
    Lucro/PL localizável no DFP consolidado do ano corrente (fraseado de
    conta divergente ou empresa sem relatório consolidado nesse ano); ver
    kanban do projeto pro funil completo, não hardcoded aqui pra não
    ficar desatualizado a cada nova safra do ETL.

    P/L é calculado aqui na resposta, não persistido em rv_fundamentos
    (decisão da migration 016): `market_cap / lucro_liquido`, só quando
    lucro_liquido > 0 -- P/L negativo não é comparável entre empresas."""
    if sort not in CAMPOS_ORDENAVEIS_SCREENER:
        raise HTTPException(status_code=400, detail=f"sort deve ser um de {sorted(CAMPOS_ORDENAVEIS_SCREENER)}")
    if order not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="order deve ser asc ou desc")

    # !inner só quando `setor` filtra o lado rv_ativos -- mesmo padrão de
    # anbima.py::get_debentures (evita descartar fundamentos sem filtro).
    ativos_embed = "rv_ativos" + ("!inner" if setor else "") + "(nome,setor,subsetor,tipo,market_cap)"

    query = (
        supabase.table("rv_fundamentos")
        .select(f"ticker,ano_referencia,lucro_liquido,patrimonio_liquido,roe,{ativos_embed}", count="exact")
        # roe pode ser NULL (patrimonio_liquido == 0, ver fundamentos_cvm.py) --
        # sem esse filtro, NULLS FIRST (padrão do Postgres em ORDER BY ... DESC)
        # jogava essas linhas pro topo do screener, na frente das ações com
        # maior ROE de verdade (achado de pair-review).
        .not_().is_(sort, "null")
        .order(sort, desc=(order != "asc"))
    )
    if setor:
        query = query.eq("rv_ativos.setor", setor)
    if q:
        termo = sanitizar_busca(q.strip())
        if termo:
            query = query.ilike("ticker", f"%{termo}%")
    if roe_min is not None:
        query = query.gte("roe", roe_min)

    inicio = (page - 1) * per_page
    result = query.range(inicio, inicio + per_page - 1).execute()

    data = []
    for r in result.data:
        ativo = r.pop("rv_ativos", None) or {}
        lucro = r.get("lucro_liquido")
        market_cap = ativo.get("market_cap")
        p_l = round(market_cap / lucro, 2) if (market_cap and lucro and lucro > 0) else None
        data.append({
            **r,
            "nome": ativo.get("nome"),
            "setor": ativo.get("setor"),
            "subsetor": ativo.get("subsetor"),
            "tipo": ativo.get("tipo"),
            "market_cap": market_cap,
            "p_l": p_l,
        })

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
@cache_ttl(ttl_seconds=300, maxsize=500)
def get_historico(ticker: str, limit: int = Query(252, ge=1, le=2000, description="Número de registros de pregão. Padrão: 252 (≈1 ano útil). Máx: 2000.")):
    """Retorna historico de pregao de um ativo."""
    ticker = ticker.upper()
    dados = _buscar_historico(ticker, limit)
    if not dados:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} nao encontrado.")
    return {"ticker": ticker, "data": dados}
