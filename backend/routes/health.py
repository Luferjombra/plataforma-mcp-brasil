"""
Rota de saúde dos ETLs — lê tabela etl_runs do Supabase.

GET /health/etl
    Retorna o status mais recente de cada job ETL.
    Usado pelo dashboard de monitoramento e pelos checks de QA.

GET /health/etl/{job}
    Retorna os últimos N runs de um job específico.
"""

from fastapi import APIRouter
from datetime import datetime, timezone, timedelta
from config import supabase

router = APIRouter()


def _job_status(run: dict) -> str:
    """
    Deriva um status semântico com base nos dados do run mais recente:
    - 'ok'      → success e finished_at recente (< 25h)
    - 'stale'   → success mas antigo (> 25h), ou partial
    - 'error'   → status error
    - 'running' → ainda rodando (started_at < 2h atrás — senão considera travado)
    - 'unknown' → sem dados
    """
    if not run:
        return "unknown"

    status = run.get("status")

    if status == "running":
        started_at = run.get("started_at")
        if started_at:
            try:
                started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - started) > timedelta(hours=2):
                    return "error"  # travado
            except Exception:
                pass
        return "running"

    if status == "error":
        return "error"

    if status == "partial":
        return "stale"

    if status == "success":
        finished_at = run.get("finished_at")
        if finished_at:
            try:
                finished = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))
                hours_ago = (datetime.now(timezone.utc) - finished).total_seconds() / 3600
                return "ok" if hours_ago < 25 else "stale"
            except Exception:
                pass
        return "ok"

    return "unknown"


@router.get("")
def etl_health():
    """
    Retorna o status mais recente de cada job ETL via view etl_health.

    Response:
        {
            "jobs": [
                {
                    "job": "rv_historico_batch",
                    "status_raw": "success",
                    "status": "ok",
                    "started_at": "2026-06-06T21:03:00Z",
                    "finished_at": "2026-06-06T21:08:00Z",
                    "duration_seconds": 300,
                    "rows_upserted": 1250,
                    "error_msg": null
                },
                ...
            ],
            "summary": {
                "total": 4,
                "ok": 3,
                "stale": 0,
                "error": 1,
                "unknown": 0,
                "checked_at": "2026-06-07T00:00:00Z"
            }
        }
    """
    try:
        result = (
            supabase.table("etl_health")
            .select("*")
            .order("job")
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        return {
            "jobs": [],
            "summary": {
                "total": 0, "ok": 0, "stale": 0, "error": 0, "unknown": 0,
                "error_detail": str(e),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
        }

    jobs = []
    counts = {"ok": 0, "stale": 0, "error": 0, "unknown": 0, "running": 0}

    for row in rows:
        sem_status = _job_status(row)
        counts[sem_status] = counts.get(sem_status, 0) + 1
        jobs.append({
            "job":              row.get("job"),
            "status_raw":       row.get("status"),
            "status":           sem_status,
            "started_at":       row.get("started_at"),
            "finished_at":      row.get("finished_at"),
            "duration_seconds": row.get("duration_seconds"),
            "rows_upserted":    row.get("rows_upserted"),
            "error_msg":        row.get("error_msg"),
        })

    return {
        "jobs": jobs,
        "summary": {
            "total":      len(jobs),
            "ok":         counts["ok"],
            "stale":      counts["stale"],
            "error":      counts["error"],
            "running":    counts["running"],
            "unknown":    counts["unknown"],
            "checked_at": datetime.now(timezone.utc).isoformat(),
        },
    }


@router.get("/{job}")
def etl_job_history(job: str, limit: int = 10):
    """
    Retorna os últimos N runs de um job específico.
    Útil para ver o histórico de execuções e tendências.
    """
    try:
        result = (
            supabase.table("etl_runs")
            .select("*")
            .eq("job", job)
            .order("started_at", desc=True)
            .limit(min(limit, 50))
            .execute()
        )
        return {"job": job, "data": result.data or []}
    except Exception as e:
        return {"job": job, "data": [], "error": str(e)}
