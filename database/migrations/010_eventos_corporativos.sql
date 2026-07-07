-- ============================================================
-- Migration 010 — Eventos Corporativos (brapi dividendsData)
-- Executar no Supabase: SQL Editor → colar e rodar
-- ============================================================
--
-- Duas tabelas, mesma fonte (brapi.dev, dividendsData) mas propósitos
-- diferentes:
--
--   rv_eventos_societarios — bonificação/desdobramento/grupamento.
--   Resolve o bloqueador confirmado na validação cruzada COTAHIST vs
--   brapi (ver docs/adr/001-cotahist-migracao-rv.md): ITUB4 e MGLU3
--   divergiam ~3% e ~5% de forma sistemática por causa de bonificações
--   com ex-direito em dez/2025 que o brapi retroajusta no preço e o
--   COTAHIST não. Fator de ajuste: preco_ajustado = preco_bruto / fator
--   para datas anteriores a data_com.
--
--   rv_proventos — dividendo/JCP (dinheiro). Não afeta preço, mas é a
--   base para uma futura funcionalidade de calendário/yield de
--   proventos no frontend.

-- ------------------------------------------------------------
-- 1. Eventos societários (bonificação, desdobramento, grupamento)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_eventos_societarios (
    id              BIGSERIAL PRIMARY KEY,
    ticker          VARCHAR(12)    NOT NULL,
    tipo            VARCHAR(30)    NOT NULL
                        CHECK (tipo IN ('BONIFICACAO', 'DESDOBRAMENTO', 'GRUPAMENTO', 'OUTROS')),
    fator           NUMERIC(10, 6) NOT NULL,          -- ex: 1.03 — brapi "factor"
    fator_descricao VARCHAR(30),                      -- ex: "1,03 para 1" — brapi "completeFactor"
    data_aprovacao  DATE,                             -- brapi "approvedOn"
    data_com        DATE,                             -- brapi "lastDatePrior" — último dia com direito
    isin_code       VARCHAR(20),
    observacoes     TEXT,                             -- brapi "remarks" + label bruto quando tipo='OUTROS'
    fonte           VARCHAR(20)    NOT NULL DEFAULT 'brapi',
    ingerido_em     TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (ticker, tipo, data_aprovacao)
);

CREATE INDEX IF NOT EXISTS idx_eventos_societarios_ticker
    ON rv_eventos_societarios (ticker, data_com DESC);

-- ------------------------------------------------------------
-- 2. Proventos (dividendo, JCP)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rv_proventos (
    id              BIGSERIAL PRIMARY KEY,
    ticker          VARCHAR(12)    NOT NULL,
    tipo            VARCHAR(20)    NOT NULL
                        CHECK (tipo IN ('DIVIDENDO', 'JCP', 'OUTROS')),
    valor_por_acao  NUMERIC(14, 6) NOT NULL,          -- brapi "rate"
    data_aprovacao  DATE,                             -- brapi "approvedOn" — pode ser nulo
    data_com        DATE,                             -- brapi "lastDatePrior"
    data_pagamento  DATE,                             -- brapi "paymentDate"
    isin_code       VARCHAR(20),
    observacoes     TEXT,
    fonte           VARCHAR(20)    NOT NULL DEFAULT 'brapi',
    ingerido_em     TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (ticker, tipo, data_pagamento, valor_por_acao)
);

CREATE INDEX IF NOT EXISTS idx_proventos_ticker
    ON rv_proventos (ticker, data_pagamento DESC);
