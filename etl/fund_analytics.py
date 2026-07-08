"""
ETL — Métricas analíticas de fundos (fund_analytics_metrics)
Fonte: dados já coletados por fundos.py (fundos_historico) e indicadores.py
(indicadores_economicos, série 'cdi') — sem chamada externa nova.

A tabela fund_analytics_metrics e o endpoint GET /fundos/analytics/{cnpj} já
existiam (ver database/schema.sql, backend/routes/fundos.py), mas nenhum job
calculava/gravava uma linha nela — o endpoint sempre retornava 404. Este
script fecha essa lacuna.

Convenção de janelas: usa CONTAGEM de pregões (21/63/126/252), não dias de
calendário — mesmo padrão já usado no frontend ("Retorno 252d" em
/fundos) e nos endpoints de histórico da RV. Fundos com menos pregões do que
a janela exigida ficam com essa métrica em None (sem histórico suficiente),
não com um número calculado sobre um período menor sem aviso.

Uso: python fund_analytics.py
"""

import time

from config import supabase
from log_etl import ETLRun

JANELA_1M = 21
JANELA_3M = 63
JANELA_6M = 126
JANELA_12M = 252
MIN_COTAS_PARA_CALCULAR = 20
LIMIT_HISTORICO = 300  # cobre a janela de 252 pregões + folga


def obter_cnpjs() -> list[str]:
    """CNPJs a processar -- vem de fundos_cadastro (tabela pequena, não
    precisa paginação) em vez de SELECT DISTINCT sobre fundos_historico
    (que já passa de mil linhas e cairia no limite padrão do PostgREST)."""
    result = supabase.table("fundos_cadastro").select("cnpj").execute()
    return sorted({r["cnpj"] for r in result.data})


def obter_historico(cnpj: str) -> list[dict]:
    """Últimas LIMIT_HISTORICO cotas do fundo, em ordem crescente de data."""
    result = (
        supabase.table("fundos_historico")
        .select("data,valor_cota")
        .eq("cnpj", cnpj)
        .order("data", desc=True)
        .limit(LIMIT_HISTORICO)
        .execute()
    )
    return list(reversed(result.data))


def obter_cdi_acumulado(data_inicio: str, data_fim: str) -> float | None:
    """Retorno acumulado do CDI (%) entre data_inicio (exclusive) e data_fim
    (inclusive), compondo a série diária de indicadores_economicos
    (serie='cdi', valor = taxa % do dia, não anualizada -- ver
    etl/indicadores.py). Exclusive em data_inicio de propósito -- é a mesma
    data-base usada em `retorno_janela()` (cotas[-1-janela]), que por
    construção não conta o "retorno do dia-base" (o primeiro retorno diário
    em volatilidade_e_drawdown só começa em valores[1]). Incluir data_inicio
    aqui componha um dia de CDI a mais do que a janela da cota realmente
    cobre -- achado de revisão."""
    result = (
        supabase.table("indicadores_economicos")
        .select("valor")
        .eq("serie", "cdi")
        .gt("data", data_inicio)
        .lte("data", data_fim)
        .execute()
    )
    if not result.data:
        return None
    fator = 1.0
    for row in result.data:
        fator *= (1 + row["valor"] / 100)
    return (fator - 1) * 100


def retorno_janela(cotas: list[dict], janela: int) -> tuple[float, str] | None:
    """(retorno %, data de início da janela) usando `janela` pregões atrás,
    ou None se não há cotas suficientes para essa janela."""
    if len(cotas) <= janela:
        return None
    base, atual = cotas[-1 - janela], cotas[-1]
    if base["valor_cota"] == 0:
        return None
    pct = (atual["valor_cota"] - base["valor_cota"]) / base["valor_cota"] * 100
    return pct, base["data"]


def retorno_ytd(cotas: list[dict]) -> float | None:
    ano_atual = cotas[-1]["data"][:4]
    candidatos = [c for c in cotas if c["data"] >= f"{ano_atual}-01-01"]
    if len(candidatos) < 2 or candidatos[0]["valor_cota"] == 0:
        return None
    base, atual = candidatos[0], cotas[-1]
    return (atual["valor_cota"] - base["valor_cota"]) / base["valor_cota"] * 100


def volatilidade_e_drawdown(cotas: list[dict], janela: int) -> tuple[float | None, float | None]:
    """Volatilidade anualizada (%) e drawdown máximo (%, negativo) sobre até
    `janela` pregões mais recentes. Usa o histórico inteiro disponível se for
    menor que a janela -- resultado ainda é reportado (é isso que uma
    plataforma de varejo mostra como "desde o início" para fundo novo), só
    exige um mínimo de 10 pregões para não computar sobre 2-3 pontos."""
    recorte = cotas[-(janela + 1):] if len(cotas) > janela else cotas
    if len(recorte) < 10:
        return None, None

    valores = [c["valor_cota"] for c in recorte]
    retornos_diarios = [
        (valores[i] - valores[i - 1]) / valores[i - 1]
        for i in range(1, len(valores)) if valores[i - 1] != 0
    ]
    if len(retornos_diarios) < 9:
        return None, None

    media = sum(retornos_diarios) / len(retornos_diarios)
    variancia = sum((r - media) ** 2 for r in retornos_diarios) / (len(retornos_diarios) - 1)
    vol_anualizada = (variancia ** 0.5) * (252 ** 0.5) * 100

    pico = valores[0]
    max_dd = 0.0
    for v in valores:
        pico = max(pico, v)
        max_dd = min(max_dd, (v - pico) / pico)

    return vol_anualizada, max_dd * 100


def calcular_metricas(cnpj: str, cotas: list[dict]) -> dict | None:
    if len(cotas) < MIN_COTAS_PARA_CALCULAR:
        return None

    r1m = retorno_janela(cotas, JANELA_1M)
    r3m = retorno_janela(cotas, JANELA_3M)
    r6m = retorno_janela(cotas, JANELA_6M)
    r12m = retorno_janela(cotas, JANELA_12M)
    rytd = retorno_ytd(cotas)
    vol_12m, max_dd_12m = volatilidade_e_drawdown(cotas, JANELA_12M)

    sharpe_12m = None
    pct_cdi_12m = None
    if r12m is not None:
        pct_r12m, data_inicio_12m = r12m
        cdi_acumulado = obter_cdi_acumulado(data_inicio_12m, cotas[-1]["data"])
        if cdi_acumulado is not None and cdi_acumulado != 0:
            pct_cdi_12m = (pct_r12m / cdi_acumulado) * 100
            # Piso de volatilidade -- sem ele, uma série quase sem ruído (ou
            # um problema de qualidade de dado, cota "empoçada") produz um
            # Sharpe artificialmente enorme por dividir por algo perto de
            # zero, não porque o fundo é realmente excepcional.
            if vol_12m is not None and vol_12m > 0.01:
                sharpe_12m = (pct_r12m - cdi_acumulado) / vol_12m

    return {
        "cnpj": cnpj,
        "data_referencia": cotas[-1]["data"],
        "retorno_1m": round(r1m[0], 6) if r1m else None,
        "retorno_3m": round(r3m[0], 6) if r3m else None,
        "retorno_6m": round(r6m[0], 6) if r6m else None,
        "retorno_12m": round(r12m[0], 6) if r12m else None,
        "retorno_ytd": round(rytd, 6) if rytd is not None else None,
        "volatilidade_12m": round(vol_12m, 6) if vol_12m is not None else None,
        "sharpe_12m": round(sharpe_12m, 6) if sharpe_12m is not None else None,
        "max_drawdown": round(max_dd_12m, 6) if max_dd_12m is not None else None,
        "pct_cdi_12m": round(pct_cdi_12m, 4) if pct_cdi_12m is not None else None,
    }


def upsert_metricas(registros: list[dict]) -> None:
    """Upsert com retry de 3 tentativas -- mesma disciplina de
    fundos.py::upsert_historico (a chamada final não tinha nenhuma)."""
    last_exc = None
    for tentativa in range(1, 4):
        try:
            supabase.table("fund_analytics_metrics").upsert(
                registros, on_conflict="cnpj,data_referencia"
            ).execute()
            return
        except Exception as e:
            last_exc = e
            if tentativa < 3:
                espera = 2 ** (tentativa - 1)
                print(f"    ⚠ Upsert tentativa {tentativa}/3 — aguardando {espera}s... ({e})")
                time.sleep(espera)
    raise last_exc


def run():
    print("=== ETL Métricas Analíticas de Fundos ===\n")

    with ETLRun("fund_analytics") as run_ctx:
        cnpjs = obter_cnpjs()
        print(f"→ {len(cnpjs)} fundo(s) cadastrado(s)\n")
        if len(cnpjs) >= 1000:
            print("  ⚠ fundos_cadastro atingiu o limite padrão do PostgREST (1000 linhas) "
                  "-- obter_cnpjs() precisa de paginação (.range()) antes de confiar nesta lista.\n")

        registros = []
        erros = []
        for cnpj in cnpjs:
            # Isolado por fundo -- sem isso, 1 CNPJ problemático (rede,
            # dado malformado) derrubaria o job inteiro e nenhum fundo
            # teria métrica gravada naquele dia, nem os já calculados com
            # sucesso antes dele (achado de revisão).
            try:
                cotas = obter_historico(cnpj)
                metricas = calcular_metricas(cnpj, cotas)
                if metricas:
                    registros.append(metricas)
                    print(f"  ✓ {cnpj}: {len(cotas)} cotas — métricas calculadas")
                else:
                    print(f"  ⚠ {cnpj}: {len(cotas)} cotas (< {MIN_COTAS_PARA_CALCULAR}) — pulando")
            except Exception as e:
                erros.append(f"{cnpj}: {e}")
                print(f"  ✗ {cnpj}: ERRO — {e}")

        if registros:
            upsert_metricas(registros)

        run_ctx.set_rows(len(registros))
        if erros:
            run_ctx.set_status("partial", "; ".join(erros))

        print(f"\n=== Concluído — {len(registros)}/{len(cnpjs)} fundo(s) com métricas gravadas ===")
        if erros:
            print(f"⚠ {len(erros)} fundo(s) com erro:")
            for e in erros:
                print(f"  - {e}")


if __name__ == "__main__":
    run()
