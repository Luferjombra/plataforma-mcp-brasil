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
        check("Tesouro Selic taxa em range (8–18%)",
              8.0 <= taxa_selic <= 18.0, f"taxa={taxa_selic}")

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
elif pct >= 80:
    print("\n🟡 Maioria passou. Revisar falhas acima.")
else:
    print("\n🔴 Muitas falhas. Verificar backend.")
