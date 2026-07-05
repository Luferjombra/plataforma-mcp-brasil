-- ============================================================
-- Migration 009 — Remove índice redundante em rv_historico
-- Executar no Supabase: SQL Editor → colar e rodar
-- ============================================================
--
-- idx_rv_historico_ticker_data (ticker, data DESC) duplicava a cobertura
-- do UNIQUE (ticker, data) já existente na tabela — o índice do UNIQUE
-- atende igualmente consultas "últimos pregões de um ticker" via scan
-- reverso do B-tree. Dois índices sobre as mesmas colunas custam espaço
-- em disco (e escrita) em dobro sem ganho de performance real.
--
-- Relevante antes do backfill histórico do COTAHIST (que vai multiplicar
-- o volume de linhas em rv_historico/rv_historico_staging).

DROP INDEX IF EXISTS idx_rv_historico_ticker_data;
