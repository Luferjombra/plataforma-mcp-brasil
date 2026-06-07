-- Migration 003 — tabela de monitoramento de runs ETL
-- Permite detectar jobs travados (status='running' há muito tempo)
-- e auditar histórico de execuções.

CREATE TABLE IF NOT EXISTS etl_runs (
    id            bigserial PRIMARY KEY,
    job           text NOT NULL,
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    status        text CHECK (status IN ('running', 'success', 'error', 'partial')),
    rows_upserted int,
    error_msg     text
);

-- Índices para queries de monitoramento
CREATE INDEX IF NOT EXISTS idx_etl_runs_job       ON etl_runs (job);
CREATE INDEX IF NOT EXISTS idx_etl_runs_started_at ON etl_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_etl_runs_status    ON etl_runs (status);

-- View de saúde: último run de cada job
CREATE OR REPLACE VIEW etl_health AS
SELECT DISTINCT ON (job)
    job,
    started_at,
    finished_at,
    status,
    rows_upserted,
    error_msg,
    EXTRACT(EPOCH FROM (finished_at - started_at))::int AS duration_seconds
FROM etl_runs
ORDER BY job, started_at DESC;
