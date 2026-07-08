"""
ETL — COTAHIST (B3) — Backfill histórico (staging)

Complementa o cotahist.py diário: baixa os arquivos ANUAIS do COTAHIST
(um por ano, cobrindo todo o pregão daquele ano) para reconstituir
histórico retroativo, em vez de esperar o job diário acumular dia a dia.

URL: https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A<aaaa>.ZIP

Mesma disciplina da Fase 1 (ver ADR-001): escreve SÓ em
rv_ativos_staging / rv_historico_staging. A promoção para produção
(rv_ativos/rv_historico) é decisão da Fase 2, feita depois de validação
cruzada — não é este script que faz esse corte.

Uso:
    python etl/cotahist_backfill.py                # últimos 1 ano (padrão)
    python etl/cotahist_backfill.py --anos 3        # últimos 3 anos
    python etl/cotahist_backfill.py --ano-inicio 2022  # de um ano específico até hoje
"""

import argparse
import datetime

import httpx

from log_etl import ETLRun, baixar_arquivo_b3
from cotahist import (
    BASE_URL,
    extrair_linhas,
    parse_linha,
    upsert_staging,
    rodar_smoke_test,
    proximo_dia_util,
)


def nome_arquivo_anual(ano: int) -> str:
    return f"COTAHIST_A{ano}.ZIP"


def baixar_arquivo_anual(ano: int, client: httpx.Client) -> bytes | None:
    """
    Baixa o COTAHIST anual do ano informado. Retorna None se o arquivo
    não existir (ano sem publicação) ou falhar após as tentativas —
    não interrompe o backfill dos demais anos.
    """
    url = f"{BASE_URL}/{nome_arquivo_anual(ano)}"
    return baixar_arquivo_b3(
        url, client,
        user_agent="plataforma-mcp-brasil/1.0 (etl backfill)",
        max_attempts=3, timeout=180,
        msg_404=f"  [aviso] {nome_arquivo_anual(ano)} não encontrado (404) — pulando ano {ano}",
        msg_falha=f"  ✗ Falhou ao baixar {nome_arquivo_anual(ano)} após 3 tentativas — pulando ano {ano}",
    )


def processar_ano(ano: int, data_corte: datetime.date, client: httpx.Client, run_id: int | None) -> int:
    """Baixa, parseia e grava (staging) um ano do COTAHIST, filtrando por data_corte."""
    conteudo = baixar_arquivo_anual(ano, client)
    if conteudo is None:
        return 0

    linhas = extrair_linhas(conteudo)
    print(f"  {nome_arquivo_anual(ano)} | {len(linhas)} linhas brutas")

    registros = [
        p for l in linhas
        if (p := parse_linha(l)) is not None
        and datetime.date.fromisoformat(p["data"]) >= data_corte
    ]
    print(f"  {len(registros)} registros de mercado à vista (>= {data_corte}) após filtro")

    if not registros:
        return 0

    por_ticker = {r["ticker"]: r for r in registros}
    rodar_smoke_test(por_ticker, run_id)

    n_ativos, n_hist = upsert_staging(registros)
    print(f"  ✓ staging atualizado: {n_ativos} ativos, {n_hist} registros históricos (ano {ano})\n")
    return n_hist


def run(anos: float | None = 1.0, ano_inicio: int | None = None):
    print("=== ETL COTAHIST (B3) — Backfill histórico (staging) ===\n")

    hoje = proximo_dia_util(datetime.date.today())

    if ano_inicio is not None:
        data_corte = datetime.date(ano_inicio, 1, 1)
    else:
        data_corte = hoje - datetime.timedelta(days=round(anos * 365))

    anos_para_buscar = list(range(data_corte.year, hoje.year + 1))
    print(f"Janela: desde {data_corte} — anos a buscar: {anos_para_buscar}\n")

    total_rows = 0
    with ETLRun("cotahist_backfill") as run_ctx:
        with httpx.Client() as client:
            for ano in anos_para_buscar:
                print(f"→ Ano {ano}...")
                total_rows += processar_ano(ano, data_corte, client, run_ctx.run_id)

        run_ctx.set_rows(total_rows)

    print(f"=== Concluído — {total_rows} registros históricos gravados no staging ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill histórico COTAHIST (staging)")
    parser.add_argument("--anos", type=float, default=1.0,
                        help="Quantos anos retroagir a partir de hoje (padrão: 1)")
    parser.add_argument("--ano-inicio", type=int, default=None,
                        help="Ano específico de início (sobrepõe --anos), ex: 2022")
    args = parser.parse_args()

    run(anos=args.anos, ano_inicio=args.ano_inicio)
