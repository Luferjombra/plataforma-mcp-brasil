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

import math
import time
import httpx
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from config import supabase

TZ_BRT = ZoneInfo("America/Sao_Paulo")

# User-Agent que identifica o projeto para APIs públicas (BCB, brapi.dev) --
# NÃO usar para fontes que bloqueiam clientes não-navegador (RSS, Tesouro
# Transparente); essas têm um UA de navegador próprio, propositalmente
# diferente deste.
DEFAULT_USER_AGENT = "plataforma-mcp-brasil/1.0 (github.com/lufer-jom)"


def hoje_brt() -> date:
    """Data de hoje em horário de Brasília (America/Sao_Paulo).

    Os runners do GitHub Actions rodam em UTC -- usar `date.today()` puro
    pega o dia errado perto da meia-noite BRT (ex: um job às 21h10 BRT já
    é 00h10 UTC do dia seguinte). Usado nos ETLs que decidem "qual pregão
    buscar" ou "quantos dias atrás" com base no dia corrente."""
    return datetime.now(TZ_BRT).date()


def safe_float(
    value,
    *,
    replace_comma: bool = False,
    zero_as_none: bool = False,
    round_digits: int | None = None,
) -> float | None:
    """Converte `value` para float, tratando NaN/Inf/erro como None.

    Parametrizado porque as 3 versões que existiam em `rf_tesouro.py`,
    `rv_historico.py` e `fundos.py` tinham semânticas ligeiramente
    diferentes (arredondamento, 0 tratado como inválido, vírgula decimal)
    -- os flags replicam exatamente o comportamento de cada uma."""
    try:
        if replace_comma:
            value = str(value).replace(",", ".")
        v = float(value)
        if math.isnan(v) or math.isinf(v):
            return None
        if zero_as_none and v == 0:
            return None
        return round(v, round_digits) if round_digits is not None else v
    except (TypeError, ValueError):
        return None


def ultima_data(tabela: str, coluna_filtro: str, valor_filtro: str) -> str | None:
    """Retorna a data (ISO, string) mais recente de `tabela` filtrando
    `coluna_filtro=valor_filtro`, ou None se não houver registro ou a
    consulta falhar. Base compartilhada por `indicadores.py` e
    `rv_historico.py`, que tinham a mesma consulta duplicada com
    tabela/coluna diferentes e cada um decide seu próprio fallback/formato
    de retorno em cima do valor ISO."""
    try:
        result = (
            supabase.table(tabela)
            .select("data")
            .eq(coluna_filtro, valor_filtro)
            .order("data", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["data"]
    except Exception as e:
        print(f"  [aviso] última data em {tabela} ({coluna_filtro}={valor_filtro}): {e}")
    return None


def baixar_arquivo_b3(
    url: str,
    client: httpx.Client,
    *,
    user_agent: str,
    max_attempts: int = 2,
    timeout: float = 60.0,
    msg_404: str | None = None,
    msg_falha: str | None = None,
) -> bytes | None:
    """Baixa um arquivo público da B3 (COTAHIST diário ou anual), tratando
    404 como "ainda não publicado" -- não é erro, ao contrário de
    `retry_request()` (que trataria 404 como falha definitiva via
    `raise_for_status()`). Repete em falha de rede/5xx; desiste depois de
    `max_attempts`. Base compartilhada por `cotahist.py` e
    `cotahist_backfill.py`, que tinham o mesmo loop de retry duplicado
    diferindo só em tentativas/timeout/mensagens."""
    headers = {"User-Agent": user_agent}
    for tentativa in range(1, max_attempts + 1):
        try:
            resp = client.get(url, timeout=timeout, headers=headers)
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            print(f"  [aviso] tentativa {tentativa}/{max_attempts} — falha de conexão em {url}: {e}")
            continue

        if resp.status_code == 404:
            print(msg_404 if msg_404 is not None else f"  [info] ainda não publicado: {url}")
            return None
        if resp.status_code in (500, 502, 503, 504):
            print(f"  [aviso] tentativa {tentativa}/{max_attempts} — HTTP {resp.status_code} em {url}")
            continue

        resp.raise_for_status()
        return resp.content

    if msg_falha:
        print(msg_falha)
    return None


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
