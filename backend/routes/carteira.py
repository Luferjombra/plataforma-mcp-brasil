"""
Rotas — Módulo Carteira
Épico A: rastreamento de posições + cálculo de performance
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, field_validator

from db import supabase
from routes.carteira_metricas import calcular_metricas

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PosicaoIn(BaseModel):
    session_id: str
    ticker: str
    nome: Optional[str] = None
    tipo: str  # acao, fii, fundo, rf, etf, bdr
    quantidade: float
    preco_medio: float
    data_entrada: Optional[date] = None
    nota: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def tipo_valido(cls, v: str) -> str:
        allowed = {"acao", "fii", "fundo", "rf", "etf", "bdr"}
        if v not in allowed:
            raise ValueError(f"tipo deve ser um de: {allowed}")
        return v

    @field_validator("quantidade", "preco_medio")
    @classmethod
    def positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("deve ser maior que zero")
        return v


class PosicaoOut(BaseModel):
    id: int
    session_id: str
    ticker: str
    nome: Optional[str]
    tipo: str
    quantidade: float
    preco_medio: float
    data_entrada: Optional[date]
    nota: Optional[str]
    custo_total: float  # calculado: quantidade * preco_medio


class AnaliseOut(BaseModel):
    session_id: str
    n_posicoes: int
    custo_total: float
    valor_atual: float
    pl_absoluto: float
    pl_percentual: float
    vs_cdi: Optional[float]
    vs_ibov: Optional[float]
    sharpe: Optional[float]
    sortino: Optional[float]
    calmar: Optional[float]
    max_drawdown: Optional[float]
    volatilidade: Optional[float]
    win_rate: Optional[float]
    posicoes: list[PosicaoOut]
    calculado_em: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def _preco_atual(ticker: str, tipo: str) -> Optional[float]:
    """Busca o preço/valor mais recente no banco para o ticker."""
    try:
        if tipo in ("acao", "fii", "etf", "bdr"):
            r = (
                supabase.table("rv_historico")
                .select("fechamento")
                .eq("ticker", ticker)
                .order("data", desc=True)
                .limit(1)
                .execute()
            )
            if r.data:
                return float(r.data[0]["fechamento"])

        elif tipo == "fundo":
            r = (
                supabase.table("fundos_historico")
                .select("valor_cota")
                .eq("cnpj", ticker)
                .order("data", desc=True)
                .limit(1)
                .execute()
            )
            if r.data:
                return float(r.data[0]["valor_cota"])

        elif tipo == "rf":
            r = (
                supabase.table("rf_titulos")
                .select("pu_atual")
                .eq("codigo", ticker)
                .limit(1)
                .execute()
            )
            if r.data and r.data[0].get("pu_atual"):
                return float(r.data[0]["pu_atual"])

    except Exception:
        pass
    return None


def _historico_valor(session_id: str, posicoes: list[dict]) -> list[tuple[date, float]]:
    """
    Monta série histórica do valor total da carteira combinando
    os históricos de preço de cada posição.
    Retorna lista de (data, valor_total).
    """
    from collections import defaultdict

    series: dict[str, dict[date, float]] = {}

    for pos in posicoes:
        ticker = pos["ticker"]
        tipo   = pos["tipo"]
        qtd    = float(pos["quantidade"])

        try:
            if tipo in ("acao", "fii", "etf", "bdr"):
                r = (
                    supabase.table("rv_historico")
                    .select("data,fechamento")
                    .eq("ticker", ticker)
                    .order("data")
                    .execute()
                )
                series[ticker] = {
                    date.fromisoformat(row["data"]): float(row["fechamento"]) * qtd
                    for row in r.data
                }
            elif tipo == "fundo":
                r = (
                    supabase.table("fundos_historico")
                    .select("data,valor_cota")
                    .eq("cnpj", ticker)
                    .order("data")
                    .execute()
                )
                series[ticker] = {
                    date.fromisoformat(row["data"]): float(row["valor_cota"]) * qtd
                    for row in r.data
                }
        except Exception:
            continue

    if not series:
        return []

    # Intersecção de datas onde TODOS os ativos têm preço
    datas_comuns: set[date] = set.intersection(*[set(s.keys()) for s in series.values()])
    if not datas_comuns:
        # Fallback: união de datas, usando último preço conhecido
        datas_comuns = set.union(*[set(s.keys()) for s in series.values()])

    resultado: dict[date, float] = defaultdict(float)
    for ticker, serie in series.items():
        datas_ord = sorted(serie.keys())
        for d in sorted(datas_comuns):
            # Último preço disponível até a data d
            preco = next((serie[dd] for dd in reversed(datas_ord) if dd <= d), None)
            if preco is not None:
                resultado[d] += preco

    return sorted(resultado.items())


# ── Rotas ────────────────────────────────────────────────────────────────────

@router.post("/posicoes", response_model=PosicaoOut, status_code=201)
def adicionar_posicao(body: PosicaoIn):
    """Adiciona uma posição à carteira da sessão."""
    record = {
        "session_id":   body.session_id,
        "ticker":       body.ticker.upper(),
        "nome":         body.nome,
        "tipo":         body.tipo,
        "quantidade":   body.quantidade,
        "preco_medio":  body.preco_medio,
        "data_entrada": body.data_entrada.isoformat() if body.data_entrada else date.today().isoformat(),
        "nota":         body.nota,
    }
    r = supabase.table("carteira_posicoes").insert(record).execute()
    if not r.data:
        raise HTTPException(500, "Erro ao salvar posição")
    pos = r.data[0]
    return {**pos, "custo_total": float(pos["quantidade"]) * float(pos["preco_medio"])}


@router.get("/posicoes", response_model=list[PosicaoOut])
def listar_posicoes(session_id: str = Query(...)):
    """Lista todas as posições abertas da sessão."""
    r = (
        supabase.table("carteira_posicoes")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return [
        {**pos, "custo_total": float(pos["quantidade"]) * float(pos["preco_medio"])}
        for pos in r.data
    ]


@router.delete("/posicoes/{posicao_id}", status_code=204)
def remover_posicao(posicao_id: int, session_id: str = Query(...)):
    """Remove uma posição da carteira (só da sessão dona)."""
    r = (
        supabase.table("carteira_posicoes")
        .delete()
        .eq("id", posicao_id)
        .eq("session_id", session_id)
        .execute()
    )
    if not r.data:
        raise HTTPException(404, "Posição não encontrada ou não pertence à sessão")


@router.get("/analise", response_model=AnaliseOut)
def analisar_carteira(session_id: str = Query(...)):
    """
    Calcula P&L + métricas de risco da carteira.
    Busca preço atual de cada ativo no banco e calcula métricas
    via VibeTrading BacktestEngine (se histórico disponível).
    """
    r = (
        supabase.table("carteira_posicoes")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    )
    posicoes = r.data
    if not posicoes:
        raise HTTPException(404, "Nenhuma posição encontrada para esta sessão")

    custo_total = sum(float(p["quantidade"]) * float(p["preco_medio"]) for p in posicoes)

    # Valor atual de mercado
    valor_atual = 0.0
    for p in posicoes:
        preco = _preco_atual(p["ticker"], p["tipo"])
        valor_atual += (preco or float(p["preco_medio"])) * float(p["quantidade"])

    pl_absoluto  = valor_atual - custo_total
    pl_percentual = (pl_absoluto / custo_total * 100) if custo_total else 0.0

    # Métricas de risco via histórico
    metricas = {}
    historico = _historico_valor(session_id, posicoes)
    if len(historico) >= 20:  # mínimo para métricas serem significativas
        metricas = calcular_metricas(historico)

    # Salvar snapshot do dia
    snapshot = {
        "session_id":    session_id,
        "data":          date.today().isoformat(),
        "valor_total":   round(valor_atual, 2),
        "custo_total":   round(custo_total, 2),
        "pl_absoluto":   round(pl_absoluto, 2),
        "pl_percentual": round(pl_percentual, 4),
        "n_posicoes":    len(posicoes),
        **{k: round(v, 6) if v is not None else None for k, v in metricas.items()},
    }
    supabase.table("carteira_snapshots").upsert(snapshot, on_conflict="session_id,data").execute()

    return {
        "session_id":    session_id,
        "n_posicoes":    len(posicoes),
        "custo_total":   round(custo_total, 2),
        "valor_atual":   round(valor_atual, 2),
        "pl_absoluto":   round(pl_absoluto, 2),
        "pl_percentual": round(pl_percentual, 4),
        "posicoes": [
            {**pos, "custo_total": float(pos["quantidade"]) * float(pos["preco_medio"])}
            for pos in posicoes
        ],
        "calculado_em": datetime.now(),
        **metricas,
    }
