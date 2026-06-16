-- Queries de monitoramento do Supabase durante o load test.
-- Rodar no SQL Editor do Supabase a cada 30s enquanto k6 estiver ativo.

-- ── 1. Conexões ativas em tempo real ─────────────────────────────────────────
SELECT
  count(*)                                          AS total_conexoes,
  count(*) FILTER (WHERE state = 'active')          AS ativas,
  count(*) FILTER (WHERE state = 'idle')            AS ociosas,
  count(*) FILTER (WHERE wait_event_type = 'Lock')  AS em_lock,
  count(*) FILTER (WHERE wait_event_type = 'IO')    AS aguardando_io
FROM pg_stat_activity
WHERE datname = current_database();

-- ── 2. Queries mais lentas — rodar APÓS o teste ──────────────────────────────
SELECT
  round(mean_exec_time::numeric, 2)   AS media_ms,
  round(max_exec_time::numeric, 2)    AS max_ms,
  round(stddev_exec_time::numeric, 2) AS desvio_ms,
  calls,
  left(query, 100)                    AS query_resumida
FROM pg_stat_statements
WHERE calls > 5
ORDER BY mean_exec_time DESC
LIMIT 15;

-- ── 3. Tabelas maiores e I/O ──────────────────────────────────────────────────
SELECT
  relname                                               AS tabela,
  n_live_tup                                            AS linhas_vivas,
  pg_size_pretty(pg_total_relation_size(c.oid))         AS tamanho_total,
  seq_scan                                              AS scans_seq,
  idx_scan                                              AS scans_idx,
  round(100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0), 1) AS pct_uso_indice
FROM pg_stat_user_tables t
JOIN pg_class c ON c.relname = t.relname
ORDER BY pg_total_relation_size(c.oid) DESC;

-- ── 4. Locks em espera (rodar se latência disparar) ──────────────────────────
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duracao,
  query,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '3 seconds'
ORDER BY duracao DESC;
