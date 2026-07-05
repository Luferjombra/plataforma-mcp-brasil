# Status — Plataforma Investimento

_Atualizado em: 2026-07-04_

---

## ✅ Atividades Realizadas (mais recentes primeiro)

12. **Redesign Clarity concluído** — 7 páginas + mobile + design system dark editorial. Polish final: Lighthouse mobile > 80 em todas as páginas (home 93, indicadores 95, renda-fixa 89, rv 83, fundos 83) e `next build` sem erros TypeScript.

13. **Módulo Carteira (Épico A)** — rotas `/carteira/*` com métricas de risco via VibeTrading (Sharpe, Sortino, Calmar, Drawdown, Win Rate). Página `/carteira` no frontend. QA cenário CARTEIRA-01 passando (5/5 checks).

14. **LibreChat + MCP (Épico B)** — deploy em Render free tier + MongoDB Atlas free, com 3 agents pré-configurados (Analista Quant, Macro, RV) consumindo o `/mcp` do backend via `fastapi-mcp`.

15. **ANBIMA — Índices/Debêntures/CRI/CRA** _(2026-06-27)_ — ETL `anbima.py` (5 feeds) + rotas `backend/routes/anbima.py` + sparklines dedicadas + Dashboard Contextual V3 em `/renda-fixa`. **Bloqueio conhecido:** endpoints de dados retornam 401 mesmo com token OAuth2 válido — app precisa de autorização de produto no portal ANBIMA (contato com suporte pendente, ver `docs/erros_e_solucoes.md`).

16. **Fix OAuth2 ANBIMA** _(2026-07-02)_ — token endpoint corrigido para `Content-Type: application/x-www-form-urlencoded` (estava enviando JSON, causava 401 no próprio token). Corrigiu uma camada do problema; a autorização de produto (item 15) segue pendente.

17. **COTAHIST (B3) — Fase 1 concluída** _(2026-07-03/04)_ — ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md). Ingestão diária em staging via arquivo público da B3 (universo completo em 1 download, vs. brapi ticker a ticker). 3 dias consecutivos de smoke test passando (01–03/07). Achado: B3 não tem horário fixo de publicação — fallback D-1 é obrigatório, não just-in-case.

18. **Backfill histórico COTAHIST** _(2026-07-04)_ — `etl/cotahist_backfill.py` baixa arquivos anuais da B3. Escopo inicial de 1 ano (não 5) por risco de estourar os 500MB do Supabase free tier com o universo ampliado de tickers.

19. **Limpeza de índice duplicado** _(2026-07-04)_ — migration 009 remove `idx_rv_historico_ticker_data`, redundante com o `UNIQUE(ticker, data)` já existente — reduz overhead de armazenamento antes do volume crescer com o backfill.

20. **Documentação consolidada** _(2026-07-04)_ — README.md desduplicado e atualizado (estrutura, migrations, roadmap), `architecture.md` com seções ANBIMA/COTAHIST, ADR-001 formalizado, novas entradas em `docs/erros_e_solucoes.md`.

### Histórico anterior (até 2026-06-16)

1. **Fix no ETL de Renda Variável** (`etl/rv_historico.py`) — parâmetros `startDate`/`endDate` corrigidos; removido `range=5y` que causava erro 400 na brapi.

2. **Análise comparativa brapi vs Tesouro Transparente (Renda Fixa)** — conclusão: a fonte oficial (Tesouro Transparente) é superior: gratuita, histórico desde 2002, sem rate limit. brapi descartada para RF.

3. **MCP no FastAPI** — `fastapi-mcp` configurado em `backend/main.py`; endpoint `/mcp` ativo no Render, expõe rotas de Indicadores, RV, RF e Fundos como tools MCP.

4. **Criação da skill "Arquiteto" no Cowork** — skill especializada em decisões de arquitetura de dados.

5. **ETLs estabilizados** (padrão `ETLRun` + `log_partial` + `retry_request`):
   - Renda Variável — brapi.dev
   - Renda Fixa — Tesouro Transparente
   - Fundos — CVM (download manual em `etl/data/cvm/`)
   - Indicadores macroeconômicos — BCB SGS (com incrementalidade)

6. **Dashboard unificado** — 3 versões navegáveis (`/dashboard/v1`, `/v2`, `/v3`) cobrindo Timeline multi-série, Grid+Drawer e Multi-Panel Analítico.

7. **Padronização de formatação** — 2 casas decimais obrigatórias em toda a UI (preços, taxas, variações). Formatters centralizados em `frontend/lib/format.ts`.

8. **Performance testing** — scripts k6 (`perf/smoke_test.js`, `perf/load_test.js`) + monitor integrado Python (`perf/monitor_supabase.py`). Limite identificado: ~15–20 VUs sustentáveis no free tier Render.

9. **Skill QA** (`qa-financeiro.skill`) — auditoria funcional + segurança + integridade + cenários ETL e Dashboard.

10. **Feed RSS de Notícias** _(2026-06-16)_ — ETL `etl/noticias.py` consome InfoMoney, Money Times e Valor Investe. Página `/noticias` com filtros por categoria, badges de tickers e auto-refresh 5min.

11. **Fix arquitetural brapi free tier** _(2026-06-16)_ — `rv_historico.py` agora usa janela incremental de 90 dias (overlap 5d). Falhas caíram de 87% para 3%. Decisão de assinar brapi Pro adiada como decisão de negócio.

---

## 🔜 Próximos Passos

1. **COTAHIST — Fase 2 (promoção staging → produção)** — validação cruzada com brapi, resolver ambiguidade `ETF_OU_FUNDO`, decidir escopo do universo exposto, mecanismo de corte por `fonte`. Ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md).

2. **ANBIMA — resolver autorização de produto** — contatar suporte ANBIMA (`suporte.developers@anbima.com.br`) para habilitar o app no Feed de Preços e Índices. Token OAuth2 já funciona; falta autorização por produto.

3. **(Decisão de negócio)** — avaliar upgrade do Supabase para o plano Pro (~$25/mês, 8GB) caso o backfill do COTAHIST e a eventual expansão do universo de tickers aproximem o banco do limite de 500MB do free tier.

4. **LibreChat — pendências operacionais** — OAuth Google (configuração externa no Google Cloud Console) e QA cenário PESQUISA-01 (validar tool call MCP end-to-end).

5. **Investigar variação de volume no COTAHIST** — contagem de ativos caiu a cada dia na primeira semana (1.412 → 1.396 → 1.257); confirmar se é liquidez normal de sexta-feira ou parsing incompleto antes da Fase 2.
