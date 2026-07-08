-- Migration 013 — ORDER BY determinístico em rv_variacao_diaria()
--
-- Contexto: backend/routes/rv.py passou a paginar a chamada de
-- rv_variacao_diaria() com LIMIT/OFFSET (necessário desde que rv_ativos
-- cobre o universo completo do COTAHIST, 2.368 tickers — ver ADR-001,
-- Passo 5). Sem ORDER BY, a ordem de um SELECT com LIMIT/OFFSET não é
-- garantida entre execuções (o planner pode escolher planos diferentes
-- por scan paralelo, autovacuum, etc.) — paginar sem ORDER BY pode pular
-- ou duplicar tickers entre uma página e outra, a mesma classe de bug que
-- a paginação existe para corrigir, só que silenciosa de outro jeito.
-- Achado em revisão de pair-programming (agent .claude/agents/pair-reviewer.md).
--
-- Aproveitando a troca, também alarga o `ticker` de RETURNS TABLE de
-- varchar(10) para varchar(12), igualando rv_historico.ticker (alargado
-- na migration 012) — sem isso, um ticker de 11-12 caracteres no universo
-- completo faria a função falhar em runtime ("value too long for type
-- character varying(10)").
CREATE OR REPLACE FUNCTION rv_variacao_diaria()
RETURNS TABLE (
    ticker       varchar(12),
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
    WHERE ult.rn = 1
    ORDER BY ult.ticker;
$$;
