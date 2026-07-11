"""
POC — Dados fundamentalistas (DFP/ITR) da CVM, portal de dados abertos.

NÃO é um ETL de produção -- é uma prova de conceito pra responder uma
pergunta concreta: dá pra derivar indicadores fundamentalistas (ROE, P/L)
de verdade a partir dos arquivos públicos da CVM, ou a complexidade do plano
de contas (estrutura diferente entre empresa financeira e não-financeira,
CNPJ->ticker, ORDEM_EXERC duplicando período atual/anterior no mesmo CSV)
inviabiliza isso pro escopo do projeto?

Rodado 3x via workflow_dispatch contra dados reais -- confirmado que a
extração funciona pra empresa financeira e não-financeira com a mesma
lógica. Revisão de arquitetura + pair-review (achado real, independente nas
2 revisões) apontaram que o matching original por `DENOM_CIA.str.contains`
é frágil pra escalar de 3 empresas de teste pra um universo real: o termo
pode casar mais de 1 `CD_CVM` (ex: grupos com múltiplas cias abertas
registradas, como Cosan ou Eletrobras/Eletropar), e nesse caso o código
antigo pegava a linha de `CD_CONTA` mais curto SEM checar se vinha de uma
única empresa -- podia misturar Lucro Líquido de uma companhia com
Patrimônio Líquido de outra, silenciosamente.

Correção: `EMPRESAS_ALVO` mapeia ticker -> termo de busca; a etapa de
DESCOBERTA filtra por termo e resolve pra um único `CD_CVM` só quando o
termo casa exatamente 1 empresa distinta -- caso contrário marca como
ambíguo e não tenta adivinhar. A extração em si passa a filtrar por
`CD_CVM` (chave exata da CVM), não mais por nome. Também passou a
desempatar por `VERSAO` (retificação do mesmo exercício) antes de escolher
a conta-síntese -- sem isso, um DFP retificado no mesmo ano podia deixar
2 versões do mesmo valor no CSV e o resultado ficava não-determinístico.

P/L fica de fora deste POC: não precisa vir da CVM -- `rv_ativos.market_cap`
já existe em produção (populado via brapi.dev em rv_historico.py) e
P/L = market_cap / lucro_líquido dá pra calcular cruzando as duas fontes,
decisão vinda da revisão de arquitetura.

Uso: python poc_cvm_fundamentos.py
"""
import io
import zipfile

import httpx
import pandas as pd

from log_etl import baixar_arquivo_http, DEFAULT_USER_AGENT, hoje_brt

URL_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS"

# ticker -> termo de busca pra descoberta do CD_CVM. Os 16 ações reais
# rastreadas em rv_historico.py::ATIVOS (as FIIs da mesma lista não valem --
# DFP é pra companhias abertas, não fundos imobiliários).
#
# Achados do 1º dispatch pros 16 tickers (achados reais, não hipotéticos):
# - "BANCO DO BRASIL" não achou nada -- a CVM abrevia "Banco" como "BCO"
#   (confirmado: Bradesco aparece como "BCO BRADESCO S.A."), corrigido pra
#   "BCO BRASIL".
# - "REDE D OR" não achou nada -- o nome oficial tem apóstrofo ("D'OR"),
#   substring sem apóstrofo não bate. Corrigido pra termo mais curto "REDE D".
# - "ELETROBRAS" não achou nada -- corrigido pra "ELETRICAS BRASILEIRAS"
#   (nome-base da holding, igual ao campo `nome` já usado em ATIVOS).
# - "LOCALIZA" e "SUZANO" deram AMBÍGUO de verdade (2 CD_CVM distintos cada
#   -- ex: "LOCALIZA RENT A CAR S.A." vs "LOCALIZA FLEET S.A.", "SUZANO S.A."
#   vs "SUZANO HOLDING S.A.") -- mantidos como estão de propósito. Resolver
#   isso exige cruzar com o cadastro oficial ticker->CNPJ da B3/CVM (não
#   dá pra adivinhar qual das duas é a listada sob RENT3/SUZB3 só pelo nome
#   -- exatamente o tipo de "não tentar adivinhar" que a revisão pediu).
EMPRESAS_ALVO = {
    "PETR4": "PETROBRAS",
    "VALE3": "VALE",
    "ITUB4": "ITAU UNIBANCO",
    "BBDC4": "BRADESCO",
    "BBAS3": "BCO BRASIL",
    "WEGE3": "WEG S.A.",
    "RENT3": "LOCALIZA",
    "LREN3": "LOJAS RENNER",
    "MGLU3": "MAGAZINE LUIZA",
    "ABEV3": "AMBEV",
    "SUZB3": "SUZANO",
    "RDOR3": "REDE D",
    "HAPV3": "HAPVIDA",
    "CSAN3": "COSAN",
    "ELET3": "ELETRICAS BRASILEIRAS",
    "VIVT3": "TELEFONICA BRASIL",
}


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


def _normalizar_ascii(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _descobrir_cd_cvm(df: pd.DataFrame, termo: str) -> list[tuple[int, str]]:
    """Retorna a lista de (CD_CVM, DENOM_CIA) distintos cujo nome contém
    `termo` (comparação sem acento, case-insensitive) -- usado pra resolver
    o ticker pra uma chave exata da CVM sem depender de substring na hora de
    extrair o valor de verdade."""
    nomes_norm = df["DENOM_CIA"].apply(lambda s: _normalizar_ascii(str(s)).upper())
    termo_norm = _normalizar_ascii(termo).upper()
    mask = nomes_norm.str.contains(termo_norm, na=False)
    pares = df.loc[mask, ["CD_CVM", "DENOM_CIA"]].drop_duplicates()
    return list(pares.itertuples(index=False, name=None))


def _extrair_valor(df: pd.DataFrame, cd_cvm: int, conta_desc_contem: str) -> float | None:
    """Filtra por CD_CVM exato (chave da CVM, não nome -- ver docstring do
    módulo), ORDEM_EXERC == 'ÚLTIMO' (evita duplicar com o período anterior
    que o mesmo CSV também traz) e DS_CONTA contendo `conta_desc_contem`.
    Desempata por VERSAO máxima primeiro (retificação), depois por
    CD_CONTA mais curto (conta-síntese, não subitem). Retorna o valor ou
    None se não achou."""
    mask = (
        (df["CD_CVM"] == cd_cvm)
        & (df["ORDEM_EXERC"] == "ÚLTIMO")
        & df["DS_CONTA"].str.contains(conta_desc_contem, case=False, na=False)
    )
    achados = df[mask]
    if achados.empty:
        return None
    versao_max = achados["VERSAO"].max()
    achados = achados[achados["VERSAO"] == versao_max]
    linha = achados.loc[achados["CD_CONTA"].str.len().idxmin()]
    return float(linha["VL_CONTA"])


def main():
    print(f"POC CVM fundamentos -- {hoje_brt().isoformat()}\n")

    ano_atual = hoje_brt().year
    conteudo = None
    ano_usado = None
    # Achado do 1º dispatch: dfp_cia_aberta_{ano_atual}.zip existe e baixa
    # com 200 (não cai no fallback), mas o ano fiscal corrente ainda não
    # fechou -- só 7 empresas tinham arquivo, nenhuma das 3 de teste. O
    # zip.csv é indexado por ano de REFERÊNCIA (exercício), não de
    # submissão -- ano_atual-1 é o mais recente com temporada de
    # apresentação já encerrada (prazo CVM é ~abril do ano seguinte).
    with httpx.Client(follow_redirects=True) as client:
        for ano in (ano_atual - 1, ano_atual - 2, ano_atual):
            conteudo = _baixar_zip_dfp(ano, client)
            if conteudo:
                ano_usado = ano
                break

    if not conteudo:
        print("\nFALHA: nenhum ano testado teve DFP disponível. POC inconclusivo.")
        return

    print(f"\nOK -- baixado DFP {ano_usado} ({len(conteudo) / 1024:.0f} KB)\n")

    with zipfile.ZipFile(io.BytesIO(conteudo)) as zf:
        dre = _ler_csv_do_zip(zf, f"dfp_cia_aberta_DRE_con_{ano_usado}.csv")
        bpp = _ler_csv_do_zip(zf, f"dfp_cia_aberta_BPP_con_{ano_usado}.csv")

    if dre is None or bpp is None:
        print("FALHA: não achei DRE_con ou BPP_con consolidado no zip. POC inconclusivo.")
        return

    print(f"DRE consolidado: {len(dre)} linhas, {dre['DENOM_CIA'].nunique()} empresas")
    print(f"BPP consolidado: {len(bpp)} linhas, {bpp['DENOM_CIA'].nunique()} empresas\n")

    # ── Descoberta: resolve ticker -> CD_CVM só quando o termo casa exatamente
    # 1 empresa distinta. Termo ambíguo (>1) ou sem match (0) fica marcado
    # como tal, não tenta adivinhar (achado da revisão de pair-programming).
    print("=" * 60)
    print("DESCOBERTA (ticker -> CD_CVM)")
    print("=" * 60)
    resolvidos: dict[str, tuple[int, str]] = {}
    ambiguos: dict[str, list] = {}
    for ticker, termo in EMPRESAS_ALVO.items():
        candidatos = _descobrir_cd_cvm(dre, termo)
        if len(candidatos) == 1:
            cd_cvm, nome = candidatos[0]
            resolvidos[ticker] = (int(cd_cvm), nome)
            print(f"  [OK]        {ticker:6s} '{termo}' -> CD_CVM {cd_cvm} ({nome})")
        elif len(candidatos) == 0:
            ambiguos[ticker] = []
            print(f"  [SEM MATCH] {ticker:6s} '{termo}' -> nenhuma empresa encontrada no DFP {ano_usado}")
        else:
            ambiguos[ticker] = candidatos
            print(f"  [AMBIGUO]   {ticker:6s} '{termo}' -> {len(candidatos)} empresas casaram, não resolvido automaticamente:")
            for cd_cvm, nome in candidatos:
                print(f"                 CD_CVM {cd_cvm}: {nome}")
    print()

    # ── Extração pros tickers resolvidos sem ambiguidade ──────────────────
    print("=" * 60)
    print(f"EXTRAÇÃO ({len(resolvidos)}/{len(EMPRESAS_ALVO)} tickers resolvidos)")
    print("=" * 60)
    resultados = []
    for ticker, (cd_cvm, nome) in resolvidos.items():
        print(f"--- {ticker} ({nome}, CD_CVM {cd_cvm}) ---")
        # BBDC4 (achado real do 1º dispatch dos 16 tickers): CD_CVM resolvido
        # sem ambiguidade, mas nenhum dos 2 termos batia com DS_CONTA -- mais
        # variantes de fallback pra cobrir fraseado diferente por empresa.
        lucro = (
            _extrair_valor(dre, cd_cvm, "lucro/prejuízo consolidado do período")
            or _extrair_valor(dre, cd_cvm, "lucro/prejuízo do período")
            or _extrair_valor(dre, cd_cvm, "lucro líquido consolidado do período")
            or _extrair_valor(dre, cd_cvm, "lucro líquido do período")
            or _extrair_valor(dre, cd_cvm, "resultado líquido consolidado do período")
            or _extrair_valor(dre, cd_cvm, "resultado líquido do período")
        )
        pl = (
            _extrair_valor(bpp, cd_cvm, "patrimônio líquido consolidado")
            or _extrair_valor(bpp, cd_cvm, "patrimônio líquido")
        )

        if lucro is None or pl is None:
            print("  [FALHA] não consegui extrair Lucro Líquido e/ou Patrimônio Líquido.")
            resultados.append((ticker, nome, None, None, None))
            print()
            continue

        roe = (lucro / pl * 100) if pl else None
        print(f"  Lucro Líquido do período:   R$ {lucro:,.0f} mil")
        print(f"  Patrimônio Líquido:         R$ {pl:,.0f} mil")
        print(f"  ROE calculado:              {roe:.2f}%" if roe is not None else "  ROE: N/A")
        resultados.append((ticker, nome, lucro, pl, roe))
        print()

    print("=" * 60)
    print("RESUMO")
    print("=" * 60)
    ok = sum(1 for r in resultados if r[2] is not None)
    print(f"{ok}/{len(EMPRESAS_ALVO)} tickers com Lucro Líquido + Patrimônio Líquido extraídos com sucesso.")
    for ticker, nome, lucro, pl, roe in resultados:
        status = "OK" if lucro is not None else "FALHOU"
        extra = f" ROE={roe:.2f}%" if roe is not None else ""
        print(f"  [{status}] {ticker} ({nome}){extra}")
    if ambiguos:
        print(f"\n{len(ambiguos)} ticker(s) não resolvido(s) automaticamente (ambíguo ou sem match):")
        for ticker in ambiguos:
            print(f"  [PENDENTE] {ticker} ({EMPRESAS_ALVO[ticker]})")


if __name__ == "__main__":
    main()
