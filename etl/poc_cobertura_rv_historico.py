"""
Consulta pontual — cobertura de rv_historico por ticker.

Não é ETL de produção. Responde: quantos tickers de rv_ativos têm dado em
rv_historico, qual o range de datas por ticker, e quantos ficam abaixo do
esperado (~252 pregões/ano) -- pra saber de verdade quanto do universo
cadastrado (rv_ativos, ~2.368 tickers pós-corte ADR-001) tem preço
efetivamente coberto, não só cadastro.

PostgREST não faz GROUP BY -- pagina ticker+data em blocos de 1000 (mesmo
padrão de rv.py::_buscar_historico) e agrega em Python. rv_historico só
tem ~349 mil linhas/ano (número documentado no ADR-001), então isso cabe
em memória sem problema.

Uso: python poc_cobertura_rv_historico.py
"""
from collections import defaultdict

from config import supabase

TAMANHO_PAGINA = 1000


def _buscar_todos_ticker_data() -> list[dict]:
    registros: list[dict] = []
    inicio = 0
    while True:
        pagina = (
            supabase.table("rv_historico")
            .select("ticker,data")
            .order("ticker")
            .order("data")
            .range(inicio, inicio + TAMANHO_PAGINA - 1)
            .execute()
        )
        lote = pagina.data or []
        registros.extend(lote)
        if len(lote) < TAMANHO_PAGINA:
            break
        inicio += TAMANHO_PAGINA
    return registros


def main():
    print("Cobertura de rv_historico por ticker\n")

    res_ativos = (
        supabase.table("rv_ativos")
        .select("ticker,ativo,tipo")
        .execute()
    )
    ativos = res_ativos.data or []
    tickers_universo = {a["ticker"] for a in ativos}
    tickers_ativos = {a["ticker"] for a in ativos if a["ativo"]}
    print(f"rv_ativos: {len(tickers_universo)} tickers cadastrados ({len(tickers_ativos)} com ativo=true)\n")

    print("Baixando rv_historico (ticker+data, paginado)...")
    registros = _buscar_todos_ticker_data()
    print(f"  {len(registros)} linhas baixadas\n")

    por_ticker: dict[str, list[str]] = defaultdict(list)
    for r in registros:
        por_ticker[r["ticker"]].append(r["data"])

    tickers_com_dado = set(por_ticker.keys())
    tickers_sem_dado = tickers_universo - tickers_com_dado
    tickers_orfaos = tickers_com_dado - tickers_universo  # em rv_historico mas não em rv_ativos (não deveria existir, FK)

    contagens = sorted(((t, len(datas), min(datas), max(datas)) for t, datas in por_ticker.items()),
                        key=lambda x: x[1])

    total_linhas = len(registros)
    media_por_ticker = total_linhas / len(tickers_com_dado) if tickers_com_dado else 0

    print("=" * 70)
    print("RESUMO")
    print("=" * 70)
    print(f"Tickers cadastrados em rv_ativos:        {len(tickers_universo)}")
    print(f"Tickers com pelo menos 1 linha histórico: {len(tickers_com_dado)} "
          f"({len(tickers_com_dado) / len(tickers_universo) * 100:.1f}% do universo)")
    print(f"Tickers SEM nenhuma linha em rv_historico: {len(tickers_sem_dado)}")
    print(f"Total de linhas em rv_historico:          {total_linhas}")
    print(f"Média de linhas por ticker coberto:       {media_por_ticker:.0f}")
    if tickers_orfaos:
        print(f"[ANOMALIA] {len(tickers_orfaos)} tickers em rv_historico sem linha correspondente em rv_ativos (FK deveria impedir isso)")

    if registros:
        todas_datas = [r["data"] for r in registros]
        print(f"Range de datas (todo o rv_historico):     {min(todas_datas)} -> {max(todas_datas)}")

    print()
    print("Distribuição de cobertura (nº de tickers por faixa de linhas):")
    faixas = [(0, 0), (1, 50), (51, 150), (151, 251), (252, 252), (253, 10_000)]
    labels = ["0 linhas", "1-50", "51-150", "151-251 (quase 1 ano)", "exatamente 252 (1 ano útil completo)", "253+ (mais de 1 ano)"]
    contagem_por_faixa = [0] * len(faixas)
    for t in tickers_sem_dado:
        contagem_por_faixa[0] += 1
    for _, n, _, _ in contagens:
        for i, (lo, hi) in enumerate(faixas):
            if i == 0:
                continue
            if lo <= n <= hi:
                contagem_por_faixa[i] += 1
                break
    for label, n in zip(labels, contagem_por_faixa):
        print(f"  {label:38s} {n:5d} tickers")

    print()
    print("10 tickers com MENOS cobertura (excluindo zero):")
    piores = [c for c in contagens if c[1] > 0][:10]
    for t, n, dmin, dmax in piores:
        print(f"  {t:8s} {n:4d} linhas  ({dmin} -> {dmax})")

    print()
    print("10 tickers com MAIS cobertura:")
    melhores = contagens[-10:][::-1]
    for t, n, dmin, dmax in melhores:
        print(f"  {t:8s} {n:4d} linhas  ({dmin} -> {dmax})")

    # Tickers "curados" da brapi (rv_historico.py::ATIVOS) -- conferir se
    # esses, que são os mostrados nas páginas principais do frontend, têm
    # cobertura completa (são só 16 ações + 15 FIIs, não o universo COTAHIST inteiro).
    curados = [
        "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "WEGE3", "RENT3", "LREN3",
        "MGLU3", "ABEV3", "SUZB3", "RDOR3", "HAPV3", "CSAN3", "ELET3", "VIVT3",
        "BTLG11", "HGLG11", "XPLG11", "KNRI11", "MXRF11", "HGRE11", "VISC11",
        "XPML11", "GGRC11", "KFOF11", "CPTS11", "PVBI11", "RBRF11", "TRXF11", "BRCR11",
    ]
    print()
    print("=" * 70)
    print("COBERTURA DOS TICKERS CURADOS (rv_historico.py::ATIVOS)")
    print("=" * 70)
    for t in curados:
        n = len(por_ticker.get(t, []))
        if n == 0:
            print(f"  [SEM DADO] {t}")
        else:
            datas = por_ticker[t]
            print(f"  {t:8s} {n:4d} linhas  ({min(datas)} -> {max(datas)})")

    if tickers_sem_dado:
        print()
        print(f"Amostra de até 20 tickers do universo SEM nenhum dado em rv_historico:")
        for t in sorted(tickers_sem_dado)[:20]:
            print(f"  {t}")


if __name__ == "__main__":
    main()
