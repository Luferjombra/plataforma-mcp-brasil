-- Migration 006 — Staging para ingestão COTAHIST (B3)
--
-- Contexto: rv_historico.py hoje cobre ~30 tickers via brapi.dev, ticker a ticker.
-- Para cobrir todo o universo de ativos públicos da B3 (ações, FIIs, ETFs, BDRs),
-- vamos ingerir o arquivo público COTAHIST (B3), que traz TODOS os papéis do dia
-- em um único download.
--
-- Fase 1 do plano de migração: o COTAHIST escreve SÓ nestas tabelas de staging,
-- nunca em rv_ativos/rv_historico diretamente. Isso evita que um bug de parsing
-- contamine silenciosamente a produção (rv_ativos/rv_historico não tinham coluna
-- de proveniência — corrigido abaixo — e dois ETLs escrevendo na mesma PK sem
-- rastro de origem mascarariam qualquer divergência).
--
-- A promoção de staging -> produção só acontece na Fase 2 (validação cruzada),
-- fora do escopo desta migration.

-- ------------------------------------------------------------
-- 1. Rastreabilidade de origem nas tabelas de produção existentes
-- ------------------------------------------------------------
ALTER TABLE rv_ativos
    ADD COLUMN IF NOT EXISTS fonte VARCHAR(20) NOT NULL DEFAULT 'brapi';

ALTER TABLE rv_historico
    ADD COLUMN IF NOT EXISTS fonte VARCHAR(20) NOT NULL DEFAULT 'brapi';

-- ------------------------------------------------------------
-- 2. Staging — cadastro de ativos (espelho de rv_ativos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_ativos_staging (
    id            BIGSERIAL PRIMARY KEY,
    ticker        VARCHAR(12)    NOT NULL,
    nome          VARCHAR(100),
    tipo          VARCHAR(20),   -- ON, PN, FII, ETF, BDR, OUTROS, INDEFINIDO
    especi_raw    VARCHAR(10),   -- campo ESPECI bruto do COTAHIST, para auditoria/depuração
    codbdi        VARCHAR(2),    -- campo CODBDI bruto — chave real p/ FII (12) vs ação (02)
    fonte         VARCHAR(20)    NOT NULL DEFAULT 'cotahist',
    ingerido_em   TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (ticker)
);

-- ------------------------------------------------------------
-- 3. Staging — histórico diário (espelho de rv_historico)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_historico_staging (
    id              BIGSERIAL PRIMARY KEY,
    ticker          VARCHAR(12)    NOT NULL,
    data            DATE           NOT NULL,
    abertura        NUMERIC(14, 4),
    maxima          NUMERIC(14, 4),
    minima          NUMERIC(14, 4),
    fechamento      NUMERIC(14, 4) NOT NULL,
    volume          NUMERIC(20, 2),
    negocios        INTEGER,
    fonte           VARCHAR(20)    NOT NULL DEFAULT 'cotahist',
    ingerido_em     TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (ticker, data)
);

CREATE INDEX IF NOT EXISTS idx_rv_historico_staging_ticker_data
    ON rv_historico_staging (ticker, data DESC);

-- ------------------------------------------------------------
-- 4. Tabela de smoke test — resultado da validação de classificação
--    ESPECI/CODBDI contra uma amostra de papéis conhecidos, a cada run.
--    Critério de saída da Fase 1 (ver ADR): N >= 3 execuções diárias
--    consecutivas sem falha nesta tabela.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cotahist_smoke_test (
    id            BIGSERIAL PRIMARY KEY,
    run_id        BIGINT REFERENCES etl_runs(id),
    ticker        VARCHAR(12) NOT NULL,
    tipo_esperado VARCHAR(20) NOT NULL,
    tipo_obtido   VARCHAR(20),
    passou        BOOLEAN NOT NULL,
    executado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cotahist_smoke_executado
    ON cotahist_smoke_test (executado_em DESC);
