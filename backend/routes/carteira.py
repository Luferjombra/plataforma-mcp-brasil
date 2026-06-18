"""
Rotas de Carteira — rastreamento de posições e métricas de performance.
POST   /carteira/posicoes           → adicionar posição
GET    /carteira/posicoes           → listar posições com preço atual e P&L
DELETE /carteira/posicoes/{id}      → remover posição
GET    /carteira/analise            → P&L consolidado + métricas de risco
"""
import uuid
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from carteira.metricas import calcular_todas
from db import supabase

router = APIRouter()


class PosicaoCreate(BaseModel):
    ticker: str = Field(..., description="Ticker B3 (ex: PETR4, VALE3, MXRF11)")
    tipo: str = Field(..., description="Tipo do ativo: 'acao', 'fii' ou 'etf'")
    quantidade: float = Field(..., gt=0, description="Quantidade de cotas/ações compradas")
    preco_medio: float = Field(..., gt=0, description="Preço médio de compra em R$")
    data_entrada: str = Field(
        default_factory=lambda: date.today().isoformat(),
        description="Data de entrada no formato YYYY-MM-DD. Padrão: hoje.",
    )


@router.post("/posicoes", status_code=201)
def add_posicao(
    body: PosicaoCreate,
    session_id: str = Query(..., description="ID da sessão. Isola carteiras entre usuários."),
):
    """
    Adiciona uma posição de ativo à carteira da sessão informada.
    Aceita ações, FIIs e ETFs listados na B3.

    Use quando o usuário disser "comprei", "adicionei", "tenho X ações/cotas de Y",
    "entrada em", ou fornecer ticker + quantidade + preço médio de compra.

    Retorna: { id, session_id, ticker, tipo, quantidade, preco_medio, data_entrada }
    """
    # Não enviar "id" no payload: deixa o banco gerar (funciona com UUID DEFAULT e BIGSERIAL)
    posicao = {
        "session_id":   session_id,
        "ticker":       body.ticker.upper().strip(),
        "tipo":         body.tipo,
        "quantidade":   body.quantidade,
        "preco_medio":  body.preco_medio,
        "data_entrada": body.data_entrada,
    }
    try:
        result = supabase.table("carteira_posicoes").insert(posicao).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao inserir posição: {e}")
    if not result.data:
        raise HTTPException(status_code=500, detail="Posição não foi salva — sem dados retornados.")
    row = result.data[0]
    row["id"] = str(row["id"])  # normaliza UUID ou BIGSERIAL para string
    return row


@router.get("/posicoes")
def get_posicoes(
    session_id: str = Query(..., description="ID da sessão. Isola carteiras entre usuários."),
):
    """
    Lista todas as posições abertas da carteira com o último preço conhecido
    (via rv_historico, atualizado diariamente) e P&L não-realizado por posição.

    Use quando o usuário perguntar "minhas posições", "o que tenho na carteira",
    "minha carteira", ou quiser ver P&L por ativo individualmente.

    Retorna: { data: [{ id, ticker, tipo, quantidade, preco_medio, preco_atual,
               pl_valor, pl_pct, valor_pos, data_preco }], total, valor_total }
    """
    res = (
        supabase.table("carteira_posicoes")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    posicoes = res.data or []

    tickers = list({p["ticker"] for p in posicoes})
    precos: dict[str, dict] = {}
    if tickers:
        res_precos = (
            supabase.table("rv_historico")
            .select("ticker,data,fechamento_adj,fechamento")
            .in_("ticker", tickers)
            .order("data", desc=True)
            .limit(len(tickers) * 5)
            .execute()
        )
        for row in res_precos.data or []:
            t = row["ticker"]
            if t not in precos:
                precos[t] = row

    valor_total = 0.0
    resultado = []
    for p in posicoes:
        ticker = p["ticker"]
        info = precos.get(ticker, {})
        preco_atual = info.get("fechamento_adj") or info.get("fechamento")
        qtd = float(p["quantidade"])
        pm = float(p["preco_medio"])

        pl_valor = round((preco_atual - pm) * qtd, 2) if preco_atual else None
        pl_pct = round((preco_atual - pm) / pm * 100, 4) if preco_atual and pm > 0 else None
        valor_pos = round((preco_atual if preco_atual else pm) * qtd, 2)
        valor_total += valor_pos

        resultado.append({
            **p,
            "preco_atual": preco_atual,
            "data_preco":  info.get("data"),
            "pl_valor":    pl_valor,
            "pl_pct":      pl_pct,
            "valor_pos":   valor_pos,
        })

    return {"data": resultado, "total": len(resultado), "valor_total": round(valor_total, 2)}


@router.delete("/posicoes/{posicao_id}", status_code=204)
def delete_posicao(
    posicao_id: str = Path(..., description="UUID da posição retornado pelo POST /carteira/posicoes."),
    session_id: str = Query(..., description="ID da sessão. Confirmação de ownership."),
):
    """
    Remove uma posição da carteira. Operação irreversível.

    Use quando o usuário disser "vendi", "remover", "tirar", "encerrar posição"
    seguido de um ticker. Confirme o ticker com o usuário antes de chamar.

    Retorna: 204 No Content em caso de sucesso. 404 se posição não encontrada.
    """
    try:
        uuid.UUID(posicao_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Posição não encontrada.")
    try:
        res = (
            supabase.table("carteira_posicoes")
            .delete()
            .eq("id", posicao_id)
            .eq("session_id", session_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover posição: {e}")
    if not res.data:
        raise HTTPException(status_code=404, detail="Posição não encontrada ou sem permissão.")


@router.get("/analise")
def get_analise(
    session_id: str = Query(..., description="ID da sessão."),
    periodo_dias: int = Query(
        252, ge=21, le=1260,
        description="Janela de análise em pregões. 21=1mês, 63=3meses, 252=1ano.",
    ),
):
    """
    Retorna análise consolidada de performance: P&L total não-realizado,
    rentabilidade percentual, comparação com CDI e IBOV no período, e métricas
    de risco (Sharpe, Sortino, Calmar, drawdown máximo, win rate) calculadas
    sobre a série histórica reconstruída do valor da carteira via rv_historico.

    Use quando o usuário perguntar "como está minha carteira", "performance",
    "rentabilidade", "quanto ganhei/perdi", "comparado ao CDI/IBOV",
    "métricas de risco", "Sharpe", ou quiser análise consolidada da carteira.

    Retorna: { pl_total, rentabilidade_pct, vs_cdi_pp, vs_ibov_pp,
               sharpe, sortino, calmar, drawdown_max, win_rate,
               posicoes_count, valor_total, serie_carteira }
    """
    res = (
        supabase.table("carteira_posicoes")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    )
    posicoes = res.data or []
    metricas_vazias = {
        "sharpe": None, "sortino": None, "calmar": None,
        "drawdown_max": None, "win_rate": None,
    }
    if not posicoes:
        return {
            "pl_total": 0, "rentabilidade_pct": 0, "vs_cdi_pp": None, "vs_ibov_pp": None,
            "posicoes_count": 0, "valor_total": 0, "serie_carteira": [],
            **metricas_vazias,
        }

    tickers = list({p["ticker"] for p in posicoes})

    # Histórico de preços para reconstruir série da carteira
    res_hist = (
        supabase.table("rv_historico")
        .select("ticker,data,fechamento_adj,fechamento")
        .in_("ticker", tickers)
        .order("data", desc=False)
        .limit(periodo_dias * len(tickers))
        .execute()
    )
    hist_por_ticker: dict[str, list] = defaultdict(list)
    for row in res_hist.data or []:
        hist_por_ticker[row["ticker"]].append(row)

    # Reconstruir série histórica do valor total da carteira
    valor_por_data: dict[str, float] = defaultdict(float)
    for p in posicoes:
        ticker = p["ticker"]
        qtd = float(p["quantidade"])
        data_entrada = p["data_entrada"]
        for row in hist_por_ticker.get(ticker, []):
            if row["data"] >= data_entrada:
                preco = float(row.get("fechamento_adj") or row.get("fechamento") or 0)
                valor_por_data[row["data"]] += preco * qtd

    datas = sorted(valor_por_data.keys())[-periodo_dias:]
    serie = [valor_por_data[d] for d in datas]

    # P&L e rentabilidade
    valor_atual = serie[-1] if serie else 0.0
    custo_total = sum(float(p["quantidade"]) * float(p["preco_medio"]) for p in posicoes)
    pl_total = valor_atual - custo_total
    rentabilidade_pct = (pl_total / custo_total * 100) if custo_total > 0 else 0.0

    # vs CDI
    vs_cdi_pp = None
    try:
        res_cdi = (
            supabase.table("indicadores_economicos")
            .select("valor")
            .eq("serie", "cdi")
            .order("data", desc=True)
            .limit(len(datas))
            .execute()
        )
        if res_cdi.data:
            cdi_acc = 1.0
            for row in res_cdi.data:
                cdi_acc *= (1 + float(row["valor"]) / 100)
            vs_cdi_pp = round(rentabilidade_pct - (cdi_acc - 1) * 100, 4)
    except Exception:
        pass

    # vs IBOV
    vs_ibov_pp = None
    try:
        res_ibov = (
            supabase.table("rv_historico")
            .select("data,fechamento")
            .eq("ticker", "IBOV")
            .order("data", desc=True)
            .limit(len(datas))
            .execute()
        )
        rows = res_ibov.data or []
        if len(rows) >= 2:
            inicio = float(rows[-1]["fechamento"])
            fim = float(rows[0]["fechamento"])
            if inicio > 0:
                vs_ibov_pp = round(rentabilidade_pct - (fim - inicio) / inicio * 100, 4)
    except Exception:
        pass

    metricas = calcular_todas(serie) if len(serie) >= 22 else metricas_vazias

    return {
        "pl_total":          round(pl_total, 2),
        "rentabilidade_pct": round(rentabilidade_pct, 4),
        "vs_cdi_pp":         vs_cdi_pp,
        "vs_ibov_pp":        vs_ibov_pp,
        "valor_total":       round(valor_atual, 2),
        "posicoes_count":    len(posicoes),
        "serie_carteira":    [{"data": d, "valor": round(v, 2)} for d, v in zip(datas, serie)],
        **metricas,
    }
