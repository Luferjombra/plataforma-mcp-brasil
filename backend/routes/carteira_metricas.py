"""
Wrapper VibeTrading — cálculo de métricas de risco/retorno.
Isola a dependência opcional: se vibetrading não estiver instalado,
retorna dicionário vazio sem quebrar o resto da API.
"""

from __future__ import annotations

from datetime import date
from typing import Optional


def calcular_metricas(historico: list[tuple[date, float]]) -> dict:
    """
    Recebe série histórica [(data, valor_total)] e retorna métricas de risco.

    Tenta usar VibeTrading BacktestEngine. Se não disponível, calcula
    métricas básicas com pandas puro (sempre disponível no ambiente).

    Retorna dict com keys: sharpe, sortino, calmar, max_drawdown,
    volatilidade, win_rate, vs_cdi, vs_ibov.
    """
    if len(historico) < 5:
        return _metricas_vazias()

    try:
        return _calcular_vibetrading(historico)
    except ImportError:
        pass
    except Exception:
        pass

    try:
        return _calcular_pandas(historico)
    except Exception:
        return _metricas_vazias()


def _metricas_vazias() -> dict:
    return {
        "sharpe": None, "sortino": None, "calmar": None,
        "max_drawdown": None, "volatilidade": None, "win_rate": None,
        "vs_cdi": None, "vs_ibov": None,
    }


def _calcular_vibetrading(historico: list[tuple[date, float]]) -> dict:
    """Usa VibeTrading BacktestEngine para métricas profissionais."""
    import pandas as pd
    from vibetrading.backtest import BacktestEngine  # type: ignore

    datas  = [d for d, _ in historico]
    valores = [v for _, v in historico]

    df = pd.DataFrame({"date": pd.to_datetime(datas), "portfolio_value": valores})
    df = df.set_index("date").sort_index()

    engine = BacktestEngine()
    metrics = engine.calculate_metrics(df["portfolio_value"])

    return {
        "sharpe":       metrics.get("sharpe_ratio"),
        "sortino":      metrics.get("sortino_ratio"),
        "calmar":       metrics.get("calmar_ratio"),
        "max_drawdown": metrics.get("max_drawdown"),
        "volatilidade": metrics.get("annualized_volatility"),
        "win_rate":     metrics.get("win_rate"),
        "vs_cdi":       None,   # calculado separadamente ao ter CDI no banco
        "vs_ibov":      None,
    }


def _calcular_pandas(historico: list[tuple[date, float]]) -> dict:
    """Fallback: métricas básicas com pandas puro (sem VibeTrading)."""
    import math
    import pandas as pd

    datas  = [d for d, _ in historico]
    valores = [v for _, v in historico]

    s = pd.Series(valores, index=pd.to_datetime(datas)).sort_index()
    retornos = s.pct_change().dropna()

    if len(retornos) < 2:
        return _metricas_vazias()

    # Volatilidade anualizada (252 dias úteis)
    vol = float(retornos.std() * math.sqrt(252))

    # Sharpe simples (sem risk-free; usar CDI seria mais correto)
    media_diaria = float(retornos.mean())
    sharpe = (media_diaria * 252 / vol) if vol > 0 else None

    # Max drawdown
    pico = s.cummax()
    dd = (s - pico) / pico
    max_dd = float(dd.min())

    # Win rate
    win_rate = float((retornos > 0).mean())

    # Retorno total
    retorno_total = float((s.iloc[-1] / s.iloc[0]) - 1) * 100

    return {
        "sharpe":       round(sharpe, 4) if sharpe is not None else None,
        "sortino":      None,   # requer separar retornos negativos — omitido no fallback
        "calmar":       round(retorno_total / abs(max_dd * 100), 4) if max_dd < 0 else None,
        "max_drawdown": round(max_dd, 6),
        "volatilidade": round(vol, 6),
        "win_rate":     round(win_rate, 4),
        "vs_cdi":       None,
        "vs_ibov":      None,
    }
