-- ============================================================
-- Migration: Renda Fixa — colunas adicionais
-- Executar no Supabase SQL Editor ANTES de rodar etl/rf_tesouro.py
-- ============================================================

-- Adiciona colunas de taxa/preço de compra (perspectiva do Tesouro)
-- taxa_mercado / pu_mercado = venda (o que o investidor paga)
-- taxa_compra  / pu_compra  = compra (o que o Tesouro recompra)
ALTER TABLE rf_historico
  ADD COLUMN IF NOT EXISTS taxa_compra NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS pu_compra   NUMERIC(18, 6);

-- Indica se o título está atualmente disponível para compra
ALTER TABLE rf_titulos
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- Índice para buscas por indexador (usado no frontend para agrupar)
CREATE INDEX IF NOT EXISTS idx_rf_titulos_indexador ON rf_titulos (indexador);
CREATE INDEX IF NOT EXISTS idx_rf_historico_data    ON rf_historico (data DESC);
