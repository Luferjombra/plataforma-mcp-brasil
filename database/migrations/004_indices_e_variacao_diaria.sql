-- Migration 004 — índices em colunas filtradas + função de variação diária
--
-- 1. Índices parciais em `ativo`: as rotas /rv/ativos, /fundos e /rf/titulos
--    filtram por ativo=true em toda chamada; sem índice é full table scan.
-- 2. rv_variacao_diaria(): substitui o cálculo N+1 feito em Python no backend
--    (que baixava 600 linhas de rv_historico por request) por um único
--    SELECT com LAG() executado no banco.

-- ------------------------------------------------------------
-- 1. Índices parciais (só indexam as linhas ativas, que são as consultadas)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rv_ativos_ativo
    ON rv_ativos (ticker) WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_fundos_cadastro_ativo
    ON fundos_cadastro (cnpj) WHERE ativo = TRUE;

-- ------------------------------------------------------------
-- 2. Função: último preço e variação diária de cada ticker
--    Chamada pelo backend via supabase.rpc("rv_variacao_diaria")
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION rv_variacao_diaria()
RETURNS TABLE (
    ticker       varchar(10),
    preco_atual  numeric,
    data_preco   date,
    var_dia_pct  numeric
)
LANGUAGE sql
STABLE
AS $$
    WITH ult AS (
        SELECT
            h.ticker,
            h.fechamento,
            h.data,
            LAG(h.fechamento) OVER (PARTITION BY h.ticker ORDER BY h.data) AS fechamento_ant,
            ROW_NUMBER() OVER (PARTITION BY h.ticker ORDER BY h.data DESC) AS rn
        FROM rv_historico h
        WHERE h.data >= (SELECT MAX(data) FROM rv_historico) - INTERVAL '10 days'
    )
    SELECT
        ult.ticker,
        ult.fechamento                                   AS preco_atual,
        ult.data                                         AS data_preco,
        CASE
            WHEN ult.fechamento_ant IS NOT NULL AND ult.fechamento_ant > 0
            THEN ROUND((ult.fechamento - ult.fechamento_ant) / ult.fechamento_ant * 100, 2)
            ELSE NULL
        END                                              AS var_dia_pct
    FROM ult
    WHERE ult.rn = 1;
$$;
