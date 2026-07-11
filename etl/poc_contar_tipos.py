"""Consulta pontual -- distribuição de tipo em rv_ativos (paginado)."""
from collections import Counter
from config import supabase

TAMANHO_PAGINA = 1000


def main():
    ativos = []
    inicio = 0
    while True:
        pagina = (
            supabase.table("rv_ativos")
            .select("ticker,tipo,ativo")
            .order("ticker")
            .range(inicio, inicio + TAMANHO_PAGINA - 1)
            .execute()
        )
        lote = pagina.data or []
        ativos.extend(lote)
        if len(lote) < TAMANHO_PAGINA:
            break
        inicio += TAMANHO_PAGINA

    print(f"Total rv_ativos: {len(ativos)}\n")
    contagem = Counter(a.get("tipo") or "(vazio)" for a in ativos)
    for tipo, n in contagem.most_common():
        print(f"  {tipo:20s} {n:5d}")

    print()
    acao_ativos = [a for a in ativos if a.get("tipo") == "ACAO" and a.get("ativo")]
    print(f"ACAO com ativo=true: {len(acao_ativos)}")
    print()
    print("Amostra de 15 tickers tipo=ACAO:")
    for a in acao_ativos[:15]:
        print(f"  {a['ticker']}")


if __name__ == "__main__":
    main()
