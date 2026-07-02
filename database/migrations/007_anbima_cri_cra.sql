-- ============================================================
-- Migration 007 — ANBIMA: CRI e CRA
-- Certificados de Recebíveis Imobiliários e do Agronegócio
-- Executar no Supabase: SQL Editor → colar e rodar
-- ============================================================

-- ------------------------------------------------------------
-- 1. CRI — Cadastro
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_cri_cadastro (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20)    NOT NULL UNIQUE,
    cedente         VARCHAR(200),                   -- originador dos recebíveis
    cnpj_cedente    VARCHAR(18),
    securitizadora  VARCHAR(200),
    cnpj_securitizadora VARCHAR(18),
    indexador       VARCHAR(20),                    -- CDI, IPCA, PRE, IGPM, TR
    taxa_emissao    NUMERIC(10, 6),
    data_emissao    DATE,
    data_vencimento DATE,
    percentual_index NUMERIC(10, 4),
    rating_nota     VARCHAR(10),
    serie           VARCHAR(20),
    ativo           BOOLEAN        DEFAULT TRUE,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cri_indexador   ON anbima_cri_cadastro (indexador);
CREATE INDEX IF NOT EXISTS idx_cri_vencimento  ON anbima_cri_cadastro (data_vencimento);

-- ------------------------------------------------------------
-- 2. CRI — Histórico de preços e taxas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_cri_historico (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20)    NOT NULL
                        REFERENCES anbima_cri_cadastro(codigo),
    data            DATE           NOT NULL,
    pu_par          NUMERIC(18, 6),
    pu_mercado      NUMERIC(18, 6),
    taxa_indicativa NUMERIC(10, 6),
    spread_ipca     NUMERIC(10, 6),
    spread_cdi      NUMERIC(10, 6),
    duration        NUMERIC(10, 4),
    percentual_pu   NUMERIC(10, 4),
    volume_negociado NUMERIC(20, 2),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (codigo, data)
);

CREATE INDEX IF NOT EXISTS idx_cri_hist_codigo_data
    ON anbima_cri_historico (codigo, data DESC);

-- ------------------------------------------------------------
-- 3. CRA — Cadastro
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_cra_cadastro (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20)    NOT NULL UNIQUE,
    cedente         VARCHAR(200),
    cnpj_cedente    VARCHAR(18),
    securitizadora  VARCHAR(200),
    cnpj_securitizadora VARCHAR(18),
    indexador       VARCHAR(20),
    taxa_emissao    NUMERIC(10, 6),
    data_emissao    DATE,
    data_vencimento DATE,
    percentual_index NUMERIC(10, 4),
    rating_nota     VARCHAR(10),
    serie           VARCHAR(20),
    ativo           BOOLEAN        DEFAULT TRUE,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cra_indexador   ON anbima_cra_cadastro (indexador);
CREATE INDEX IF NOT EXISTS idx_cra_vencimento  ON anbima_cra_cadastro (data_vencimento);

-- ------------------------------------------------------------
-- 4. CRA — Histórico de preços e taxas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_cra_historico (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20)    NOT NULL
                        REFERENCES anbima_cra_cadastro(codigo),
    data            DATE           NOT NULL,
    pu_par          NUMERIC(18, 6),
    pu_mercado      NUMERIC(18, 6),
    taxa_indicativa NUMERIC(10, 6),
    spread_ipca     NUMERIC(10, 6),
    spread_cdi      NUMERIC(10, 6),
    duration        NUMERIC(10, 4),
    percentual_pu   NUMERIC(10, 4),
    volume_negociado NUMERIC(20, 2),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (codigo, data)
);

CREATE INDEX IF NOT EXISTS idx_cra_hist_codigo_data
    ON anbima_cra_historico (codigo, data DESC);

-- ------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------
CREATE TRIGGER trg_cri_cadastro_updated_at
    BEFORE UPDATE ON anbima_cri_cadastro
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cra_cadastro_updated_at
    BEFORE UPDATE ON anbima_cra_cadastro
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
