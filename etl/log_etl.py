"""
Utilitário de logging e resiliência para ETL runs.

Funcionalidades:
  - ETLRun: context manager que registra início/fim/status em etl_runs
  - retry_request: faz GET com retry exponencial automático
  - log_partial: registra run parcialmente bem-sucedido

Uso básico:
    from log_etl import ETLRun, retry_request

    with ETLRun("rv_PETR4") as run:
        resp = retry_request(client, "https://brapi.dev/api/quote/PETR4")
        data = resp.json()
        run.set_rows(len(data))
"""

import time
import httpx
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from config import supabase

TZ_BRT = ZoneInfo("America/Sao_Paulo")


def hoje_brt() -> date:
    """Data de hoje em horário de Brasília (America/Sao_Paulo).

    Os runners do GitHub Actions rodam em UTC -- usar `date.today()` puro
    pega o dia errado perto da meia-noite BRT (ex: um job às 21h10 BRT já
    é 00h10 UTC do dia seguinte). Usado nos ETLs que decidem "qual pregão
    buscar" ou "quantos dias atrás" com base no dia corrente."""
    return datetime.now(TZ_BRT).date()


# ── Retry ─────────────────────────────────────────────────────────────────────

class RetryExhausted(Exception):
    """Levantada quando todas as tentativas de retry falharam."""
    pass


def retry_request(
    client: httpx.Client,
    url: str,
    *,
    method: str = "GET",
    params: dict = None,
    max_attempts: int = 3,
    backoff_base: float = 2.0,
    timeout: float = 30.0,
    retryable_status: tuple = (429, 500, 502, 503, 504),
    **kwargs,
) -> httpx.Response:
    """
    Executa uma requisição HTTP com retry exponencial.

    - Tenta até max_attempts vezes
    - Backoff: 2s, 4s, 8s, ... (dobrando a cada tentativa)
    - Retenta em: timeout, erros de conexão, status em retryable_status
    - Levanta RetryExhausted se todas as tentativas falharem

    Args:
        client:          httpx.Client já configurado
        url:             URL completa da requisição
        method:          Verbo HTTP (GET, POST, ...)
        params:          Query params
        max_attempts:    Número máximo de tentativas (default: 3)
        backoff_base:    Segundos de espera na 1ª retentativa (dobra a cada vez)
        timeout:         Timeout por requisição em segundos
        retryable_status: Códigos HTTP que disparam retry
    """
    last_exc = None

    for attempt in range(1, max_attempts + 1):
        try:
            resp = client.request(method, url, params=params, timeout=timeout, **kwargs)

            if resp.status_code not in retryable_status:
                resp.raise_for_status()
                return resp

            # Código retryable — espera e tenta novamente
            wait = backoff_base ** (attempt - 1)
            print(f"    ⚠ HTTP {resp.status_code} em {url} — tentativa {attempt}/{max_attempts}, aguardando {wait:.0f}s...")
            time.sleep(wait)
            last_exc = httpx.HTTPStatusError(
                f"HTTP {resp.status_code}", request=resp.request, response=resp
            )

        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
            wait = backoff_base ** (attempt - 1)
            print(f"    ⚠ {type(e).__name__} em {url} — tentativa {attempt}/{max_attempts}, aguardando {wait:.0f}s...")
            time.sleep(wait)
            last_exc = e

    raise RetryExhausted(f"Falhou após {max_attempts} tentativas: {last_exc}") from last_exc


# ── ETL Run context manager ───────────────────────────────────────────────────

class ETLRun:
    """
    Context manager que registra o ciclo de vida de um job ETL na tabela etl_runs.

    Uso:
        with ETLRun("rv_PETR4") as run:
            rows = processar(...)
            run.set_rows(rows)
        # status='success' se não houve exceção, 'error' se houve
    """

    def __init__(self, job: str):
        self.job = job
        self.run_id: int | None = None
        self.rows = 0
        self._forced_status: str | None = None
        self._forced_error: str | None = None

    def __enter__(self):
        try:
            result = (
                supabase.table("etl_runs")
                .insert({"job": self.job, "status": "running"})
                .execute()
            )
            if result.data:
                self.run_id = result.data[0]["id"]
        except Exception as e:
            # Não deixa falha de logging derrubar o ETL
            print(f"    [log_etl] Aviso: não foi possível registrar início do job '{self.job}': {e}")
        return self

    def set_rows(self, n: int):
        self.rows = n

    def set_status(self, status: str, error_msg: str | None = None):
        """Força o status final do run (ex: 'partial' ou 'error') sem levantar
        exceção — útil quando um loop trata seus próprios erros mas ainda
        precisa que a falha (parcial ou total) apareça em etl_runs, em vez de
        ser registrada como 'success'. Uma exceção que escape ainda tem
        precedência e marca 'error'."""
        self._forced_status = status
        self._forced_error = error_msg

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            status = "error"
            error_msg = str(exc_val)[:500]
        elif self._forced_status:
            status = self._forced_status
            error_msg = (self._forced_error or None) and self._forced_error[:500]
        else:
            status = "success"
            error_msg = None

        if self.run_id:
            try:
                supabase.table("etl_runs").update({
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "status": status,
                    "rows_upserted": self.rows,
                    "error_msg": error_msg,
                }).eq("id", self.run_id).execute()
            except Exception as e:
                print(f"    [log_etl] Aviso: não foi possível finalizar log do job '{self.job}': {e}")

        return False  # não suprime a exceção


def log_partial(job: str, rows: int, error_msg: str):
    """Registra run parcialmente bem-sucedido (alguns itens falharam)."""
    try:
        supabase.table("etl_runs").insert({
            "job": job,
            "status": "partial",
            "rows_upserted": rows,
            "error_msg": (error_msg or "")[:500],
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass
