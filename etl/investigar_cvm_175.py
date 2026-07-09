"""
Investigação pontual (descartável) -- NÃO é ETL de produção, só leitura e
print, não grava nada.

Objetivo: mapear a estrutura real e atual do cadastro de fundos da CVM
pós-Resolução CVM 175 (fundos/classes/subclasses), depois que o sorteio de
novos fundos rodou contra a CVM real e voltou com só 21 candidatos --
achado: cad_fi.csv (o que fundos.py usa hoje) parece cobrir só o dataset
"Fundos de Investimento - Não Adaptados RCVM175", um universo cada vez
menor. A maior parte migrou pra uma estrutura nova (registro_fundo.csv,
registro_classe.csv, registro_subclasse.csv, dentro de um zip
registro_fundo_classe.zip), que já traz Patrimonio_Liquido direto no
cadastro -- se os 8 CNPJs curados estiverem lá, elimina a necessidade de
baixar o inf_diario_fi mensal (dezenas/centenas de MB) só pra filtrar/
atualizar por PL.

Este script tenta baixar e inspecionar tudo isso, sonda se o inf_diario_fi
legado ainda é publicado (testando vários meses, não só os 2 mais
recentes), e verifica se os 8 CNPJs já rastreados (CNPJS_ALVO) aparecem no
cadastro legado ou no novo.

Achado da rodada anterior: inf_diario_fi confirmado morto (403 em 5 meses
testados, incluindo dez/2024) -- não é lag, é descontinuação de fato. O zip
novo (registro_fundo_classe.zip) resolve cadastro/PL, mas NÃO tem série
histórica diária de cotas (só 1 PL "mais recente" por fundo/classe) --
fund_analytics.py precisa de cota diária pra Sharpe/vol/drawdown. Passo 5
abaixo consulta a API CKAN do próprio portal (package_show/group_show) pra
descobrir de fato -- não adivinhar -- se existe um informe diário novo por
classe de cotas e qual o nome/padrão real do arquivo.

Achado de uma rodada anterior: a 1a versão desse último check comparava
substring cru contra o texto inteiro do arquivo -- dava falso negativo em
registro_fundo.csv/registro_classe.csv, que guardam CNPJ sem pontuação
("00016999000167"), diferente de cad_fi.csv ("00.016.999/0001-67"). Reescrito
pra parsear a coluna de CNPJ de verdade (csv.DictReader) e comparar só
dígitos dos dois lados -- também evita falso positivo por concatenação
acidental de dígitos entre colunas vizinhas, que um substring cru arriscaria.

Achado de 3 rodadas (de 5 dispatches): o runner do GitHub Actions às vezes
sobe sem conseguir alcançar NENHUM host externo (`[Errno 101] Network is
unreachable` em toda URL testada, do começo ao fim do job) -- não é
específico da CVM. Antes, isso derrubava o job inteiro no timeout de 5min
sem nenhuma conclusão (só descobria a falha 60s por URL, 1 tentativa cada,
até o tempo acabar). Agora `tentar()`/`consultar_ckan()` distinguem
"não encontrado" (404/403, resposta definitiva do servidor, não retenta) de
falha de conexão (retenta algumas vezes com pausa curta) e, se a falha de
conexão persistir mesmo após as tentativas, `run()` aborta cedo com uma
mensagem clara em vez de repetir a mesma falha em cada URL seguinte até
estourar o timeout do job.

Uso: python investigar_cvm_175.py
"""

import csv
import io
import time
import zipfile

import httpx

from fundos import CNPJS_ALVO, DEFAULT_USER_AGENT

BASE_CAD = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS"
BASE_HIST = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS"
BASE_API = "https://dados.cvm.gov.br/api/3/action"

# CVM responde em <1s quando alcançável (zip de 6,7MB baixou em <1s numa
# rodada bem-sucedida) -- 15s de timeout por tentativa é folga generosa sem
# desperdiçar o orçamento de 5min do job numa URL que não vai responder.
# Exceção: o zip, historicamente mais pesado, mantém timeout maior (ver item 5).
TIMEOUT_PADRAO = 15.0
MAX_TENTATIVAS_CONEXAO = 3
PAUSA_ENTRE_TENTATIVAS = 3.0


class FalhaDeConexao(Exception):
    """Sinaliza que uma URL falhou por problema de conexão (ENETUNREACH,
    timeout) mesmo após todas as tentativas -- diferente de 404/403 (resposta
    definitiva do servidor, "não publicado"). `run()` usa isso como circuit
    breaker: se a primeira URL já falhar assim, provavelmente o runner
    inteiro está sem saída de rede nesta execução (já visto: quando
    acontece, acontece em TODA URL, não só numa) -- não adianta insistir nas
    próximas, é melhor abortar e relatar cedo."""

# Coluna que identifica o CNPJ do próprio fundo/classe em cada arquivo --
# nomes confirmados nos headers reais (rodada anterior). registro_subclasse.csv
# não tem CNPJ próprio (é vinculada por ID_Registro_Classe), fica de fora.
COLUNA_CNPJ = {
    "cad_fi.csv": "CNPJ_FUNDO",
    "registro_fundo.csv": "CNPJ_Fundo",
    "registro_classe.csv": "CNPJ_Classe",
}


def normalizar_cnpj(cnpj: str) -> str:
    return "".join(c for c in cnpj if c.isdigit())


def tentar(url: str, client: httpx.Client, nome: str, timeout: float = TIMEOUT_PADRAO) -> bytes | None:
    """Baixa `url`. 404/403 é resposta definitiva do servidor ("não
    publicado") -- não retenta. Falha de conexão retenta até
    MAX_TENTATIVAS_CONEXAO vezes com pausa curta; se persistir em todas,
    levanta FalhaDeConexao (ver docstring do módulo e `run()`)."""
    print(f"\n--- {nome} ---\n  {url}")
    headers = {"User-Agent": DEFAULT_USER_AGENT}
    for tentativa in range(1, MAX_TENTATIVAS_CONEXAO + 1):
        try:
            resp = client.get(url, timeout=timeout, headers=headers)
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            print(f"  [aviso] tentativa {tentativa}/{MAX_TENTATIVAS_CONEXAO} — falha de conexão: {e}")
            if tentativa < MAX_TENTATIVAS_CONEXAO:
                time.sleep(PAUSA_ENTRE_TENTATIVAS)
            continue

        if resp.status_code in (404, 403):
            print(f"  -> não encontrado / não publicado (HTTP {resp.status_code})")
            return None
        if resp.status_code in (500, 502, 503, 504):
            print(f"  [aviso] tentativa {tentativa}/{MAX_TENTATIVAS_CONEXAO} — HTTP {resp.status_code}")
            if tentativa < MAX_TENTATIVAS_CONEXAO:
                time.sleep(PAUSA_ENTRE_TENTATIVAS)
            continue

        resp.raise_for_status()
        print(f"  -> OK: {len(resp.content):,} bytes")
        return resp.content

    print(f"  -> falha de conexão persistente após {MAX_TENTATIVAS_CONEXAO} tentativas")
    raise FalhaDeConexao(nome)


def inspecionar_csv(conteudo: bytes, nome: str, n_amostras: int = 2) -> None:
    linhas = conteudo.decode("latin-1", errors="replace").splitlines()
    print(f"  [{nome}] {len(linhas):,} linha(s) totais (incl. header)")
    if linhas:
        print(f"  [{nome}] header: {linhas[0][:400]}")
    for l in linhas[1:1 + n_amostras]:
        print(f"  [{nome}] amostra: {l[:300]}")


def checar_cnpjs_curados(conteudo: bytes, nome: str) -> None:
    """Compara CNPJS_ALVO (normalizado, só dígitos) contra a coluna de CNPJ
    do próprio fundo/classe -- parseada de verdade via csv.DictReader, não
    um substring cru no texto inteiro (ver docstring do módulo)."""
    coluna = COLUNA_CNPJ.get(nome)
    if coluna is None:
        print(f"  [{nome}] sem coluna de CNPJ própria conhecida -- pulando checagem")
        return

    texto = conteudo.decode("latin-1", errors="replace")
    leitor = csv.DictReader(io.StringIO(texto), delimiter=";")
    if coluna not in (leitor.fieldnames or []):
        print(f"  [{nome}] coluna '{coluna}' não encontrada -- header real: {leitor.fieldnames}")
        return

    presentes = {normalizar_cnpj(linha.get(coluna) or "") for linha in leitor}
    presentes.discard("")
    for cnpj in CNPJS_ALVO:
        achou = normalizar_cnpj(cnpj) in presentes
        print(f"  [{nome}] {cnpj}: {'PRESENTE' if achou else 'ausente'}")


def consultar_ckan(client: httpx.Client, endpoint: str, params: dict, nome: str, timeout: float = TIMEOUT_PADRAO) -> dict | None:
    """Consulta a API CKAN do portal (o mesmo motor por trás das páginas de
    dataset) -- fonte de verdade sobre quais recursos/arquivos existem de
    fato, em vez de adivinhar nome de arquivo. Mesma semântica de retry de
    `tentar()`: HTTP de resposta definitiva (404 = pacote/grupo inexistente,
    não retenta) vs. falha de conexão (retenta, levanta FalhaDeConexao se
    persistir)."""
    url = f"{BASE_API}/{endpoint}"
    print(f"\n--- CKAN API: {nome} ---\n  {url} params={params}")
    headers = {"User-Agent": DEFAULT_USER_AGENT}
    for tentativa in range(1, MAX_TENTATIVAS_CONEXAO + 1):
        try:
            resp = client.get(url, params=params, timeout=timeout, headers=headers)
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            print(f"  [aviso] tentativa {tentativa}/{MAX_TENTATIVAS_CONEXAO} — falha de conexão: {e}")
            if tentativa < MAX_TENTATIVAS_CONEXAO:
                time.sleep(PAUSA_ENTRE_TENTATIVAS)
            continue

        if resp.status_code == 404:
            print("  -> HTTP 404 (pacote/grupo não existe)")
            return None
        if resp.status_code in (500, 502, 503, 504):
            print(f"  [aviso] tentativa {tentativa}/{MAX_TENTATIVAS_CONEXAO} — HTTP {resp.status_code}")
            if tentativa < MAX_TENTATIVAS_CONEXAO:
                time.sleep(PAUSA_ENTRE_TENTATIVAS)
            continue

        if resp.status_code != 200:
            print(f"  -> HTTP {resp.status_code}")
            return None
        dados = resp.json()
        if not dados.get("success"):
            print(f"  -> success=false: {dados.get('error')}")
            return None
        return dados["result"]

    print(f"  -> falha de conexão persistente após {MAX_TENTATIVAS_CONEXAO} tentativas")
    raise FalhaDeConexao(nome)


def inspecionar_resources(resultado: dict) -> None:
    recursos = resultado.get("resources", [])
    print(f"  {len(recursos)} recurso(s) no pacote '{resultado.get('name')}':")
    for r in recursos:
        ultima_mod = r.get("last_modified") or r.get("created")
        print(f"    - {r.get('name')} | formato={r.get('format')} | última_modificação={ultima_mod}")
        print(f"      url={r.get('url')}")


def inspecionar_pacotes_do_grupo(resultado: dict) -> None:
    pacotes = resultado.get("packages", [])
    nome_grupo = resultado.get("display_name") or resultado.get("name")
    print(f"  {len(pacotes)} dataset(s) no grupo '{nome_grupo}':")
    for p in pacotes:
        print(f"    - {p.get('name')}: {p.get('title')}")


def run() -> None:
    print("=== Investigação CVM Resolução 175 (fundos/classes/subclasses) ===")

    try:
        with httpx.Client() as client:
            # 1. API CKAN primeiro -- é a pergunta ainda em aberto (fonte de
            # série diária de cotas pós-RCVM175 pra fundos_historico/
            # fund_analytics.py). Os passos 2-5 abaixo já têm resposta
            # confirmada de uma rodada anterior bem-sucedida.
            resultado = consultar_ckan(
                client, "package_show", {"id": "fi-doc-inf_diario"},
                "fi-doc-inf_diario (recursos do informe diário atual)",
            )
            if resultado:
                inspecionar_resources(resultado)

            resultado = consultar_ckan(
                client, "group_show", {"id": "fundos-de-investimento", "include_datasets": "true"},
                "grupo fundos-de-investimento (todos os datasets)",
            )
            if resultado:
                inspecionar_pacotes_do_grupo(resultado)

            # 2. cad_fi.csv -- confirma tamanho/estrutura e se os 8 CNPJs curados
            # ainda estão no dataset "não adaptados" que fundos.py usa hoje.
            c = tentar(f"{BASE_CAD}/cad_fi.csv", client, "cad_fi.csv (legado / não-adaptados)")
            if c:
                inspecionar_csv(c, "cad_fi.csv")
                checar_cnpjs_curados(c, "cad_fi.csv")

            # 3. Tentativas diretas dos CSVs novos (talvez não existam soltos,
            # só dentro do zip -- ver item 5).
            for nome_arq in ["registro_fundo.csv", "registro_classe.csv", "registro_subclasse.csv"]:
                c = tentar(f"{BASE_CAD}/{nome_arq}", client, nome_arq)
                if c:
                    inspecionar_csv(c, nome_arq)
                    checar_cnpjs_curados(c, nome_arq)

            # 4. Sonda inf_diario_fi legado em vários meses -- descontinuado de
            # vez, ou só os 2 mais recentes têm lag maior que o esperado?
            for aaaamm in ["202607", "202605", "202601", "202412"]:
                tentar(f"{BASE_HIST}/inf_diario_fi_{aaaamm}.csv", client, f"inf_diario_fi_{aaaamm}.csv")

            # 5. Bundle em zip, conforme documentado no portal -- zip maior
            # que os CSVs soltos, mantém timeout mais folgado por tentativa
            # (ver comentário histórico no git blame: a CVM já ficou >8min
            # sem responder nem falhar numa tentativa com um arquivo bem
            # maior que este).
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
    except FalhaDeConexao as e:
        print(
            f"\n!!! Falha de conexão persistente em '{e}' mesmo após "
            f"{MAX_TENTATIVAS_CONEXAO} tentativas -- runner provavelmente sem "
            f"conectividade externa nesta execução (já visto antes: quando "
            f"acontece, acontece em TODA URL testada, não é específico da "
            f"CVM). Abortando o restante da investigação em vez de repetir a "
            f"mesma falha até o timeout do job -- redisparar deve pegar um "
            f"runner novo."
        )
        return

    print("\n=== Fim da investigação ===")


if __name__ == "__main__":
    run()
