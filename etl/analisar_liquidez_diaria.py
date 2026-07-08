"""
Diagnóstico pontual — variação diária de nº de ativos no COTAHIST (ADR-001,
Fase 2, "Ponto de atenção")

Na semana de descoberta da Fase 1, o nº de ativos com negócio no dia caiu
3 dias seguidos: 1.412 (01/07) -> 1.396 (02/07) -> 1.257 (03/07). Não dava
pra saber se é liquidez normal (sexta-feira, papéis que não negociam todo
dia) ou um bug silencioso derrubando linhas no ETL. Agora com ~1 ano de
backfill em rv_historico_staging dá pra olhar a série completa e checar se
há um padrão estável por dia da semana ou uma tendência de queda anômala.

Descartável — apagar depois de resolver este item do backlog.

Uso:
    python etl/analisar_liquidez_diaria.py
"""

import datetime

from config import supabase

DIAS_JANELA = 370  # cobre a janela do backfill (~1 ano)


def contar_ativos_do_dia(dia: str) -> int:
    """Nº de linhas (tickers) em rv_historico_staging naquele dia. .limit(1)
    mantém o corpo da resposta mínimo — o count vem do header Content-Range
    independente de quantas linhas voltam no body."""
    res = (
        supabase.table("rv_historico_staging")
        .select("ticker", count="exact")
        .eq("data", dia)
        .limit(1)
        .execute()
    )
    return res.count or 0


def run():
    print("=== Diagnóstico: variação diária de ativos no COTAHIST ===\n")

    hoje = datetime.date.today()
    inicio = hoje - datetime.timedelta(days=DIAS_JANELA)

    por_dia = []
    dia = inicio
    while dia <= hoje:
        if dia.weekday() < 5:  # só dias úteis (seg-sex) — fins de semana não pregoam
            n = contar_ativos_do_dia(dia.isoformat())
            por_dia.append((dia, n))
        dia += datetime.timedelta(days=1)

    com_dado = [(d, n) for d, n in por_dia if n > 0]
    sem_dado = [d for d, n in por_dia if n == 0]

    print(f"{len(por_dia)} dias úteis na janela, {len(com_dado)} com dado, "
          f"{len(sem_dado)} sem dado (feriado ou gap de coleta)\n")

    # ── Estatística por dia da semana ──────────────────────────────────────
    nomes_dia = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]
    print("Média de ativos/dia por dia da semana:")
    for wd, nome in enumerate(nomes_dia):
        valores = [n for d, n in com_dado if d.weekday() == wd]
        if valores:
            media = sum(valores) / len(valores)
            print(f"  {nome}: média={media:.0f}  min={min(valores)}  max={max(valores)}  n_amostras={len(valores)}")

    # ── Tendência: primeiros 30 dias com dado vs últimos 30 ────────────────
    if len(com_dado) >= 60:
        primeiros = [n for _, n in com_dado[:30]]
        ultimos = [n for _, n in com_dado[-30:]]
        media_primeiros = sum(primeiros) / len(primeiros)
        media_ultimos = sum(ultimos) / len(ultimos)
        variacao_pct = (media_ultimos - media_primeiros) / media_primeiros * 100
        print(f"\nMédia primeiros 30 dias com dado: {media_primeiros:.0f}")
        print(f"Média últimos 30 dias com dado:   {media_ultimos:.0f}")
        print(f"Variação: {variacao_pct:+.1f}%")

    # ── Outliers: dias com contagem muito abaixo da média móvel local ──────
    print("\nDias com queda > 20% vs média móvel dos 10 dias úteis anteriores:")
    achou_outlier = False
    for i in range(10, len(com_dado)):
        janela = [n for _, n in com_dado[i - 10:i]]
        media_movel = sum(janela) / len(janela)
        d, n = com_dado[i]
        if media_movel > 0 and (media_movel - n) / media_movel > 0.20:
            print(f"  {d} ({nomes_dia[d.weekday()]}): {n} ativos vs média móvel {media_movel:.0f} "
                  f"({(n - media_movel) / media_movel * 100:+.1f}%)")
            achou_outlier = True
    if not achou_outlier:
        print("  nenhum")

    if sem_dado:
        print(f"\nDias úteis sem nenhum dado ({len(sem_dado)}): {sem_dado[:15]}"
              f"{' ...' if len(sem_dado) > 15 else ''}")

    print("\n=== Concluído ===")


if __name__ == "__main__":
    run()
