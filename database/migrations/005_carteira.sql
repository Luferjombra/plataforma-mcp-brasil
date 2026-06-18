-- Migration 005 — Módulo Carteira
-- carteira_posicoes: posições abertas por sessão de usuário
-- carteira_snapshots: histórico de valor total (usado para métricas de risco)

CREATE TABLE IF NOT EXISTS carteira_posicoes (
    id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   TEXT           NOT NULL,
    ticker       VARCHAR(10)    NOT NULL,
    tipo         VARCHAR(10)    NOT NULL CHECK (tipo IN ('acao', 'fii', 'etf')),
    quantidade   NUMERIC(15, 4) NOT NULL CHECK (quantidade > 0),
    preco_medio  NUMERIC(12, 4) NOT NULL CHECK (preco_medio > 0),
    data_entrada DATE           NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carteira_posicoes_session ON carteira_posicoes (session_id);
CREATE INDEX IF NOT EXISTS idx_carteira_posicoes_ticker  ON carteira_posicoes (ticker);

CREATE TABLE IF NOT EXISTS carteira_snapshots (
    id                BIGSERIAL      PRIMARY KEY,
    session_id        TEXT           NOT NULL,
    data              DATE           NOT NULL,
    valor_total       NUMERIC(20, 4) NOT NULL,
    rentabilidade_pct NUMERIC(10, 6),
    vs_cdi            NUMERIC(10, 6),
    vs_ibov           NUMERIC(10, 6),
    created_at        TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (session_id, data)
);

CREATE INDEX IF NOT EXISTS idx_carteira_snapshots_session_data
    ON carteira_snapshots (session_id, data DESC);
