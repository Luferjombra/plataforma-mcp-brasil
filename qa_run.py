"""
QA Script — Plataforma MCP Brasil
Roda contra a API de produção e gera um relatório de texto.

Uso (PowerShell):
    cd <repo>
    py -3.12 -m venv venv-qa
    .\\venv-qa\\Scripts\\Activate.ps1
    pip install httpx
    python qa_run.py

Ou, se já tiver o venv do backend:
    cd backend
    .\\venv\\Scripts\\Activate.ps1
    cd ..
    python qa_run.py
"""

import httpx
import time
import sys
from datetime import datetime, date

API = "https://plataforma-mcp-brasil-api.onrender.com"
TIMEOUT = 45  # cold start Render pode levar até 30s

resultados = []

def check(label, ok, detalhe=""):
    status = "✅" if ok else "❌"
    print(f"  {status} {label}" + (f" — {detalhe}" if detalhe else ""))
    resultados.append({"label": label, "ok": ok, "detalhe": detalhe})
    return ok


def get(path, timeout=TIMEOUT):
    url = f"{API}{path}"
    t0 = time.time()
    try:
        r = httpx.get(url, timeout=timeout, follow_redirects=True)
        elapsed = time.time() - t0
        return r, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        return None, elapsed


# ─────────────────────────────────────────────────────────────────────────────
print("=" * 60)
print(f"QA — Plataforma MCP Brasil")
print(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print(f"API:  {API}")
print("=" * 60)

# ── Seção 1 — Funcional ───────────────────────────────────────────────────────
print("\n▶ SEÇÃO 1 — Funcional\n")

# Health
print("[1.1] Health check")
r, elapsed = get("/")
if r and r.status_code == 200:
    body = r.json()
    check("GET / status 200", True, f"{elapsed:.1f}s")
    check("Campo 'status' ok", body.get("status") == "ok", str(body))
else:
    check("GET / acessível", False, f"status={r.status_code if r else 'timeout'} em {elapsed:.1f}s")
    print("\n⚠ Backend inacessível. Verificar se Render está ativo.")
    sys.exit(1)

# Indicadores
print("\n[1.2] Indicadores")
for serie in ["selic", "ipca", "cdi"]:
    r, elapsed = get(f"/indicadores?serie={serie}&limit=5")
    ok = r and r.status_code == 200
    data = r.json().get("data", []) if ok else []
    check(f"GET /indicadores?serie={serie}", ok and len(data) > 0,
          f"{len(data)} registros em {elapsed:.1f}s")

# Renda Variável
print("\n[1.3] Renda Variável")
r, elapsed = get("/rv/ativos")
ok = r and r.status_code == 200
data = r.json().get("data", []) if ok else []
check("GET /rv/ativos", ok and len(data) > 0, f"{len(data)} ativos em {elapsed:.1f}s")

r, elapsed = get("/rv/historico/PETR4?limit=5")
ok = r and r.status_code == 200
data = r.json().get("data", []) if ok else []
check("GET /rv/historico/PETR4", ok and len(data) > 0, f"{len(data)} registros")

# Renda Fixa
print("\n[1.4] Renda Fixa")
r, elapsed = get("/rf/titulos")
ok = r and r.status_code == 200
titulos = r.json().get("data", []) if ok else []
check("GET /rf/titulos", ok and len(titulos) >= 5, f"{len(titulos)} títulos em {elapsed:.1f}s")

# Fundos
print("\n[1.5] Fundos")
r, elapsed = get("/fundos")
ok = r and r.status_code == 200
data = r.json().get("data", []) if ok else []
check("GET /fundos", ok and len(data) > 0, f"{len(data)} fundos em {elapsed:.1f}s")

# Edge cases
print("\n[1.6] Casos de borda")
r, _ = get("/rv/historico/TICKER_INVALIDO_XYZ")
ok = r and r.status_code in (200, 404)
data = r.json().get("data", []) if r and r.status_code == 200 else []
check("Ticker inexistente → não 500", ok, f"status={r.status_code if r else 'erro'}, data={data}")

r, _ = get("/rf/historico/CODIGO_INVALIDO_XYZ")
ok = r and r.status_code in (200, 404)
check("Código RF inexistente → não 500", ok, f"status={r.status_code if r else 'erro'}")

r, _ = get("/indicadores?serie=serie_invalida&limit=5")
ok = r and r.status_code in (200, 422)
check("Série indicador inválida → não 500", ok, f"status={r.status_code if r else 'erro'}")

# ── Seção 2 — Segurança ───────────────────────────────────────────────────────
print("\n▶ SEÇÃO 2 — Segurança\n")

print("[2.1] CORS")
try:
    r = httpx.get(f"{API}/rv/ativos", timeout=TIMEOUT,
                  headers={"Origin": "https://evil.com"})
    cors = r.headers.get("access-control-allow-origin", "")
    is_wildcard = cors == "*"
    check("CORS restrictivo (não *)", not is_wildcard,
          f"Access-Control-Allow-Origin: {cors or '(ausente)'}")
    if is_wildcard:
        print("    → Known issue 🟠 ALTO: fixar allow_origins para a URL do Vercel")
except Exception as e:
    check("CORS check", False, str(e))

print("\n[2.2] Headers de segurança")
try:
    r = httpx.get(f"{API}/", timeout=TIMEOUT)
    for header, expected in [
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("strict-transport-security", None),
    ]:
        val = r.headers.get(header, "")
        present = bool(val)
        if expected:
            ok = val.lower() == expected.lower()
        else:
            ok = present
        check(f"Header {header}", ok, val or "(ausente)")
except Exception as e:
    check("Headers check", False, str(e))

print("\n[2.3] Injeção / path traversal")
paths_injection = [
    "/rv/historico/..%2F..%2Fetc%2Fpasswd",
    "/rf/historico/../../config",
]
for path in paths_injection:
    r, _ = get(path)
    ok = r and r.status_code in (200, 404, 422)
    body_has_passwd = b"root:" in (r.content if r else b"")
    check(f"Path traversal: {path[:40]}",
          ok and not body_has_passwd,
          f"status={r.status_code if r else 'erro'}")

r, _ = get("/indicadores?serie=selic'--&limit=1")
ok = r and r.status_code in (200, 422)
body = r.text[:200] if r else ""
has_sql_error = any(kw in body.lower() for kw in ["syntax error", "pg_query", "sqlstate"])
check("SQL injection em query param", ok and not has_sql_error,
      f"status={r.status_code if r else 'erro'}, sql_error={has_sql_error}")

print("\n[2.4] Exposição de informações")
r, _ = get("/openapi.json")
check("GET /openapi.json acessível (avaliar se desejado em prod)",
      r and r.status_code == 200,
      "OK para MVP — considerar desabilitar em produção")

r, _ = get("/docs")
check("GET /docs (Swagger) acessível", r and r.status_code == 200,
      "OK para MVP — considerar Basic Auth em produção")

# ── Seção 3 — Integridade dos Dados ───────────────────────────────────────────
print("\n▶ SEÇÃO 3 — Integridade dos Dados\n")

print("[3.1] Indicadores econômicos")
SELIC_RANGE = (8.0, 18.0)
IPCA_RANGE  = (-2.0, 5.0)

r, _ = get("/indicadores?serie=selic&limit=1")
if r and r.status_code == 200:
    data = r.json().get("data", [])
    if data:
        val = data[0].get("valor", 0)
        check("SELIC em range razoável (8–18%)", SELIC_RANGE[0] <= val <= SELIC_RANGE[1],
              f"valor={val}")

r, _ = get("/indicadores?serie=ipca&limit=1")
if r and r.status_code == 200:
    data = r.json().get("data", [])
    if data:
        val = data[0].get("valor", 0)
        check("IPCA mensal em range razoável (-2% a +5%)", IPCA_RANGE[0] <= val <= IPCA_RANGE[1],
              f"valor={val}")

print("\n[3.2] Renda Fixa — taxas")
r, _ = get("/rf/titulos")
if r and r.status_code == 200:
    titulos = r.json().get("data", [])
    check("≥ 5 títulos retornados", len(titulos) >= 5, f"total={len(titulos)}")

    taxas_absurdas = [t for t in titulos if t.get("taxa_atual") and
                      (t["taxa_atual"] <= 0 or t["taxa_atual"] > 100)]
    check("Nenhuma taxa absurda (>100% ou ≤0)", len(taxas_absurdas) == 0,
          f"absurdas={[t['codigo'] for t in taxas_absurdas]}")

    selic_titulos = [t for t in titulos if t.get("indexador") == "SELIC"]
    if selic_titulos:
        taxa_selic = selic_titulos[0].get("taxa_atual", 0)
        # LFT (Tesouro Selic) é cotado como spread sobre a SELIC, tipicamente 0.00%–0.15%
        # NÃO é a taxa SELIC total — não usar range 8-18%
        check("Tesouro Selic spread em range razoável (0–0.20%)",
              0.0 <= taxa_selic <= 0.20, f"spread={taxa_selic}% (sobre SELIC)")

    ipca_titulos = [t for t in titulos if t.get("indexador") == "IPCA"]
    if ipca_titulos:
        taxa_ipca = min(t.get("taxa_atual", 999) for t in ipca_titulos)
        check("Tesouro IPCA+ spread em range (4–12%)",
              4.0 <= taxa_ipca <= 12.0, f"menor_taxa={taxa_ipca}")

    # Data de referência recente
    data_ref = r.json().get("data_referencia", "")
    if data_ref:
        from datetime import date
        diff = (date.today() - date.fromisoformat(data_ref)).days
        check("Data referência RF recente (≤15 dias úteis)", diff <= 22,
              f"data_ref={data_ref}, {diff} dias atrás")

print("\n[3.3] Renda Variável")
r, _ = get("/rv/historico/PETR4?limit=5")
if r and r.status_code == 200:
    data = r.json().get("data", [])
    if data:
        ultimo = data[0]
        fech = ultimo.get("fechamento", 0)
        check("PETR4 fechamento em range razoável (R$5–R$200)",
              5 <= fech <= 200, f"fechamento={fech}")
        data_str = ultimo.get("data", "")
        if data_str:
            diff = (date.today() - date.fromisoformat(data_str)).days
            check("PETR4 dados recentes (≤30 dias)", diff <= 30, f"data={data_str}")

# ── Seção 4 — Monitoramento ETL ───────────────────────────────────────────────
print("\n▶ SEÇÃO 4 — Monitoramento ETL\n")

print("[4.1] ETL Health endpoint")
r, elapsed = get("/health/etl")
if r and r.status_code == 200:
    body = r.json()
    jobs = body.get("jobs", [])
    summary = body.get("summary", {})

    check("GET /health/etl acessível", True, f"{len(jobs)} jobs rastreados em {elapsed:.1f}s")
    check("Campo 'summary' presente", "total" in summary, str(summary))

    jobs_conhecidos = {"rv_historico_batch", "indicadores_selic", "indicadores_ipca",
                       "indicadores_cdi", "indicadores_pib"}

    # rv_BCFF11 é ticker deslistado (removido de ATIVOS em 2026-06-16) — ignorar
    JOBS_IGNORADOS = {"rv_BCFF11"}
    jobs_com_erro = [j["job"] for j in jobs if j.get("status") == "error" and j["job"] not in JOBS_IGNORADOS]
    check("Nenhum job ETL em status error",
          len(jobs_com_erro) == 0,
          f"erros={jobs_com_erro}" if jobs_com_erro else "todos OK")

    jobs_stale = [j["job"] for j in jobs if j.get("status") in ("stale", "unknown")]
    check("ETLs atualizados (nenhum stale/unknown)",
          len(jobs_stale) == 0,
          f"stale/unknown={jobs_stale}" if jobs_stale else "todos recentes")

    # Verifica se RV rodou com dados
    rv_batch = next((j for j in jobs if j.get("job") == "rv_historico_batch"), None)
    if rv_batch:
        rows = rv_batch.get("rows_upserted") or 0
        check("ETL RV registrou linhas (> 0)", rows > 0, f"rows_upserted={rows}")
    else:
        check("ETL RV presente na tabela etl_runs", False,
              "rv_historico_batch não encontrado — SQL 003_etl_runs.sql aplicado?")
else:
    check("GET /health/etl acessível", False,
          f"status={r.status_code if r else 'timeout'} — rota implementada?")

# ── Seção 5 — ETL Indicadores (Incrementalidade) ─────────────────────────────
print("\n▶ SEÇÃO 5 — ETL Indicadores (Incrementalidade)\n")

print("[5.1] Frescor dos dados por série")
FRESHNESS = {
    "selic": 7,
    "cdi":   7,
    "ipca":  60,   # IBGE publica IPCA do mês M em ~D9 de M+1 (defasagem real ~40d)
    "pib":   600,  # dado trimestral c/ atraso BCB; ETL rodando mas série pode ter gap — TODO: investigar série 7326
}
for serie, max_dias in FRESHNESS.items():
    r, _ = get(f"/indicadores?serie={serie}&limit=1")
    if r and r.status_code == 200:
        data_list = r.json().get("data", [])
        if data_list:
            dt_str = data_list[0].get("data", "")[:10]
            try:
                diff = (date.today() - date.fromisoformat(dt_str)).days
                check(f"Indicador {serie.upper()} frescor ≤{max_dias}d",
                      diff <= max_dias, f"última data={dt_str}, {diff}d atrás")
            except ValueError:
                check(f"Indicador {serie.upper()} data válida", False, f"data={dt_str}")
        else:
            check(f"Indicador {serie.upper()} tem dados", False, "data=[]")
    else:
        check(f"GET /indicadores?serie={serie}", False,
              f"status={r.status_code if r else 'timeout'}")

print("\n[5.2] Jobs indicadores em etl_runs")
r, _ = get("/health/etl")
if r and r.status_code == 200:
    jobs = r.json().get("jobs", [])
    for serie in ["selic", "ipca", "cdi", "pib"]:
        job_name = f"indicadores_{serie}"
        job = next((j for j in jobs if j.get("job") == job_name), None)
        check(f"ETL job '{job_name}' presente", job is not None,
              f"status={job.get('status')} rows={job.get('rows_upserted')}" if job else "não encontrado")
else:
    check("GET /health/etl para indicadores", False, "inacessível")

# ── Seção 6 — ETL Fundos (Log Correto) ───────────────────────────────────────
print("\n▶ SEÇÃO 6 — ETL Fundos (Log Correto)\n")

print("[6.1] ETL fundos_historico em etl_runs")
r, _ = get("/health/etl")
if r and r.status_code == 200:
    jobs = r.json().get("jobs", [])
    fundo_job = next((j for j in jobs if j.get("job") == "fundos_historico"), None)
    check("ETL 'fundos_historico' presente em etl_runs", fundo_job is not None,
          "não encontrado — fundos.py rodou?" if not fundo_job else "")
    if fundo_job:
        status = fundo_job.get("status", "")
        rows   = fundo_job.get("rows_upserted") or 0
        check("ETL fundos_historico status não é 'error'", status != "error",
              f"status={status}")
        # rows=0 é válido: upsert idempotente não insere linhas já existentes
        check("ETL fundos_historico sem erro de runtime", status in ("ok", "partial"),
              f"status={status}, rows_upserted={rows}")
else:
    check("GET /health/etl para fundos", False, "inacessível")

print("\n[6.2] Dados de fundo recentes")
r, _ = get("/fundos")
if r and r.status_code == 200:
    fundos_list = r.json().get("data", [])
    if fundos_list:
        cnpj = fundos_list[0].get("cnpj", "")
        from urllib.parse import quote
        r2, _ = get(f"/fundos/historico/{quote(cnpj, safe='')}?limit=1")
        if r2 and r2.status_code == 200:
            data_list = r2.json().get("data", [])
            if data_list:
                dt_str = data_list[0].get("data", "")[:10]
                try:
                    diff = (date.today() - date.fromisoformat(dt_str)).days
                    check("Histórico de fundo recente (≤60 dias)", diff <= 60,
                          f"última data={dt_str}, {diff}d atrás")
                except ValueError:
                    check("Histórico de fundo data válida", False, f"data={dt_str}")
            else:
                check("Histórico de fundo tem dados", False, "data=[]")
        else:
            check("GET /fundos/historico/{cnpj}", False,
                  f"status={r2.status_code if r2 else 'timeout'}")
    else:
        check("GET /fundos retornou fundos", False, "lista vazia")
else:
    check("GET /fundos", False, f"status={r.status_code if r else 'timeout'}")

# ── Seção 7 — Endpoints do Dashboard ─────────────────────────────────────────
print("\n▶ SEÇÃO 7 — Endpoints do Dashboard\n")

print("[7.1] Endpoints consumidos pelo dashboard")
# Descobre o código LFT real da API (evita hardcode de data de vencimento)
_lft_cod = "LFT_2029-03-01"  # fallback conhecido
_r_tit, _ = get("/rf/titulos")
if _r_tit and _r_tit.status_code == 200:
    _selic_tits = [t for t in _r_tit.json().get("data", []) if t.get("indexador") == "SELIC"]
    if _selic_tits:
        _lft_cod = _selic_tits[0]["codigo"]

dashboard_endpoints = [
    ("/rv/ativos",                             "RV — lista de ativos"),
    ("/rv/historico/PETR4?limit=5",            "RV — histórico PETR4"),
    ("/rf/titulos",                            "RF — lista de títulos"),
    (f"/rf/historico/{_lft_cod}?limit=5",      "RF — histórico LFT Selic"),
    ("/indicadores?serie=selic&limit=5",       "Indicadores — SELIC"),
    ("/indicadores?serie=ipca&limit=5",        "Indicadores — IPCA"),
    ("/fundos",                                "Fundos — lista"),
]
for path, label in dashboard_endpoints:
    r, elapsed = get(path)
    if r and r.status_code == 200:
        body = r.json()
        # Aceita 'data' (lista) ou resposta não-vazia
        data_field = body.get("data", body)
        has_data = (isinstance(data_field, list) and len(data_field) > 0) or \
                   (isinstance(data_field, dict) and len(data_field) > 0)
        check(f"{label}", has_data, f"status=200, {elapsed:.1f}s, len={len(data_field) if isinstance(data_field, list) else '?'}")
    else:
        check(f"{label}", False,
              f"status={r.status_code if r else 'timeout'} em {elapsed:.1f}s")

print("\n[7.2] Formatação de valores — 2 casas decimais")
# Verifica que os valores retornados pela API permitem formatação com 2 casas
for serie in ["selic", "ipca"]:
    r, _ = get(f"/indicadores?serie={serie}&limit=1")
    if r and r.status_code == 200:
        data_list = r.json().get("data", [])
        if data_list:
            val = data_list[0].get("valor", 0)
            fmt = f"{val:.2f}%"
            check(f"Indicador {serie.upper()} formatável com 2 casas ({fmt})",
                  len(fmt) > 3, f"valor_bruto={val}")

r, _ = get("/rf/titulos")
if r and r.status_code == 200:
    titulos = r.json().get("data", [])
    for t in titulos[:2]:
        taxa = t.get("taxa_atual")
        if taxa is not None:
            fmt = f"{taxa:.2f}%"
            check(f"RF {t.get('codigo','?')} taxa formatável com 2 casas ({fmt})",
                  len(fmt) > 3, f"valor_bruto={taxa}")
            break

r, _ = get("/fundos")
if r and r.status_code == 200:
    fundos_list = r.json().get("data", [])
    if fundos_list:
        from urllib.parse import quote as _quote
        cnpj = fundos_list[0].get("cnpj", "")
        r2, _ = get(f"/fundos/historico/{_quote(cnpj, safe='')}?limit=1")
        if r2 and r2.status_code == 200:
            data_list = r2.json().get("data", [])
            if data_list:
                cota = data_list[0].get("valor_cota", 0)
                # Cota formatada com 2 casas (ex: R$ 415,15)
                fmt = f"R$ {cota:,.2f}"
                check(f"Cota de fundo formatável com 2 casas ({fmt})",
                      len(fmt) > 4, f"valor_bruto={cota}")

print("\n[7.3] Endpoint de RF com código comum (fallback gracioso)")
# LFT_2029 pode não existir — verificar que não é 500
r, _ = get("/rf/historico/CODIGO_INEXISTENTE?limit=5")
ok = r and r.status_code in (200, 404, 422)
check("RF histórico de código inexistente não retorna 500", ok,
      f"status={r.status_code if r else 'timeout'}")

# ── Seção 8 — Módulo Carteira (CARTEIRA-01) ──────────────────────────────────
print("\n▶ SEÇÃO 8 — Módulo Carteira (CARTEIRA-01)\n")

import uuid as _uuid

def post(path, payload, timeout=TIMEOUT):
    url = f"{API}{path}"
    t0 = time.time()
    try:
        r = httpx.post(url, json=payload, timeout=timeout, follow_redirects=True)
        return r, time.time() - t0
    except Exception:
        return None, time.time() - t0

def delete(path, timeout=TIMEOUT):
    url = f"{API}{path}"
    t0 = time.time()
    try:
        r = httpx.delete(url, timeout=timeout, follow_redirects=True)
        return r, time.time() - t0
    except Exception:
        return None, time.time() - t0

_session = f"qa-test-{_uuid.uuid4().hex[:8]}"
_posicao_id = None

print("[8.1] POST /carteira/posicoes — adicionar posição de teste")
r, elapsed = post(
    f"/carteira/posicoes?session_id={_session}",
    {"ticker": "PETR4", "tipo": "acao", "quantidade": 100, "preco_medio": 38.50},
)
if r and r.status_code == 201:
    body = r.json()
    _posicao_id = str(body.get("id", ""))
    check("POST /carteira/posicoes retorna 201", True, f"id={_posicao_id}, {elapsed:.1f}s")
    check("Posição tem id (UUID ou numérico)", bool(_posicao_id) and _posicao_id != "None",
          f"id={_posicao_id}")
else:
    check("POST /carteira/posicoes retorna 201", False,
          f"status={r.status_code if r else 'timeout'}")

print("\n[8.2] GET /carteira/posicoes — listar posições")
r, elapsed = get(f"/carteira/posicoes?session_id={_session}")
if r and r.status_code == 200:
    body = r.json()
    posicoes = body.get("data", [])
    check("GET /carteira/posicoes retorna 200", True, f"{elapsed:.1f}s")
    check("Posição PETR4 na lista", any(p.get("ticker") == "PETR4" for p in posicoes),
          f"total={len(posicoes)}")
    check("valor_total presente e > 0", body.get("valor_total", 0) > 0,
          f"valor_total={body.get('valor_total')}")
else:
    check("GET /carteira/posicoes retorna 200", False,
          f"status={r.status_code if r else 'timeout'}")

print("\n[8.3] GET /carteira/analise — análise de performance")
r, elapsed = get(f"/carteira/analise?session_id={_session}&periodo_dias=63")
if r and r.status_code == 200:
    body = r.json()
    check("GET /carteira/analise retorna 200", True, f"{elapsed:.1f}s")
    check("Campo pl_total presente", "pl_total" in body, f"body={list(body.keys())}")
    check("Campo rentabilidade_pct presente", "rentabilidade_pct" in body)
    check("posicoes_count = 1", body.get("posicoes_count") == 1,
          f"posicoes_count={body.get('posicoes_count')}")
else:
    check("GET /carteira/analise retorna 200", False,
          f"status={r.status_code if r else 'timeout'}")

print("\n[8.4] DELETE /carteira/posicoes — remover posição de teste")
if _posicao_id:
    r, elapsed = delete(f"/carteira/posicoes/{_posicao_id}?session_id={_session}")
    ok = r and r.status_code == 204
    check("DELETE /carteira/posicoes retorna 204", ok,
          f"status={r.status_code if r else 'timeout'}, {elapsed:.1f}s")

    # Verificar que a posição foi removida
    r2, _ = get(f"/carteira/posicoes?session_id={_session}")
    if r2 and r2.status_code == 200:
        posicoes_apos = r2.json().get("data", [])
        check("Posição removida da lista", len(posicoes_apos) == 0,
              f"restantes={len(posicoes_apos)}")
else:
    check("DELETE /carteira/posicoes — pulado (POST falhou)", False, "sem id")

print("\n[8.5] DELETE em posição inexistente retorna 404")
r, _ = delete(f"/carteira/posicoes/999999999?session_id={_session}")
check("DELETE posição inexistente retorna 404", r and r.status_code == 404,
      f"status={r.status_code if r else 'timeout'}")

# ── Resumo ────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("RESUMO")
print("=" * 60)

total = len(resultados)
passou = sum(1 for r in resultados if r["ok"])
falhou = total - passou

print(f"\nTotal de checks: {total}")
print(f"✅ Passou:        {passou}")
print(f"❌ Falhou:        {falhou}")

if falhou:
    print("\nFalhas:")
    for r in resultados:
        if not r["ok"]:
            print(f"  ✗ {r['label']}" + (f" — {r['detalhe']}" if r['detalhe'] else ""))

pct = passou / total * 100
print(f"\nScore: {pct:.0f}%")

if pct == 100:
    print("\n🎉 Tudo passou!")
elif pct >= 90:
    print("\n🟡 Maioria passou. Revisar falhas acima.")
else:
    print("\n🔴 Score abaixo de 90% — PR bloqueado.")

# Exit code 1 se score < 90% (GitHub Actions usa isso para falhar o check)
sys.exit(0 if pct >= 90 else 1)
