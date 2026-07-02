-- ============================================================
-- Migration 006 — Dados ANBIMA
-- Índices IMA/IDA, Debêntures, VNA de Títulos Públicos
-- Executar no Supabase: SQL Editor → colar e rodar
-- ============================================================

-- ------------------------------------------------------------
-- 1. Índices ANBIMA (IMA-B, IDA-DI, IRF-M, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_indices (
    id              BIGSERIAL PRIMARY KEY,
    indice          VARCHAR(20)    NOT NULL,  -- 'IMA-B', 'IMA-B5+', 'IDA-DI', 'IDA-IPCA', etc.
    data            DATE           NOT NULL,
    numero_indice   NUMERIC(18, 6),           -- valor do índice (ex: 4582.31)
    retorno_dia     NUMERIC(10, 6),           -- variação % do dia
    retorno_mes     NUMERIC(10, 6),           -- variação % no mês
    retorno_ano     NUMERIC(10, 6),           -- variação % no ano
    duration        NUMERIC(10, 4),           -- duration modificada (anos)
    convexidade     NUMERIC(10, 4),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (indice, data)
);

CREATE INDEX IF NOT EXISTS idx_anbima_indices_serie_data
    ON anbima_indices (indice, data DESC);

-- ------------------------------------------------------------
-- 2. Carteira teórica dos índices (composição)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_indices_carteira (
    id              BIGSERIAL PRIMARY KEY,
    indice          VARCHAR(20)    NOT NULL,
    data_referencia DATE           NOT NULL,
    codigo_titulo   VARCHAR(30)    NOT NULL,  -- ex: 'NTN-B 2045'
    peso_pct        NUMERIC(10, 6),           -- participação % no índice
    pu              NUMERIC(18, 6),
    quantidade      NUMERIC(20, 2),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (indice, data_referencia, codigo_titulo)
);

CREATE INDEX IF NOT EXISTS idx_anbima_carteira_indice_data
    ON anbima_indices_carteira (indice, data_referencia DESC);

-- ------------------------------------------------------------
-- 3. Debêntures — Cadastro
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_debentures_cadastro (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(12)    NOT NULL UNIQUE,  -- ex: VALE13, CSAN15
    nome_emissor    VARCHAR(200),
    cnpj_emissor    VARCHAR(18),
    indexador       VARCHAR(20),   -- 'CDI', 'IPCA', 'PRE', 'IGPM'
    taxa_emissao    NUMERIC(10, 6),
    data_emissao    DATE,
    data_vencimento DATE,
    percentual_index NUMERIC(10, 4), -- % do indexador (ex: 105.5 = 105,5% do CDI)
    rating_agencia  VARCHAR(20),
    rating_nota     VARCHAR(10),
    setor           VARCHAR(50),
    ativo           BOOLEAN        DEFAULT TRUE,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deb_indexador
    ON anbima_debentures_cadastro (indexador);
CREATE INDEX IF NOT EXISTS idx_deb_vencimento
    ON anbima_debentures_cadastro (data_vencimento);

-- ------------------------------------------------------------
-- 4. Debêntures — Histórico de preços e taxas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_debentures_historico (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(12)    NOT NULL
                        REFERENCES anbima_debentures_cadastro(codigo),
    data            DATE           NOT NULL,
    pu_par          NUMERIC(18, 6),           -- preço unitário par (R$)
    pu_mercado      NUMERIC(18, 6),           -- preço unitário de mercado (R$)
    taxa_indicativa NUMERIC(10, 6),           -- taxa ANBIMA (% a.a.)
    spread_ipca     NUMERIC(10, 6),           -- spread sobre IPCA (bps)
    spread_cdi      NUMERIC(10, 6),           -- spread sobre CDI (bps)
    duration        NUMERIC(10, 4),           -- duration modificada (anos)
    percentual_pu   NUMERIC(10, 4),           -- PU/PU_PAR %
    volume_negociado NUMERIC(20, 2),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (codigo, data)
);

CREATE INDEX IF NOT EXISTS idx_deb_hist_codigo_data
    ON anbima_debentures_historico (codigo, data DESC);

-- ------------------------------------------------------------
-- 5. VNA — Valor Nominal de Atualização (NTN-B, LFT, NTN-C)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anbima_titulos_vna (
    id          BIGSERIAL PRIMARY KEY,
    codigo      VARCHAR(10)    NOT NULL,  -- 'NTN-B', 'LFT', 'NTN-C'
    data        DATE           NOT NULL,
    vna         NUMERIC(18, 6) NOT NULL,
    created_at  TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (codigo, data)
);

CREATE INDEX IF NOT EXISTS idx_vna_codigo_data
    ON anbima_titulos_vna (codigo, data DESC);

-- ------------------------------------------------------------
-- Trigger updated_at para debêntures cadastro
-- ------------------------------------------------------------
CREATE TRIGGER trg_deb_cadastro_updated_at
    BEFORE UPDATE ON anbima_debentures_cadastro
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
