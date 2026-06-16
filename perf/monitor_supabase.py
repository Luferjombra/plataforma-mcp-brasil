"""
monitor_supabase.py — Monitor de performance integrado para a Plataforma MCP Brasil.

Roda load test com httpx async E monitora o Supabase simultaneamente,
sem precisar abrir o SQL Editor manualmente.

Modos:
  1. Completo (com DATABASE_URL no backend/.env): monitora pg_stat_activity em tempo real
  2. Basico (sem DATABASE_URL): usa heartbeat via supabase-py para medir latencia do banco

Uso:
  cd <repo>
  # Ativar o mesmo venv do ETL
  .\\backend\\venv\\Scripts\\Activate.ps1   (Windows)
  source backend/venv/bin/activate        (Linux/Mac)

  python perf/monitor_supabase.py
  python perf/monitor_supabase.py --url http://localhost:8000 --vus 30 --duracao 120
  python perf/monitor_supabase.py --so-monitor   # apenas monitora sem gerar carga

Saida:
  perf/resultado_YYYYMMDD_HHMMSS.csv   — serie temporal de metricas
  perf/resumo_YYYYMMDD_HHMMSS.txt      — relatorio final com p50/p95/p99
"""

import asyncio
import csv
import os
import sys
import time
import argparse
import statistics
from collections import defaultdict
from datetime import datetime, timezone

import httpx

# ── Tentar carregar supabase-py e psycopg2 ────────────────────────────────────

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'etl'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

try:
    from config import supabase as _supabase_client
    SUPABASE_OK = True
except Exception as e:
    print(f"  [aviso] supabase-py nao disponivel: {e}")
    SUPABASE_OK = False
    _supabase_client = None

try:
    import psycopg2
    PSYCOPG2_OK = True
except ImportError:
    PSYCOPG2_OK = False

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")

# ── Configuracao ──────────────────────────────────────────────────────────────

API_URL = os.getenv("PERF_API_URL", "https://plataforma-mcp-brasil-api.onrender.com")

ENDPOINTS = [
    # (path, peso_relativo, label)
    ("/",                                    10, "health"),
    ("/rv/ativos",                           30, "rv_ativos"),
    ("/indicadores?serie=selic&limit=252",   25, "indicadores"),
    ("/rf/titulos",                          15, "rf_titulos"),
    ("/rv/historico/PETR4?limit=504",        15, "rv_hist_pesado"),
    ("/fundos/historico/04.222.368%2F0001-55?limit=252", 5, "fundos_hist"),
]

# Fases de ramping (duracao_segundos, target_vus)
FASES = [
    (60,  10),   # baseline
    (90,  30),   # normal
    (90,  60),   # pressao
    (90, 100),   # estresse
    (30,   0),   # recuperacao
]

# ── Estado compartilhado (thread-safe via asyncio) ───────────────────────────

class Estado:
    def __init__(self):
        self.ativo = True
        self.vus_alvo = 0
        self.amostras: list[dict] = []           # cada request
        self.snapshots: list[dict] = []          # serie temporal (a cada 10s)
        self.lock = asyncio.Lock()

    async def registrar(self, label: str, status: int, latencia_ms: float):
        async with self.lock:
            self.amostras.append({
                "ts": time.time(),
                "label": label,
                "status": status,
                "latencia_ms": latencia_ms,
                "ok": status == 200,
            })

# ── Selecao ponderada de endpoint ─────────────────────────────────────────────

def escolher_endpoint() -> tuple[str, str]:
    import random
    total = sum(p for _, p, _ in ENDPOINTS)
    r = random.uniform(0, total)
    acc = 0
    for path, peso, label in ENDPOINTS:
        acc += peso
        if r <= acc:
            return path, label
    return ENDPOINTS[0][0], ENDPOINTS[0][2]

# ── Worker (simula 1 VU) ──────────────────────────────────────────────────────

async def worker(estado: Estado, client: httpx.AsyncClient, vu_id: int):
    while estado.ativo:
        path, label = escolher_endpoint()
        url = f"{estado.base_url}{path}"
        t0 = time.perf_counter()
        try:
            r = await client.get(url, timeout=45)
            status = r.status_code
        except Exception:
            status = 0
        latencia = (time.perf_counter() - t0) * 1000
        await estado.registrar(label, status, latencia)
        await asyncio.sleep(0.5 + (vu_id % 5) * 0.1)  # jitter por VU

# ── Monitor de Supabase ───────────────────────────────────────────────────────

def _conexoes_via_psycopg2() -> dict | None:
    """Retorna metricas de pg_stat_activity via conexao direta."""
    if not DATABASE_URL or not PSYCOPG2_OK:
        return None
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=5)
        cur = conn.cursor()
        cur.execute("""
            SELECT
                count(*)                                          AS total,
                count(*) FILTER (WHERE state = 'active')          AS ativas,
                count(*) FILTER (WHERE state = 'idle')            AS ociosas,
                count(*) FILTER (WHERE wait_event_type = 'Lock')  AS em_lock,
                count(*) FILTER (WHERE wait_event_type = 'IO')    AS aguardando_io
            FROM pg_stat_activity
            WHERE datname = current_database()
        """)
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {
            "conn_total": row[0], "conn_ativas": row[1],
            "conn_ociosas": row[2], "conn_lock": row[3], "conn_io": row[4],
        }
    except Exception as e:
        return {"conn_error": str(e)[:80]}

def _heartbeat_via_supabase() -> dict:
    """Mede latencia de uma query simples como proxy de saude do banco."""
    if not SUPABASE_OK:
        return {}
    t0 = time.perf_counter()
    try:
        _supabase_client.table("etl_runs").select("id").limit(1).execute()
        latencia = (time.perf_counter() - t0) * 1000
        return {"db_heartbeat_ms": round(latencia, 1)}
    except Exception as e:
        return {"db_heartbeat_ms": -1, "db_error": str(e)[:80]}

async def monitor_banco(estado: Estado, intervalo: int = 10):
    """Captura snapshot de metricas a cada `intervalo` segundos."""
    modo = "psycopg2" if (DATABASE_URL and PSYCOPG2_OK) else "heartbeat"
    print(f"  [monitor] Banco em modo: {modo}")

    while estado.ativo:
        await asyncio.sleep(intervalo)
        ts = time.time()

        # Metricas de banco
        if modo == "psycopg2":
            db_metrics = await asyncio.to_thread(_conexoes_via_psycopg2) or {}
        else:
            db_metrics = await asyncio.to_thread(_heartbeat_via_supabase)

        # Metricas de request nos ultimos `intervalo` segundos
        async with estado.lock:
            recentes = [a for a in estado.amostras if a["ts"] >= ts - intervalo]

        if recentes:
            lats = sorted(a["latencia_ms"] for a in recentes)
            erros = sum(1 for a in recentes if not a["ok"])
            n = len(recentes)
            snap = {
                "ts": ts,
                "ts_fmt": datetime.fromtimestamp(ts).strftime("%H:%M:%S"),
                "vus_alvo": estado.vus_alvo,
                "reqs": n,
                "rps": round(n / intervalo, 1),
                "erros": erros,
                "taxa_erro_pct": round(erros / n * 100, 1) if n else 0,
                "p50_ms": round(lats[int(n * 0.50)], 1),
                "p95_ms": round(lats[int(n * 0.95)], 1),
                "p99_ms": round(lats[min(int(n * 0.99), n - 1)], 1),
                **db_metrics,
            }
        else:
            snap = {
                "ts": ts, "ts_fmt": datetime.fromtimestamp(ts).strftime("%H:%M:%S"),
                "vus_alvo": estado.vus_alvo, "reqs": 0, "rps": 0,
                "erros": 0, "taxa_erro_pct": 0,
                "p50_ms": 0, "p95_ms": 0, "p99_ms": 0,
                **db_metrics,
            }

        estado.snapshots.append(snap)

        # Log em tempo real
        conn_info = ""
        if "conn_total" in snap:
            conn_info = f" | DB: {snap['conn_ativas']} ativas / {snap['conn_total']} total"
        elif "db_heartbeat_ms" in snap:
            conn_info = f" | DB heartbeat: {snap['db_heartbeat_ms']}ms"

        erro_cor = "" if snap["taxa_erro_pct"] < 5 else " *** ERRO ALTO ***"
        print(
            f"  {snap['ts_fmt']} | {snap['vus_alvo']:>3} VUs | "
            f"{snap['rps']:>5.1f} rps | "
            f"p50={snap['p50_ms']:>6.0f}ms p95={snap['p95_ms']:>6.0f}ms | "
            f"erros={snap['taxa_erro_pct']:.1f}%"
            f"{conn_info}{erro_cor}"
        )

# ── Orquestrador de fases ─────────────────────────────────────────────────────

async def orquestrar_fases(estado: Estado, fases: list, client: httpx.AsyncClient):
    workers_ativos: list[asyncio.Task] = []
    vu_id = 0

    for duracao, target in fases:
        delta = target - len(workers_ativos)
        print(f"\n  → Fase: {target} VUs por {duracao}s (delta={delta:+d})")
        estado.vus_alvo = target

        if delta > 0:
            for _ in range(delta):
                t = asyncio.create_task(worker(estado, client, vu_id))
                workers_ativos.append(t)
                vu_id += 1
        elif delta < 0:
            para_parar = workers_ativos[: abs(delta)]
            for t in para_parar:
                t.cancel()
            workers_ativos = workers_ativos[abs(delta):]

        await asyncio.sleep(duracao)

    estado.ativo = False
    for t in workers_ativos:
        t.cancel()
    print("\n  [orquestrador] Todas as fases concluidas.")

# ── Relatorio final ───────────────────────────────────────────────────────────

def gerar_relatorio(estado: Estado, ts_inicio: str, duracao_total: float, args) -> str:
    amostras = estado.amostras
    if not amostras:
        return "Nenhuma amostra coletada."

    lats = sorted(a["latencia_ms"] for a in amostras)
    n = len(lats)
    erros = sum(1 for a in amostras if not a["ok"])

    por_label = defaultdict(list)
    for a in amostras:
        por_label[a["label"]].append(a["latencia_ms"])

    linhas = [
        "=" * 60,
        "RELATORIO DE PERFORMANCE — Plataforma MCP Brasil",
        f"Data: {ts_inicio}",
        f"API:  {args.url}",
        f"Duracao: {duracao_total:.0f}s",
        "=" * 60,
        "",
        "METRICAS GLOBAIS",
        f"  Total requests : {n}",
        f"  Throughput     : {n / duracao_total:.1f} req/s",
        f"  Erros          : {erros} ({erros/n*100:.1f}%)",
        f"  Latencia p50   : {lats[int(n*0.50)]:.0f}ms",
        f"  Latencia p95   : {lats[int(n*0.95)]:.0f}ms",
        f"  Latencia p99   : {lats[min(int(n*0.99), n-1)]:.0f}ms",
        f"  Latencia max   : {lats[-1]:.0f}ms",
        "",
        "POR ENDPOINT",
    ]

    for label, vals in sorted(por_label.items()):
        vs = sorted(vals)
        m = len(vs)
        linhas.append(
            f"  {label:<20} n={m:<5} "
            f"p50={vs[int(m*0.50)]:.0f}ms  "
            f"p95={vs[int(m*0.95)]:.0f}ms  "
            f"max={vs[-1]:.0f}ms"
        )

    # Ponto de ruptura: maior VU onde p95 ainda estava abaixo de 3000ms
    ok_vus = [s["vus_alvo"] for s in estado.snapshots if s.get("p95_ms", 9999) < 3000 and s["vus_alvo"] > 0]
    ruptura_vus = [s["vus_alvo"] for s in estado.snapshots if s.get("p95_ms", 0) >= 3000 and s["vus_alvo"] > 0]

    linhas += [
        "",
        "LIMITE IDENTIFICADO",
        f"  VUs com p95 < 3s  : ate {max(ok_vus)}" if ok_vus else "  VUs com p95 < 3s : N/A",
        f"  VUs com p95 >= 3s : a partir de {min(ruptura_vus)}" if ruptura_vus else "  p95 nunca passou de 3s — aumentar carga",
        "",
        "VEREDICTO",
    ]

    taxa_erro_global = erros / n * 100
    p95_global = lats[int(n * 0.95)]
    if p95_global < 1000 and taxa_erro_global < 1:
        linhas.append("  EXCELENTE — p95 < 1s, erros < 1%")
    elif p95_global < 3000 and taxa_erro_global < 5:
        linhas.append("  BOM — dentro dos thresholds (p95 < 3s, erros < 5%)")
    elif p95_global < 5000:
        linhas.append("  ATENCAO — p95 entre 3s e 5s. Revisar indices e conexoes Supabase.")
    else:
        linhas.append("  CRITICO — p95 > 5s. Aplicacao saturada. Reduzir carga ou otimizar.")

    linhas.append("=" * 60)
    return "\n".join(linhas)

# ── Main ──────────────────────────────────────────────────────────────────────

async def main(args):
    ts_inicio = datetime.now().strftime("%Y%m%d_%H%M%S")
    ts_label  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 60)
    print("Monitor de Performance — Plataforma MCP Brasil")
    print(f"API   : {args.url}")
    print(f"Modo  : {'apenas-monitor' if args.so_monitor else 'carga + monitor'}")
    print(f"Banco : {'psycopg2 direto' if (DATABASE_URL and PSYCOPG2_OK) else 'heartbeat REST'}")
    print("=" * 60)

    estado = Estado()
    estado.base_url = args.url

    # Fases customizadas ou padrao
    if args.vus and args.duracao:
        fases = [(args.duracao, args.vus), (30, 0)]
    else:
        fases = FASES

    t0 = time.time()

    async with httpx.AsyncClient(
        headers={"User-Agent": "perf-monitor/1.0"},
        follow_redirects=True,
    ) as client:
        tarefas = [monitor_banco(estado, intervalo=10)]
        if not args.so_monitor:
            tarefas.append(orquestrar_fases(estado, fases, client))

        try:
            await asyncio.gather(*tarefas)
        except asyncio.CancelledError:
            pass

    duracao = time.time() - t0

    # CSV
    csv_path = os.path.join(os.path.dirname(__file__), f"resultado_{ts_inicio}.csv")
    if estado.snapshots:
        campos = list(estado.snapshots[0].keys())
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=campos)
            w.writeheader()
            w.writerows(estado.snapshots)
        print(f"\n  CSV salvo: {csv_path}")

    # Relatorio texto
    relatorio = gerar_relatorio(estado, ts_label, duracao, args)
    print("\n" + relatorio)

    txt_path = os.path.join(os.path.dirname(__file__), f"resumo_{ts_inicio}.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(relatorio)
    print(f"\n  Resumo salvo: {txt_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monitor de performance integrado")
    parser.add_argument("--url",        default=API_URL,  help="URL base da API")
    parser.add_argument("--vus",        type=int,         help="VUs fixos (ignora fases padrao)")
    parser.add_argument("--duracao",    type=int,         help="Duracao em segundos (com --vus)")
    parser.add_argument("--so-monitor", action="store_true", help="Apenas monitora, sem gerar carga")
    args = parser.parse_args()

    asyncio.run(main(args))
