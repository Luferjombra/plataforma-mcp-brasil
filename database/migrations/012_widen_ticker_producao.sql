-- Migration 012 — alargar `ticker` em rv_ativos/rv_historico (produção)
--
-- ADR-001 (Fase 2, Passo 5) promove rv_ativos_staging/rv_historico_staging
-- (COTAHIST, universo completo) para rv_ativos/rv_historico (produção).
--
-- Nota de correção: uma versão anterior desta migration (e do ADR-001)
-- afirmava que a coluna `fonte` "não existia" em produção. Isso estava
-- errado — a migration 008_cotahist_staging.sql já adiciona `fonte` em
-- rv_ativos/rv_historico na sua seção 1 ("Rastreabilidade de origem nas
-- tabelas de produção existentes"). O erro veio de um grep que filtrou por
-- engano as linhas da 008 por causa do nome do arquivo conter "staging"
-- (`grep -v staging` também descarta o *nome do arquivo*, não só o
-- conteúdo). Achado durante revisão de pair-programming do Passo 5 — ver
-- docs/adr/001-cotahist-migracao-rv.md, seção "Ajuste por proventos" /
-- Passo 5 para o relato completo.
--
-- O que esta migration realmente precisa fazer: alargar `ticker` de
-- VARCHAR(10) para VARCHAR(12), igualando rv_ativos_staging/
-- rv_historico_staging — evita truncar tickers do universo COTAHIST que
-- passem de 10 caracteres (produção hoje só cobre a curadoria de ~30,
-- todos com ticker curto; o universo completo tem mais variedade).
ALTER TABLE rv_ativos
    ALTER COLUMN ticker TYPE VARCHAR(12);

ALTER TABLE rv_historico
    ALTER COLUMN ticker TYPE VARCHAR(12);
