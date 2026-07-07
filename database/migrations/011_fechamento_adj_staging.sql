-- Migration 011 — fechamento_adj em rv_historico_staging
--
-- rv_historico (produção) já tem fechamento_adj (ver database/schema.sql).
-- rv_historico_staging (COTAHIST, migration 008) não tinha, porque o COTAHIST
-- não vem ajustado por proventos — precisa ser calculado a partir de
-- rv_eventos_societarios (migration 010). Ver docs/adr/001-cotahist-migracao-rv.md,
-- Fase 2, item 4 e etl/aplicar_ajuste_proventos.py.
ALTER TABLE rv_historico_staging
    ADD COLUMN IF NOT EXISTS fechamento_adj NUMERIC(14, 4);
