-- Migration 012 — coluna `fonte` em rv_ativos/rv_historico (produção)
--
-- ADR-001 (Fase 2, Passo 5) promove rv_ativos_staging/rv_historico_staging
-- (COTAHIST) para rv_ativos/rv_historico (produção). O texto original do
-- ADR dizia que essa coluna "já estava preparada nas migrations 007/008" —
-- checado e está incorreto: 007 é ANBIMA CRI/CRA (não relacionado) e 008
-- só adiciona `fonte` nas tabelas de STAGING, não nas de produção. Esta
-- migration corrige isso.
--
-- Também alarga `ticker` para VARCHAR(12), igualando rv_ativos_staging/
-- rv_historico_staging — evita truncar tickers do universo COTAHIST que
-- passem de 10 caracteres (produção hoje só cobre a curadoria de ~30,
-- todos com ticker curto; o universo completo tem mais variedade).
ALTER TABLE rv_ativos
    ALTER COLUMN ticker TYPE VARCHAR(12),
    ADD COLUMN IF NOT EXISTS fonte VARCHAR(20) NOT NULL DEFAULT 'brapi';

ALTER TABLE rv_historico
    ALTER COLUMN ticker TYPE VARCHAR(12),
    ADD COLUMN IF NOT EXISTS fonte VARCHAR(20) NOT NULL DEFAULT 'brapi';
