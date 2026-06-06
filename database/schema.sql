-- ============================================================
-- Plataforma MCP Brasil — Schema PostgreSQL (Supabase)
-- Proposta 1: Modelo normalizado e orientado a domínio
-- ============================================================

-- ------------------------------------------------------------
-- 1. INDICADORES ECONÔMICOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicadores_economicos (
    id            BIGSERIAL PRIMARY KEY,
    serie         VARCHAR(20)    NOT NULL,  -- 'ipca', 'selic', 'cdi', 'pib'
    data          DATE           NOT NULL,
    valor         NUMERIC(12, 6) NOT NULL,
    unidade       VARCHAR(20)    DEFAULT '%',
    fonte         VARCHAR(50)    DEFAULT 'BCB-SGS',
    created_at    TIMESTAMPTZ    DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (serie, data)
);

CREATE INDEX idx_indicadores_serie_data ON indicadores_economicos (serie, data DESC);

-- ------------------------------------------------------------
-- 2. RENDA VARIÁVEL — Cadastro de ativos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_ativos (
    id            BIGSERIAL PRIMARY KEY,
    ticker        VARCHAR(10)    NOT NULL UNIQUE,
    nome          VARCHAR(100)   NOT NULL,
    setor         VARCHAR(50),
    subsetor      VARCHAR(50),
    tipo          VARCHAR(20)    DEFAULT 'ON', -- ON, PN, UNIT
    market_cap    NUMERIC(20, 2),
    free_float    NUMERIC(5, 2), -- percentual
    ativo         BOOLEAN        DEFAULT TRUE,
    created_at    TIMESTAMPTZ    DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. RENDA VARIÁVEL — Histórico de pregão B3
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_historico (
    id              BIGSERIAL PRIMARY KEY,
    ticker          VARCHAR(10)    NOT NULL REFERENCES rv_ativos(ticker),
    data            DATE           NOT NULL,
    abertura        NUMERIC(12, 4),
    maxima          NUMERIC(12, 4),
    minima          NUMERIC(12, 4),
    fechamento      NUMERIC(12, 4) NOT NULL,
    fechamento_adj  NUMERIC(12, 4), -- ajustado por proventos
    volume          NUMERIC(20, 2),
    negocios        INTEGER,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (ticker, data)
);

CREATE INDEX idx_rv_historico_ticker_data ON rv_historico (ticker, data DESC);

-- ------------------------------------------------------------
-- 4. FUNDOS — Cadastro
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fundos_cadastro (
    id              BIGSERIAL PRIMARY KEY,
    cnpj            VARCHAR(18)    NOT NULL UNIQUE,
    nome            VARCHAR(200)   NOT NULL,
    nome_abreviado  VARCHAR(100),
    classe_anbima   VARCHAR(50),   -- Multimercado, Renda Fixa, Ações, FII
    estrategia      VARCHAR(50),   -- Macro, DI/SELIC, Long Only, etc.
    gestor          VARCHAR(100),
    administrador   VARCHAR(100),
    tipo_fundo      VARCHAR(30),   -- FIC, FIM, FIA, FII
    data_inicio     DATE,
    ativo           BOOLEAN        DEFAULT TRUE,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX idx_fundos_classe ON fundos_cadastro (classe_anbima);
CREATE INDEX idx_fundos_gestor ON fundos_cadastro (gestor);

-- ------------------------------------------------------------
-- 5. FUNDOS — Histórico diário (cota + PL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fundos_historico (
    id              BIGSERIAL PRIMARY KEY,
    cnpj            VARCHAR(18)    NOT NULL REFERENCES fundos_cadastro(cnpj),
    data            DATE           NOT NULL,
    valor_cota      NUMERIC(18, 8) NOT NULL,
    patrimonio_liq  NUMERIC(20, 2),
    captacao        NUMERIC(20, 2),
    resgates        NUMERIC(20, 2),
    cotistas        INTEGER,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (cnpj, data)
);

CREATE INDEX idx_fundos_historico_cnpj_data ON fundos_historico (cnpj, data DESC);

-- ------------------------------------------------------------
-- 6. FUNDOS — Camada analítica (métricas pré-calculadas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fund_analytics_metrics (
    id                BIGSERIAL PRIMARY KEY,
    cnpj              VARCHAR(18)    NOT NULL REFERENCES fundos_cadastro(cnpj),
    data_referencia   DATE           NOT NULL,
    retorno_1m        NUMERIC(10, 6), -- percentual
    retorno_3m        NUMERIC(10, 6),
    retorno_6m        NUMERIC(10, 6),
    retorno_12m       NUMERIC(10, 6),
    retorno_ytd       NUMERIC(10, 6),
    volatilidade_12m  NUMERIC(10, 6), -- anualizada
    sharpe_12m        NUMERIC(10, 6),
    max_drawdown      NUMERIC(10, 6), -- valor negativo
    pct_cdi_12m       NUMERIC(10, 4), -- ex: 178.4 = 178,4% do CDI
    calculado_em      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (cnpj, data_referencia)
);

CREATE INDEX idx_analytics_cnpj_data ON fund_analytics_metrics (cnpj, data_referencia DESC);
CREATE INDEX idx_analytics_sharpe ON fund_analytics_metrics (sharpe_12m DESC);

-- ------------------------------------------------------------
-- 7. ETF — Extensão de RV
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etf_cadastro (
    id              BIGSERIAL PRIMARY KEY,
    ticker          VARCHAR(10)    NOT NULL UNIQUE REFERENCES rv_ativos(ticker),
    indice_ref      VARCHAR(30),   -- IBOV, SMLL, IFIX, etc.
    gestor          VARCHAR(100),
    tipo_replica    VARCHAR(30),   -- Física, Sintética
    taxa_adm        NUMERIC(6, 4), -- percentual ao ano
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. BDR — Extensão de RV
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bdr_cadastro (
    id              BIGSERIAL PRIMARY KEY,
    ticker          VARCHAR(10)    NOT NULL UNIQUE REFERENCES rv_ativos(ticker),
    ticker_original VARCHAR(20),   -- ex: AAPL
    bolsa_origem    VARCHAR(20),   -- NASDAQ, NYSE, etc.
    moeda_lastro    VARCHAR(5)     DEFAULT 'USD',
    ratio           NUMERIC(10, 4) DEFAULT 1, -- quantos BDRs = 1 ação original
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 9. RENDA FIXA — Cadastro de títulos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rf_titulos (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(30)    NOT NULL UNIQUE,
    nome            VARCHAR(200)   NOT NULL,
    emissor         VARCHAR(100),
    tipo            VARCHAR(30),   -- Tesouro, CDB, LCA, LCI, Debenture
    indexador       VARCHAR(20),   -- CDI, IPCA, SELIC, PRE
    taxa_emissao    NUMERIC(10, 6),
    data_emissao    DATE,
    data_vencimento DATE,
    rating          VARCHAR(10),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 10. RENDA FIXA — Histórico de mercado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rf_historico (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(30)    NOT NULL REFERENCES rf_titulos(codigo),
    data            DATE           NOT NULL,
    pu_mercado      NUMERIC(18, 6),
    taxa_mercado    NUMERIC(10, 6),
    duration        NUMERIC(10, 4), -- em anos
    spread          NUMERIC(10, 6),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (codigo, data)
);

-- ------------------------------------------------------------
-- 11. NOTÍCIAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noticias (
    id              BIGSERIAL PRIMARY KEY,
    titulo          TEXT           NOT NULL,
    resumo          TEXT,
    url             TEXT           UNIQUE,
    fonte           VARCHAR(50),
    categoria       VARCHAR(30),   -- Macro, Renda Variável, Renda Fixa, Fundos
    tickers_rel     TEXT[],        -- array de tickers relacionados
    publicado_em    TIMESTAMPTZ,
    ingerido_em     TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX idx_noticias_categoria ON noticias (categoria);
CREATE INDEX idx_noticias_publicado ON noticias (publicado_em DESC);

-- ------------------------------------------------------------
-- 12. LOG DE INGESTÃO (auditoria ETL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etl_log (
    id              BIGSERIAL PRIMARY KEY,
    job_nome        VARCHAR(50)    NOT NULL,
    data_execucao   TIMESTAMPTZ    DEFAULT NOW(),
    status          VARCHAR(20)    DEFAULT 'success', -- success, error, partial
    registros_novos INTEGER        DEFAULT 0,
    registros_total INTEGER        DEFAULT 0,
    data_inicio_carga DATE,
    data_fim_carga  DATE,
    erro_msg        TEXT,
    duracao_seg     NUMERIC(8, 2)
);

-- ------------------------------------------------------------
-- 13. CACHE DE RESPOSTAS DO COPILOT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot_cache (
    id              BIGSERIAL PRIMARY KEY,
    hash_pergunta   VARCHAR(64)    NOT NULL UNIQUE, -- SHA256 da pergunta normalizada
    ativo           VARCHAR(50),
    intencao        VARCHAR(30),
    resposta_txt    TEXT,
    dados_json      JSONB,
    criado_em       TIMESTAMPTZ    DEFAULT NOW(),
    expira_em       TIMESTAMPTZ    DEFAULT NOW() + INTERVAL '24 hours',
    hits            INTEGER        DEFAULT 0
);

CREATE INDEX idx_cache_hash ON copilot_cache (hash_pergunta);
CREATE INDEX idx_cache_expira ON copilot_cache (expira_em);

-- ------------------------------------------------------------
-- Função utilitária: atualiza updated_at automaticamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_indicadores_updated_at
    BEFORE UPDATE ON indicadores_economicos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rv_ativos_updated_at
    BEFORE UPDATE ON rv_ativos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_fundos_cadastro_updated_at
    BEFORE UPDATE ON fundos_cadastro
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
