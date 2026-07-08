"""
Investigação pontual (descartável) -- NÃO é ETL de produção, só leitura e
print, não grava nada.

Objetivo: mapear a estrutura real e atual do cadastro de fundos da CVM
pós-Resolução CVM 175 (fundos/classes/subclasses), depois que o sorteio de
novos fundos rodou contra a CVM real e voltou com só 21 candidatos --
achado: cad_fi.csv (o que fundos.py usa hoje) parece cobrir só o dataset
"Fundos de Investimento - Não Adaptados RCVM175", um universo cada vez
menor. A maior parte migrou pra uma estrutura nova (registro_fundo.csv,
registro_classe.csv, registro_subclasse.csv, possivelmente dentro de um
zip registro_fundo_classe.zip), que aparentemente já traz Patrimonio_Liquido
direto no cadastro -- se confirmado, elimina a necessidade de baixar o
inf_diario_fi mensal (dezenas/centenas de MB) só pra filtrar por PL.

Este script tenta baixar e inspecionar tudo isso, sonda se o inf_diario_fi
legado ainda é publicado (testando vários meses, não só os 2 mais
recentes), e verifica se os 8 CNPJs já rastreados (CNPJS_ALVO) aparecem no
cadastro legado ou não.

Uso: python investigar_cvm_175.py
"""

import io
import zipfile

import httpx

from fundos import CNPJS_ALVO, DEFAULT_USER_AGENT
from log_etl import baixar_arquivo_http

BASE_CAD = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS"
BASE_HIST = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS"


def tentar(url: str, client: httpx.Client, nome: str, timeout: float = 60.0) -> bytes | None:
    print(f"\n--- {nome} ---\n  {url}")
    conteudo = baixar_arquivo_http(
        url, client,
        # timeout do httpx é por operação (connect/read/write), não um teto
        # de duração total -- um arquivo grande que não trava mas transfere
        # devagar em pedacinhos pode passar disso sem nunca "estourar".
        # 60s por tentativa, 1 tentativa só -- é diagnóstico, não produção;
        # melhor falhar rápido e reportar "não deu" do que travar minutos.
        user_agent=DEFAULT_USER_AGENT, max_attempts=1, timeout=timeout,
        not_found_status=(404, 403),
    )
    if conteudo is None:
        print("  -> não encontrado / não publicado")
        return None
    print(f"  -> OK: {len(conteudo):,} bytes")
    return conteudo


def inspecionar_csv(conteudo: bytes, nome: str, n_amostras: int = 2) -> None:
    linhas = conteudo.decode("latin-1", errors="replace").splitlines()
    print(f"  [{nome}] {len(linhas):,} linha(s) totais (incl. header)")
    if linhas:
        print(f"  [{nome}] header: {linhas[0][:400]}")
    for l in linhas[1:1 + n_amostras]:
        print(f"  [{nome}] amostra: {l[:300]}")


def checar_cnpjs_curados(conteudo: bytes, nome: str) -> None:
    texto = conteudo.decode("latin-1", errors="replace")
    for cnpj in CNPJS_ALVO:
        achou = cnpj in texto
        print(f"  [{nome}] {cnpj}: {'PRESENTE' if achou else 'ausente'}")


def run() -> None:
    print("=== Investigação CVM Resolução 175 (fundos/classes/subclasses) ===")

    with httpx.Client() as client:
        # 1. cad_fi.csv -- confirma tamanho/estrutura e se os 8 CNPJs curados
        # ainda estão no dataset "não adaptados" que fundos.py usa hoje.
        c = tentar(f"{BASE_CAD}/cad_fi.csv", client, "cad_fi.csv (legado / não-adaptados)")
        if c:
            inspecionar_csv(c, "cad_fi.csv")
            checar_cnpjs_curados(c, "cad_fi.csv")

        # 2. Tentativas diretas dos CSVs novos (talvez não existam soltos,
        # só dentro do zip -- ver item 3).
        for nome_arq in ["registro_fundo.csv", "registro_classe.csv", "registro_subclasse.csv"]:
            c = tentar(f"{BASE_CAD}/{nome_arq}", client, nome_arq)
            if c:
                inspecionar_csv(c, nome_arq)
                checar_cnpjs_curados(c, nome_arq)

        # 3. Sonda inf_diario_fi legado em vários meses -- descontinuado de
        # vez, ou só os 2 mais recentes têm lag maior que o esperado?
        for aaaamm in ["202607", "202605", "202601", "202412"]:
            tentar(f"{BASE_HIST}/inf_diario_fi_{aaaamm}.csv", client, f"inf_diario_fi_{aaaamm}.csv")

        # 4. Bundle em zip, conforme mencionado na documentação do portal --
        # por último e com timeout mais curto: acho que os 2 timeouts >5min
        # nas rodadas anteriores (cad_fi_hist.zip, e possivelmente este zip
        # também) são um arquivo grande demais pro objetivo de diagnóstico
        # -- timeout do httpx não é um teto de duração total, só por
        # operação, então nada aqui "estoura" mesmo demorando muito.
        c = tentar(
            f"{BASE_CAD}/registro_fundo_classe.zip", client,
            "registro_fundo_classe.zip", timeout=20.0,
        )
        if c:
            with zipfile.ZipFile(io.BytesIO(c)) as zf:
                print(f"  [registro_fundo_classe.zip] conteúdo: {zf.namelist()}")
                for nome_interno in zf.namelist():
                    with zf.open(nome_interno) as f:
                        dados = f.read()
                    inspecionar_csv(dados, nome_interno)
                    checar_cnpjs_curados(dados, nome_interno)

    print("\n=== Fim da investigação ===")


if __name__ == "__main__":
    run()
