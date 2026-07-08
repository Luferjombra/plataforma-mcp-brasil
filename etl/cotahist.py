"""
ETL — COTAHIST (B3) — Fase 1 do plano de migração (ver ADR-001)

Fonte: arquivo público diário da B3 — um único download cobre TODOS os
papéis do mercado à vista negociados no dia (ações, FIIs, BDRs, ETFs/fundos),
ao contrário do rv_historico.py atual (brapi.dev, ticker a ticker, lista fixa
de ~30 papéis, rate-limited).

URL: https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D<ddmmaaaa>.ZIP
Layout oficial: SeriesHistoricas_Layout.pdf (B3), registro tipo "01", 245 bytes.

IMPORTANTE — Fase 1 (staging), não produção:
  Este script escreve SÓ em rv_ativos_staging / rv_historico_staging.
  NUNCA em rv_ativos / rv_historico (produção, alimentada pelo rv_historico.py
  via brapi.dev). A promoção staging -> produção só acontece na Fase 2,
  depois de validação cruzada — ver ADR-001. Rodar os dois em paralelo sem essa
  separação faria upsert colidir na mesma PK (ticker, data) sem rastro de
  qual fonte "venceu".

Objetivo desta semana: este script roda várias vezes ao dia (ver etl.yml)
para descobrirmos empiricamente a que horas a B3 publica o arquivo do dia.
Por isso "arquivo ainda não disponível" (404) é tratado como resultado
esperado/informativo, não como falha do job.

Classificação ETF vs. fundo genérico (resolvido 2026-07-08, ver ADR-001,
Fase 2 item 2): o layout público do COTAHIST não distingue ETF de outros
fundos negociados em bolsa (FIAgro, FIDC listado etc.) só pela ESPECI "CI" —
os dois usam o mesmo código. Por isso a classificação final usa uma lista
curada de ETFs conhecidos (ETFS_CONHECIDOS, confirmados via B3/gestoras) e
cai em 'FUNDO_LISTADO' para o resto do universo "CI". Não é um critério
estrutural do arquivo, é curadoria — expandir ETFS_CONHECIDOS conforme
novos ETFs forem confirmados.
"""

import io
import zipfile
import datetime
import httpx
from config import supabase
from log_etl import ETLRun, hoje_brt

BASE_URL = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist"

TPMERC_VISTA = "010"
CODBDI_LOTE_PADRAO = "02"
CODBDI_FII = "12"
CODBDI_FRACIONARIO = "96"

# Papéis com classificação conhecida e não-ambígua — usados como smoke test
# antes de aceitar o parse do dia. Critério de saída da Fase 1 (ADR-001):
# N >= 3 execuções diárias consecutivas sem falha aqui.
SMOKE_TEST_ESPERADO = {
    "PETR4": "PN",
    "VALE3": "ON",
    "ITUB4": "PN",
    "BBAS3": "ON",
    "WEGE3": "ON",
    "HGLG11": "FII",
    "MXRF11": "FII",
    "KNRI11": "FII",
    "BOVA11": "ETF",
}

# ETFs confirmados (curadoria manual — ver docstring do módulo). Fontes:
# BOVA11/IVVB11/SMAL11 — iShares/BlackRock (replicam Ibovespa, S&P 500 e
# Small Cap); XFIX11 — XP Vista Asset (ETF do IFIX, primeiro ETF imobiliário
# do Brasil, confirmado pela própria B3).
ETFS_CONHECIDOS = {"BOVA11", "IVVB11", "SMAL11", "XFIX11"}


# ── Download ──────────────────────────────────────────────────────────────────

def nome_arquivo(data: datetime.date) -> str:
    return f"COTAHIST_D{data.strftime('%d%m%Y')}.ZIP"


def proximo_dia_util(data: datetime.date) -> datetime.date:
    """B3 não pregoa fim de semana — volta pra sexta se cair em sáb/dom."""
    while data.weekday() >= 5:  # 5=sábado, 6=domingo
        data -= datetime.timedelta(days=1)
    return data


def baixar_arquivo(data: datetime.date, client: httpx.Client) -> bytes | None:
    """
    Baixa o COTAHIST do dia informado.
    Retorna None (não é erro) se o arquivo ainda não foi publicado (404) —
    esperado durante o experimento de horários desta semana. Faz até 2
    tentativas apenas para falhas transitórias de rede/servidor.
    """
    url = f"{BASE_URL}/{nome_arquivo(data)}"
    headers = {"User-Agent": "plataforma-mcp-brasil/1.0 (etl staging)"}

    for tentativa in range(1, 3):
        try:
            resp = client.get(url, timeout=60, headers=headers)
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            print(f"  [aviso] tentativa {tentativa}/2 — falha de conexão em {url}: {e}")
            continue

        if resp.status_code == 404:
            print(f"  [info] ainda não publicado: {url}")
            return None
        if resp.status_code in (500, 502, 503, 504):
            print(f"  [aviso] tentativa {tentativa}/2 — HTTP {resp.status_code} em {url}")
            continue

        resp.raise_for_status()
        return resp.content

    return None


def extrair_linhas(zip_bytes: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        nomes = [n for n in zf.namelist() if n.upper().endswith(".TXT")]
        if not nomes:
            raise ValueError("ZIP do COTAHIST sem arquivo .TXT — layout inesperado")
        with zf.open(nomes[0]) as f:
            raw = f.read()
    # B3 gera o arquivo em "Windows (ANSI)" — latin-1, não utf-8 (ver tutorial oficial)
    return raw.decode("latin-1").splitlines()


# ── Parsing (layout fixo, registro tipo 01 — ver SeriesHistoricas_Layout.pdf) ──

def _num(campo: str) -> int | None:
    campo = campo.strip()
    if not campo or not campo.lstrip("-").isdigit():
        return None
    return int(campo)


def classificar(ticker: str, especi: str, codbdi: str) -> str:
    especi = especi.strip()
    codbdi = codbdi.strip()
    if especi == "BDR":
        return "BDR"
    if codbdi == CODBDI_FII:
        return "FII"
    if codbdi == CODBDI_LOTE_PADRAO:
        if especi.startswith("ON"):
            return "ON"
        if especi.startswith("PN"):
            return "PN"
    if especi.startswith("CI"):
        return "ETF" if ticker in ETFS_CONHECIDOS else "FUNDO_LISTADO"
    return "OUTROS"


def parse_linha(linha: str) -> dict | None:
    """Extrai um registro tipo '01' (cotação diária) do COTAHIST, ou None se
    a linha não for desse tipo ou não for do mercado à vista em lote padrão."""
    if len(linha) < 245 or linha[0:2] != "01":
        return None

    tpmerc = linha[24:27]
    codbdi = linha[10:12].strip()
    if tpmerc != TPMERC_VISTA or codbdi == CODBDI_FRACIONARIO:
        return None

    ticker = linha[12:24].strip()
    if not ticker:
        return None

    # FATCOT: '1' = cotação por ação, '1000' = cotação por lote de 1000 ações.
    # Sem essa correção, papéis cotados por lote ficariam 1000x mais caros.
    fatcot = _num(linha[210:217]) or 1

    def preco(inicio: int, fim: int) -> float | None:
        bruto = linha[inicio:fim].strip()
        if not bruto or not bruto.isdigit():
            return None
        return (int(bruto) / 100.0) / fatcot

    fechamento = preco(108, 121)  # PREULT
    if fechamento is None:
        return None

    data_str = linha[2:10]
    volume = linha[170:188].strip()

    return {
        "ticker": ticker,
        "nome": linha[27:39].strip(),
        "especi_raw": linha[39:49].strip(),
        "codbdi": codbdi,
        "tipo": classificar(ticker, linha[39:49], codbdi),
        "data": datetime.datetime.strptime(data_str, "%Y%m%d").date().isoformat(),
        "abertura": preco(56, 69),
        "maxima": preco(69, 82),
        "minima": preco(82, 95),
        "fechamento": fechamento,
        "volume": (int(volume) / 100.0) if volume.isdigit() else None,
        "negocios": _num(linha[147:152]),
    }


# ── Smoke test ──────────────────────────────────────────────────────────────

def rodar_smoke_test(por_ticker: dict, run_id: int | None) -> bool:
    linhas = []
    tudo_ok = True
    for ticker, esperado in SMOKE_TEST_ESPERADO.items():
        obtido = por_ticker.get(ticker, {}).get("tipo")
        passou = obtido == esperado
        tudo_ok = tudo_ok and passou
        linhas.append({
            "run_id": run_id,
            "ticker": ticker,
            "tipo_esperado": esperado,
            "tipo_obtido": obtido,
            "passou": passou,
        })
        flag = "✓" if passou else "✗"
        print(f"    {flag} smoke test {ticker}: esperado={esperado} obtido={obtido}")

    if linhas:
        supabase.table("cotahist_smoke_test").insert(linhas).execute()

    return tudo_ok


# ── Supabase (staging) ────────────────────────────────────────────────────────

def upsert_staging(registros: list[dict]) -> tuple[int, int]:
    ativos_por_ticker = {}
    historico = []
    for r in registros:
        ativos_por_ticker[r["ticker"]] = {
            "ticker": r["ticker"],
            "nome": r["nome"],
            "tipo": r["tipo"],
            "especi_raw": r["especi_raw"],
            "codbdi": r["codbdi"],
            "fonte": "cotahist",
        }
        historico.append({
            "ticker": r["ticker"],
            "data": r["data"],
            "abertura": r["abertura"],
            "maxima": r["maxima"],
            "minima": r["minima"],
            "fechamento": r["fechamento"],
            "volume": r["volume"],
            "negocios": r["negocios"],
            "fonte": "cotahist",
        })

    n_ativos = n_hist = 0
    ativos = list(ativos_por_ticker.values())
    if ativos:
        res = supabase.table("rv_ativos_staging").upsert(ativos, on_conflict="ticker").execute()
        n_ativos = len(res.data)

    for i in range(0, len(historico), 500):  # lotes — limite de payload do PostgREST
        lote = historico[i:i + 500]
        res = supabase.table("rv_historico_staging").upsert(lote, on_conflict="ticker,data").execute()
        n_hist += len(res.data)

    return n_ativos, n_hist


# ── Runner ────────────────────────────────────────────────────────────────────

def run():
    print("=== ETL COTAHIST (B3) — Fase 1: staging ===\n")

    hoje = proximo_dia_util(hoje_brt())

    with ETLRun("cotahist_staging") as run_ctx:
        with httpx.Client() as client:
            conteudo = baixar_arquivo(hoje, client)
            data_usada = hoje

            if conteudo is None:
                ontem = proximo_dia_util(hoje - datetime.timedelta(days=1))
                print(f"  [info] tentando pregão anterior: {ontem}")
                conteudo = baixar_arquivo(ontem, client)
                data_usada = ontem

            if conteudo is None:
                print("  ⚠ Nenhum arquivo disponível ainda (nem hoje, nem D-1). "
                      "Não é erro — faz parte do experimento de horários desta semana.")
                run_ctx.set_rows(0)
                return

            linhas = extrair_linhas(conteudo)
            print(f"  arquivo usado: {nome_arquivo(data_usada)} | {len(linhas)} linhas brutas")

        registros = [p for l in linhas if (p := parse_linha(l)) is not None]
        print(f"  {len(registros)} registros de mercado à vista após filtro TPMERC/CODBDI")

        por_ticker = {r["ticker"]: r for r in registros}
        smoke_ok = rodar_smoke_test(por_ticker, run_ctx.run_id)

        n_ativos, n_hist = upsert_staging(registros)
        run_ctx.set_rows(n_hist)

        print(f"\n  ✓ staging atualizado: {n_ativos} ativos, {n_hist} registros históricos")
        print("  ✓ smoke test passou" if smoke_ok else
              "  ✗ SMOKE TEST FALHOU — ver tabela cotahist_smoke_test; "
              "Fase 1 não deve ser considerada validada neste run.")

    print("\n=== Concluído ===")


if __name__ == "__main__":
    run()
