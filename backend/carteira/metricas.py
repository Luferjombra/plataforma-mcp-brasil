"""
Métricas de risco para carteira de investimentos.
Implementação nativa — sem dependências externas além da stdlib.
Substitui VibeTrading (deps inviáveis no Render free tier: ccxt + litellm + pandas).
"""
from __future__ import annotations
import math
from typing import Optional


def _retornos(serie: list[float]) -> list[float]:
    return [
        (serie[i] - serie[i - 1]) / serie[i - 1]
        for i in range(1, len(serie))
        if serie[i - 1] != 0
    ]


def sharpe(serie: list[float], taxa_livre_risco_anual: float = 0.1275) -> Optional[float]:
    """Sharpe ratio anualizado (252 pregões). Mínimo 22 pontos."""
    if len(serie) < 22:
        return None
    rets = _retornos(serie)
    if not rets:
        return None
    taxa_diaria = (1 + taxa_livre_risco_anual) ** (1 / 252) - 1
    excesso = [r - taxa_diaria for r in rets]
    media = sum(excesso) / len(excesso)
    variancia = sum((r - media) ** 2 for r in excesso) / len(excesso)
    desvio = math.sqrt(variancia)
    if desvio == 0:
        return None
    return round((media / desvio) * math.sqrt(252), 4)


def sortino(serie: list[float], taxa_livre_risco_anual: float = 0.1275) -> Optional[float]:
    """Sortino ratio anualizado — penaliza apenas retornos abaixo da taxa livre."""
    if len(serie) < 22:
        return None
    rets = _retornos(serie)
    if not rets:
        return None
    taxa_diaria = (1 + taxa_livre_risco_anual) ** (1 / 252) - 1
    excesso = [r - taxa_diaria for r in rets]
    media = sum(excesso) / len(excesso)
    negativos = [r for r in excesso if r < 0]
    if not negativos:
        return None
    downside_var = sum(r ** 2 for r in negativos) / len(excesso)
    downside_std = math.sqrt(downside_var)
    if downside_std == 0:
        return None
    return round((media / downside_std) * math.sqrt(252), 4)


def max_drawdown(serie: list[float]) -> Optional[float]:
    """Drawdown máximo como fração negativa (ex: -0.082 = -8.2%)."""
    if len(serie) < 2:
        return None
    pico = serie[0]
    dd_max = 0.0
    for v in serie:
        if v > pico:
            pico = v
        if pico > 0:
            dd = (v - pico) / pico
            if dd < dd_max:
                dd_max = dd
    return round(dd_max, 6)


def calmar(serie: list[float]) -> Optional[float]:
    """Calmar ratio: retorno anualizado / |drawdown máximo|. Mínimo 252 pontos."""
    if len(serie) < 252:
        return None
    dd = max_drawdown(serie)
    if dd is None or dd == 0:
        return None
    retorno_total = (serie[-1] - serie[0]) / serie[0]
    anos = len(serie) / 252
    retorno_anual = (1 + retorno_total) ** (1 / anos) - 1
    return round(retorno_anual / abs(dd), 4)


def win_rate(serie: list[float]) -> Optional[float]:
    """Percentual de pregões com retorno positivo."""
    if len(serie) < 22:
        return None
    rets = _retornos(serie)
    if not rets:
        return None
    positivos = sum(1 for r in rets if r > 0)
    return round(positivos / len(rets), 4)


def calcular_todas(serie: list[float], taxa_selic_anual: float = 0.1275) -> dict:
    """Calcula todas as métricas de uma vez a partir de uma série de valores."""
    return {
        "sharpe":       sharpe(serie, taxa_selic_anual),
        "sortino":      sortino(serie, taxa_selic_anual),
        "calmar":       calmar(serie),
        "drawdown_max": max_drawdown(serie),
        "win_rate":     win_rate(serie),
    }
