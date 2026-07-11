"""
POC — Dados fundamentalistas (DFP/ITR) da CVM, portal de dados abertos.

NÃO é um ETL de produção -- é uma prova de conceito pra responder uma
pergunta concreta: dá pra derivar indicadores fundamentalistas (ROE, P/L)
de verdade a partir dos arquivos públicos da CVM, ou a complexidade do plano
de contas (estrutura diferente entre empresa financeira e não-financeira,
CNPJ->ticker, ORDEM_EXERC duplicando período atual/anterior no mesmo CSV)
inviabiliza isso pro escopo do projeto?

Testa 3 empresas de propósito: PETROBRAS e VALE (não-financeiras, DRE/BP
"padrão") e ITAÚ UNIBANCO (financeira, estrutura de balanço diferente --
bancos não têm "Ativo Circulante"/"Passivo Circulante" convencional).

Baixa o DFP consolidado do ano mais recente disponível (tenta o ano corrente
e cai pro anterior se ainda não publicado -- DFP anual normalmente sai só
depois do encerramento do exercício), extrai Lucro Líquido (DRE) e
Patrimônio Líquido (BPP) só da linha ORDEM_EXERC="ÚLTIMO" (o CSV traz
período atual E anterior juntos, pra comparação -- pegar os dois sem
filtrar dobraria/erraria o número), e calcula ROE = Lucro Líquido /
Patrimônio Líquido como sanity check.

P/L fica de fora deste POC: exige nº de ações ou EPS, que não vem direto no
DRE consolidado (precisaria de outro arquivo -- "Lucro Básico/Diluído por
Ação" nem sempre presente, ou nº de ações do cadastro cia_aberta) -- decisão
consciente de escopo pra manter o POC focado na pergunta central (dá pra
parsear o plano de contas de verdade?).

Uso: python poc_cvm_fundamentos.py
"""
import io
import zipfile

import httpx
import pandas as pd

from log_etl import baixar_arquivo_http, DEFAULT_USER_AGENT, hoje_brt

URL_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS"

# Empresas de teste -- combinação proposital de estrutura "padrão"
# (não-financeira) e "financeira" (banco), pra validar se o parser precisa
# de 2 caminhos ou se dá pra tratar igual.
EMPRESAS_TESTE = ["PETROBRAS", "VALE", "ITAU UNIBANCO"]


def _baixar_zip_dfp(ano: int, client: httpx.Client) -> bytes | None:
    url = f"{URL_BASE}/dfp_cia_aberta_{ano}.zip"
    print(f"Tentando {url} ...")
    return baixar_arquivo_http(
        url, client,
        user_agent=DEFAULT_USER_AGENT,
        max_attempts=2, timeout=120,
        not_found_status=(404, 403),
        msg_404=f"  [info] DFP {ano} ainda não publicado ou indisponível.",
    )


def _ler_csv_do_zip(zf: zipfile.ZipFile, nome: str) -> pd.DataFrame | None:
    if nome not in zf.namelist():
        print(f"  [aviso] {nome} não encontrado no zip. Arquivos disponíveis: {zf.namelist()}")
        return None
    with zf.open(nome) as f:
        return pd.read_csv(f, sep=";", encoding="latin-1", decimal=",")


def _extrair_valor(df: pd.DataFrame, empresa_termo: str, conta_desc_contem: str) -> tuple[str, float] | None:
    """Filtra por DENOM_CIA contendo `empresa_termo` (case-insensitive),
    ORDEM_EXERC == 'ÚLTIMO' (evita duplicar com o período anterior que o
    mesmo CSV também traz) e DS_CONTA contendo `conta_desc_contem`. Retorna
    (DENOM_CIA real encontrada, valor) ou None se não achou."""
    mask = (
        df["DENOM_CIA"].str.contains(empresa_termo, case=False, na=False)
        & (df["ORDEM_EXERC"] == "ÚLTIMO")
        & df["DS_CONTA"].str.contains(conta_desc_contem, case=False, na=False)
    )
    achados = df[mask]
    if achados.empty:
        return None
    # Pode haver mais de 1 linha (ex: várias contas com "lucro" no nome) --
    # pega a de maior nível hierárquico (CD_CONTA mais curto = conta-síntese).
    linha = achados.loc[achados["CD_CONTA"].str.len().idxmin()]
    return linha["DENOM_CIA"], float(linha["VL_CONTA"])


def main():
    print(f"POC CVM fundamentos -- {hoje_brt().isoformat()}\n")

    ano_atual = hoje_brt().year
    conteudo = None
    ano_usado = None
    with httpx.Client(follow_redirects=True) as client:
        for ano in (ano_atual, ano_atual - 1, ano_atual - 2):
            conteudo = _baixar_zip_dfp(ano, client)
            if conteudo:
                ano_usado = ano
                break

    if not conteudo:
        print("\nFALHA: nenhum ano testado teve DFP disponível. POC inconclusivo.")
        return

    print(f"\nOK -- baixado DFP {ano_usado} ({len(conteudo) / 1024:.0f} KB)\n")

    with zipfile.ZipFile(io.BytesIO(conteudo)) as zf:
        print("Arquivos no zip:")
        for nome in zf.namelist():
            print(f"  {nome}")
        print()

        dre = _ler_csv_do_zip(zf, f"dfp_cia_aberta_DRE_con_{ano_usado}.csv")
        bpp = _ler_csv_do_zip(zf, f"dfp_cia_aberta_BPP_con_{ano_usado}.csv")

    if dre is None or bpp is None:
        print("FALHA: não achei DRE_con ou BPP_con consolidado no zip. POC inconclusivo.")
        return

    print(f"DRE consolidado: {len(dre)} linhas, {dre['DENOM_CIA'].nunique()} empresas")
    print(f"BPP consolidado: {len(bpp)} linhas, {bpp['DENOM_CIA'].nunique()} empresas\n")

    resultados = []
    for termo in EMPRESAS_TESTE:
        print(f"--- {termo} ---")
        lucro = _extrair_valor(dre, termo, "lucro/prejuízo consolidado do período") \
            or _extrair_valor(dre, termo, "lucro/prejuízo do período")
        pl = _extrair_valor(bpp, termo, "patrimônio líquido consolidado") \
            or _extrair_valor(bpp, termo, "patrimônio líquido")

        if not lucro or not pl:
            print(f"  [FALHA] não consegui extrair Lucro Líquido e/ou Patrimônio Líquido pra '{termo}'.")
            resultados.append((termo, None, None, None))
            continue

        nome_empresa, lucro_valor = lucro
        _, pl_valor = pl
        roe = (lucro_valor / pl_valor * 100) if pl_valor else None
        print(f"  Empresa (nome oficial CVM): {nome_empresa}")
        print(f"  Lucro Líquido do período:   R$ {lucro_valor:,.0f} mil")
        print(f"  Patrimônio Líquido:         R$ {pl_valor:,.0f} mil")
        print(f"  ROE calculado:              {roe:.2f}%" if roe is not None else "  ROE: N/A")
        resultados.append((termo, nome_empresa, lucro_valor, pl_valor))
        print()

    print("=" * 60)
    print("RESUMO")
    print("=" * 60)
    ok = sum(1 for r in resultados if r[1] is not None)
    print(f"{ok}/{len(EMPRESAS_TESTE)} empresas com Lucro Líquido + Patrimônio Líquido extraídos com sucesso.")
    for termo, nome, lucro_valor, pl_valor in resultados:
        status = "OK" if nome else "FALHOU"
        print(f"  [{status}] {termo}")


if __name__ == "__main__":
    main()
