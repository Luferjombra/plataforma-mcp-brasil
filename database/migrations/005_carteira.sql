-- ============================================================
-- Migration 005 — Módulo Carteira
-- Épico A: rastreamento de posições + snapshots de performance
-- ============================================================

-- ------------------------------------------------------------
-- 14. CARTEIRA — Posições abertas
-- ------------------------------------------------------------
-- session_id: identificador anônimo da sessão do usuário
-- (sem autenticação real por ora — próxima sessão = nova carteira)
-- tipo: 'acao', 'fii', 'fundo', 'rf', 'etf', 'bdr'
CREATE TABLE IF NOT EXISTS carteira_posicoes (
    id              BIGSERIAL      PRIMARY KEY,
    session_id      VARCHAR(64)    NOT NULL,
    ticker          VARCHAR(30)    NOT NULL,  -- ticker ou codigo RF ou CNPJ de fundo
    nome            VARCHAR(200),
    tipo            VARCHAR(20)    NOT NULL CHECK (tipo IN ('acao','fii','fundo','rf','etf','bdr')),
    quantidade      NUMERIC(18, 6) NOT NULL CHECK (quantidade > 0),
    preco_medio     NUMERIC(18, 6) NOT NULL CHECK (preco_medio > 0),
    data_entrada    DATE           NOT NULL DEFAULT CURRENT_DATE,
    nota            TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX idx_carteira_session ON carteira_posicoes (session_id);
CREATE INDEX idx_carteira_ticker  ON carteira_posicoes (ticker);

CREATE TRIGGER trg_carteira_posicoes_updated_at
    BEFORE UPDATE ON carteira_posicoes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 15. CARTEIRA — Snapshots de performance
-- ------------------------------------------------------------
-- Um snapshot por sessão por dia — calculado pelo backend
-- via VibeTrading BacktestEngine
CREATE TABLE IF NOT EXISTS carteira_snapshots (
    id                  BIGSERIAL      PRIMARY KEY,
    session_id          VARCHAR(64)    NOT NULL,
    data                DATE           NOT NULL DEFAULT CURRENT_DATE,

    -- Valor e rentabilidade
    valor_total         NUMERIC(20, 2) NOT NULL,   -- R$ valor de mercado atual
    custo_total         NUMERIC(20, 2) NOT NULL,   -- R$ custo de aquisição
    pl_absoluto         NUMERIC(20, 2),             -- valor_total - custo_total
    pl_percentual       NUMERIC(10, 4),             -- retorno % acumulado

    -- Comparação com benchmarks
    vs_cdi              NUMERIC(10, 4),  -- retorno % vs CDI no mesmo período
    vs_ibov             NUMERIC(10, 4),  -- retorno % vs IBOV no mesmo período

    -- Métricas de risco (VibeTrading BacktestEngine)
    sharpe              NUMERIC(10, 6),
    sortino             NUMERIC(10, 6),
    calmar              NUMERIC(10, 6),
    max_drawdown        NUMERIC(10, 6),  -- valor negativo, ex: -0.1234 = -12.34%
    volatilidade        NUMERIC(10, 6),  -- anualizada
    win_rate            NUMERIC(10, 6),  -- % de dias positivos

    -- Metadados do cálculo
    n_posicoes          INTEGER,         -- quantidade de ativos na carteira
    calculado_em        TIMESTAMPTZ      DEFAULT NOW(),

    UNIQUE (session_id, data)
);

CREATE INDEX idx_carteira_snapshots_session_data ON carteira_snapshots (session_id, data DESC);

-- ------------------------------------------------------------
-- Comentários
-- ------------------------------------------------------------
COMMENT ON TABLE carteira_posicoes  IS 'Posições abertas por sessão anônima — MVP sem autenticação';
COMMENT ON TABLE carteira_snapshots IS 'Snapshots diários de performance calculados via VibeTrading BacktestEngine';

COMMENT ON COLUMN carteira_posicoes.session_id  IS 'UUID gerado no browser (localStorage) — sem login';
COMMENT ON COLUMN carteira_posicoes.ticker       IS 'Ticker B3 (PETR4), código RF (LFT_2029-03-01) ou CNPJ de fundo';
COMMENT ON COLUMN carteira_snapshots.vs_cdi      IS 'Diferença percentual: retorno carteira - retorno CDI no período';
COMMENT ON COLUMN carteira_snapshots.max_drawdown IS 'Pior queda acumulada desde o pico (valor negativo)';
