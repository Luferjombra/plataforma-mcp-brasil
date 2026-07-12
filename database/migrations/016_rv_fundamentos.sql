-- ============================================================
-- Migration 016 — Crosswalk CVM (cd_cvm) + Fundamentos DFP (rv_fundamentos)
-- Executar no Supabase: SQL Editor → colar e rodar
-- ============================================================
--
-- Duas peças, populadas por dois ETLs novos (etl/crosswalk_cvm.py e
-- etl/fundamentos_cvm.py):
--
--   rv_ativos.cd_cvm — crosswalk ticker -> código CVM da companhia,
--   resolvido via B3 (listedCompaniesProxy/GetInitialCompanies), não por
--   nome. Atributo cadastral 1:1, mesma natureza da coluna `fonte`
--   adicionada pela migration 008 -- por isso ALTER TABLE, não tabela
--   nova. Nullable: só ~408 dos 2.368 tickers (tipo ON/PN) terão valor,
--   o resto (FII/ETF/FUNDO_LISTADO/OUTROS) não arquiva DFP na CVM. Sem
--   UNIQUE: tickers como PETR3/PETR4 legitimamente compartilham o mesmo
--   cd_cvm (mesma companhia, classes de ação diferentes).
--
--   rv_fundamentos — Lucro Líquido/Patrimônio Líquido/ROE extraídos do
--   DFP (dfp_cia_aberta_DRE_con/BPP_con), um registro por ticker por ano
--   fiscal. Segue o precedente de fund_analytics_metrics (FK rígida a
--   rv_ativos, calculado_em, 2 índices) e não o de
--   rv_eventos_societarios/rv_proventos (sem FK): o ETL de fundamentos
--   lê os candidatos direto de rv_ativos (tipo IN ('ON','PN') AND cd_cvm
--   IS NOT NULL), então todo ticker gravado aqui já existe em rv_ativos
--   por construção -- ao contrário de eventos_societarios/proventos, que
--   vêm de uma lista Python desacoplada (rv_historico.py::ATIVOS).
--   P/L fica fora de escopo (calculado depois cruzando
--   rv_ativos.market_cap / rv_fundamentos.lucro_liquido, não vem da CVM).

-- ------------------------------------------------------------
-- 1. Crosswalk ticker -> CD_CVM
-- ------------------------------------------------------------
ALTER TABLE rv_ativos
    ADD COLUMN IF NOT EXISTS cd_cvm INTEGER;

CREATE INDEX IF NOT EXISTS idx_rv_ativos_cd_cvm ON rv_ativos (cd_cvm);

-- ------------------------------------------------------------
-- 2. Fundamentos CVM (DFP) — Lucro Líquido, Patrimônio Líquido, ROE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_fundamentos (
    id                 BIGSERIAL      PRIMARY KEY,
    ticker             VARCHAR(12)    NOT NULL REFERENCES rv_ativos(ticker),
    cd_cvm             INTEGER        NOT NULL,
    ano_referencia     INTEGER        NOT NULL,          -- ano fiscal (ORDEM_EXERC='ÚLTIMO'), não ano de submissão
    lucro_liquido      NUMERIC(20, 2),                   -- R$ cheio (normalizado a partir de ESCALA_MOEDA)
    patrimonio_liquido NUMERIC(20, 2),
    roe                NUMERIC(10, 4),                   -- percentual = lucro_liquido / patrimonio_liquido * 100
    versao_dfp         INTEGER,                          -- VERSAO usada no desempate (retificação), auditoria
    fonte              VARCHAR(20)    NOT NULL DEFAULT 'cvm_dfp',
    calculado_em       TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (ticker, ano_referencia)
);

CREATE INDEX IF NOT EXISTS idx_fundamentos_ticker ON rv_fundamentos (ticker, ano_referencia DESC);
CREATE INDEX IF NOT EXISTS idx_fundamentos_roe     ON rv_fundamentos (roe DESC);
