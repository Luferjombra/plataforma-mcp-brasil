# Status — Plataforma Investimento

_Atualizado em: 2026-07-21_

---

## ✅ Atividades Realizadas (mais recentes primeiro)

33. **Landing unificada + design "papel editorial" em toda a plataforma** _(2026-07-21)_ — landing reescrita como página única com switcher de 7 módulos inline (Indicadores, Renda Variável, Tesouro Direto, Fundos, Dashboard, Notícias, Status ETL). Paleta Clarity repaletada pra cream/laranja queimado e fonte trocada de Newsreader pra Source Serif 4 — aplicado a **todo o produto** (indicadores, rv, screener, rf, renda-fixa, fundos, dashboard, noticias, status, carteira, copilot) via troca dos valores dos tokens CSS, sem alterar nenhum componente. PR #15 mergeado em `main` após pair-review (2 achados corrigidos, ver `docs/erros_e_solucoes.md`) e QA de produção (97%, 72/74 — as 2 falhas são staleness de ETL pré-existente, não relacionada ao design).

34. **Auditoria de arquitetura via graphify** _(2026-07-21)_ — instalado o skill `graphify` (grafo de conhecimento de código via tree-sitter) e mapeado o backend inteiro (162 nós, 224 arestas, 13 comunidades, zero ciclos de import). Achados: `carteira.py` e `anbima.py` com a pior coesão do backend (0.09), e `_extrair_linhas_xlsx()` (parser de XLSX de importação de carteira) como o nó mais conectado de todo o grafo.

35. **Refactor: extração de `carteira/importacao.py`** _(2026-07-21)_ — parsing de CSV/XLSX de importação de carteira (11 funções, ~250 linhas) extraído de `routes/carteira.py` (801→549 linhas) pro módulo dedicado, puro e testável isoladamente. 15 testes unitários novos (`carteira/test_importacao.py`, stdlib `unittest`) — primeira cobertura de teste automatizado desse código, motivada diretamente pelo achado do graphify.

36. **Planejamento: agente de tool use pro Copilot** _(2026-07-21)_ — decisão de substituir a classificação de intenção por regex (`copilot/context_builder.py`) por tool use nativo (o LLM decide qual consulta rodar, em vez de `_identificar_ativo()`/`_classificar_intencao()`), ainda não implementado. Avaliados repositórios externos (LangChain, Dify, ECC, Graphify) como possíveis bases — nenhum recomendado pro caso de uso; tool use nativo da API (Anthropic ou Gemini) já resolve sem framework adicional.

21. **COTAHIST — Fase 2 concluída (corte staging → produção)** _(2026-07-08)_ — ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md). Validação cruzada com brapi feita, ambiguidade `ETF_OU_FUNDO` resolvida, corte por `fonte` em produção.

22. **Fundos CVM — migração pós-Resolução CVM 175 e expansão de cobertura** _(2026-07-08/09)_ — investigada e corrigida a mudança de formato do informe diário (`inf_diario_fi_AAAAMM.zip` a partir de jul/2025, confirmado via API CKAN). `sortear_fundos.py` migrado para o novo cadastro (`registro_fundo_classe.zip`, ~33 mil candidatos, vs. 22 no `cad_fi.csv` legado). `CNPJS_ALVO` expandido de 8 para 13 fundos, cobrindo agora Cambial e Crédito Privado além de Multimercado/Ações/Renda Fixa. Incidente de produção real (FK constraint zerando o histórico de todos os 13 fundos) diagnosticado e corrigido em 3 rounds de pair-review — ver `docs/erros_e_solucoes.md`. Validado via dispatch real: 13/13 fundos com cadastro resolvido, 337 registros históricos salvos, zero erros.

23. **`fund_analytics_metrics` (ETL)** — `etl/fund_analytics.py` calcula retornos (1m/3m/6m/12m/ytd), volatilidade_12m, sharpe_12m, max_drawdown e pct_cdi_12m por fundo sobre `fundos_historico`, exposto via `GET /fundos/analytics/{cnpj}`. Camada antes descrita como "futura" na documentação, agora implementada. (Diferente do módulo Carteira/VibeTrading, que calcula Sortino/Calmar/Win Rate sobre `carteira_posicoes`.)

24. **Redesign Clarity concluído** — 7 páginas + mobile + design system dark editorial. Polish final: Lighthouse mobile > 80 em todas as páginas (home 93, indicadores 95, renda-fixa 89, rv 83, fundos 83) e `next build` sem erros TypeScript.

25. **Módulo Carteira (Épico A)** — rotas `/carteira/*` com métricas de risco via VibeTrading (Sharpe, Sortino, Calmar, Drawdown, Win Rate). Página `/carteira` no frontend. QA cenário CARTEIRA-01 passando (5/5 checks).

26. **LibreChat + MCP (Épico B)** — deploy em Render free tier + MongoDB Atlas free, com 3 agents pré-configurados (Analista Quant, Macro, RV) consumindo o `/mcp` do backend via `fastapi-mcp`.

27. **ANBIMA — Índices/Debêntures/CRI/CRA** _(2026-06-27)_ — ETL `anbima.py` (5 feeds) + rotas `backend/routes/anbima.py` + sparklines dedicadas + Dashboard Contextual V3 em `/renda-fixa`. **Bloqueio conhecido:** endpoints de dados retornam 401 mesmo com token OAuth2 válido — app precisa de autorização de produto no portal ANBIMA (contato com suporte pendente, ver `docs/erros_e_solucoes.md`).

28. **Fix OAuth2 ANBIMA** _(2026-07-02)_ — token endpoint corrigido para `Content-Type: application/x-www-form-urlencoded` (estava enviando JSON, causava 401 no próprio token). Corrigiu uma camada do problema; a autorização de produto (item 27) segue pendente.

29. **COTAHIST (B3) — Fase 1 concluída** _(2026-07-03/04)_ — ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md). Ingestão diária em staging via arquivo público da B3 (universo completo em 1 download, vs. brapi ticker a ticker). 3 dias consecutivos de smoke test passando (01–03/07). Achado: B3 não tem horário fixo de publicação — fallback D-1 é obrigatório, não just-in-case.

30. **Backfill histórico COTAHIST** _(2026-07-04)_ — `etl/cotahist_backfill.py` baixa arquivos anuais da B3. Escopo inicial de 1 ano (não 5) por risco de estourar os 500MB do Supabase free tier com o universo ampliado de tickers.

31. **Limpeza de índice duplicado** _(2026-07-04)_ — migration 009 remove `idx_rv_historico_ticker_data`, redundante com o `UNIQUE(ticker, data)` já existente — reduz overhead de armazenamento antes do volume crescer com o backfill.

32. **Documentação consolidada** _(2026-07-04)_ — README.md desduplicado e atualizado (estrutura, migrations, roadmap), `architecture.md` com seções ANBIMA/COTAHIST, ADR-001 formalizado, novas entradas em `docs/erros_e_solucoes.md`.

### Histórico anterior (até 2026-06-16)

1. **Fix no ETL de Renda Variável** (`etl/rv_historico.py`) — parâmetros `startDate`/`endDate` corrigidos; removido `range=5y` que causava erro 400 na brapi.

2. **Análise comparativa brapi vs Tesouro Transparente (Renda Fixa)** — conclusão: a fonte oficial (Tesouro Transparente) é superior: gratuita, histórico desde 2002, sem rate limit. brapi descartada para RF.

3. **MCP no FastAPI** — `fastapi-mcp` configurado em `backend/main.py`; endpoint `/mcp` ativo no Render, expõe rotas de Indicadores, RV, RF e Fundos como tools MCP.

4. **Criação da skill "Arquiteto" no Cowork** — skill especializada em decisões de arquitetura de dados.

5. **ETLs estabilizados** (padrão `ETLRun` + `log_partial` + `retry_request`):
   - Renda Variável — brapi.dev
   - Renda Fixa — Tesouro Transparente
   - Fundos — CVM (download automático em `etl/data/cvm/`, hoje via `garantir_*_local()`; era manual nas primeiras versões)
   - Indicadores macroeconômicos — BCB SGS (com incrementalidade)

6. **Dashboard unificado** — 3 versões navegáveis (`/dashboard/v1`, `/v2`, `/v3`) cobrindo Timeline multi-série, Grid+Drawer e Multi-Panel Analítico.

7. **Padronização de formatação** — 2 casas decimais obrigatórias em toda a UI (preços, taxas, variações). Formatters centralizados em `frontend/lib/format.ts`.

8. **Performance testing** — scripts k6 (`perf/smoke_test.js`, `perf/load_test.js`) + monitor integrado Python (`perf/monitor_supabase.py`). Limite identificado: ~15–20 VUs sustentáveis no free tier Render.

9. **Skill QA** (`qa-financeiro.skill`) — auditoria funcional + segurança + integridade + cenários ETL e Dashboard.

10. **Feed RSS de Notícias** _(2026-06-16)_ — ETL `etl/noticias.py` consome InfoMoney, Money Times e Valor Investe. Página `/noticias` com filtros por categoria, badges de tickers e auto-refresh 5min.

11. **Fix arquitetural brapi free tier** _(2026-06-16)_ — `rv_historico.py` agora usa janela incremental de 90 dias (overlap 5d). Falhas caíram de 87% para 3%. Decisão de assinar brapi Pro adiada como decisão de negócio.

---

## 🔜 Próximos Passos

0. **Implementar tool use no Copilot** — trocar `context_builder.py` (regex) por tool use nativo decidindo qual tabela consultar. Decisão pendente: Claude (custo ~$0,01/pergunta nova, melhor maturidade de tool-calling) ou Gemini (gratuito, precisa de loop escrito na mão).

0b. **Decidir sobre os ~42 commits que ficaram fora do merge de hoje** — a branch de trabalho tinha acumulado histórico de sessões anteriores (BDR, `eventos_economicos`, agent `copy-reviewer`, importação de carteira já mergeada acima) que divergiu de `main`; o PR #15 foi escopado só pro design pra evitar reconciliar histórico não relacionado. Esse histórico segue recuperável via reflog, não perdido.

1. **ANBIMA — resolver autorização de produto** — contatar suporte ANBIMA (`suporte.developers@anbima.com.br`) para habilitar o app no Feed de Preços e Índices. Token OAuth2 já funciona; falta autorização por produto.

2. **(Decisão de negócio)** — avaliar upgrade do Supabase para o plano Pro (~$25/mês, 8GB) caso o backfill do COTAHIST e a eventual expansão do universo de tickers aproximem o banco do limite de 500MB do free tier.

3. **LibreChat — pendências operacionais** — OAuth Google (configuração externa no Google Cloud Console) e QA cenário PESQUISA-01 (validar tool call MCP end-to-end).

4. **Investigar variação de volume no COTAHIST** — contagem de ativos caiu a cada dia na primeira semana (1.412 → 1.396 → 1.257); confirmar se é liquidez normal de sexta-feira ou parsing incompleto antes da Fase 2.
