# Status — Plataforma Investimento

_Atualizado em: 2026-07-24_

---

## ✅ Atividades Realizadas (mais recentes primeiro)

38. **Copiloto: correção do fallback do widget + higiene de produção** _(2026-07-24)_ — o widget do site (`/copilot/pergunta`, persona quant) devolvia "Não consegui gerar uma resposta agora" em perguntas analíticas ("desempenho do PETR4 no ano"): o `max_tokens=1024` era baixo demais e o modelo estourava o teto antes de emitir o texto final (o runner encerra sem bloco de texto → fallback). Corrigido subindo pra **2048** (env `COPILOT_MAX_TOKENS`) e **instrumentando** o motivo do fallback no log do Render (`stop_reason` + tipos de bloco). QA ganhou o cenário **[9.3]** exercitando o caminho real do widget. Validado em produção (QA main 98%, resposta real de 734 chars). No mesmo ciclo: **fix `color-scheme`** (o "site mudando de cor" era o auto-dark do navegador do usuário reescrevendo o tema — código sempre renderizou navy; declarar `color-scheme` faz o navegador respeitar), **limpeza dos arquivos órfãos do LibreChat** do repo (`librechat/`, workflow `deploy-librechat.yml`), e nova **skill `guardiao-merge`** (protocolo anti-reversão de produção rodado em cada merge desta leva). PRs #24–#27, todos com guardião + QA.

37. **Copiloto: tool use nativo da Anthropic (aposenta o proxy LibreChat)** _(2026-07-24)_ — `/copilot` reescrito pra usar `client.beta.messages.tool_runner`: o LLM decide sozinho qual tool do `/mcp` chamar, cobrindo os 7 domínios de dados (o regex antigo cobria 3). As tools são as próprias rotas FastAPI expostas via `fastapi-mcp`, em sub-servidores escopados por persona (`/mcp/rv`, `/mcp/macro`, `/mcp/quant`). O proxy pro LibreChat + Bright Data (Épico B, PRs #16–21) foi aposentado — sem serviço externo, sem Mongo, sem OAuth. `/pergunta` (contrato do widget) e `/chat` (novo, com persona + `session_id`) rodam ambos no motor nativo. Segurança: separação de tags `Carteira Leitura`/`Carteira Escrita` mantém escrita fora das tools do chat (teste automatizado). QA cenário PESQUISA-01 escrito (`qa_run.py` Seção 9). 23 testes unitários, 2 pair-reviews.

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

0. **v1.1 — usuários reais e monetização** _(2026-07-24, proposto)_ — ver [ADR-002](docs/adr/002-v1.1-usuarios-reais-e-monetizacao.md). Direção definida pelo usuário: foco em monetização/usuários reais, Carteira ganha importação automática + alertas (método de importação ainda em aberto), Copiloto ganha memória entre sessões. Todo esse escopo **depende de uma fundação de identidade** que hoje não existe — a Carteira é escopada por um `session_id` gerado no navegador (`localStorage`), sem login, sem RLS. O ADR propõe Supabase Auth (zero infra nova, RLS nativa) em 4 fases: (0) auth + RLS — bloqueante; (1) memória do Copiloto; (2) cobrança/planos; (3) carteira automática + alertas. **Nenhum código escrito ainda** — aguardando validação do usuário pra iniciar a Fase 0.

1. **ANBIMA — resolver autorização de produto** — contatar suporte ANBIMA (`suporte.developers@anbima.com.br`) para habilitar o app no Feed de Preços e Índices. Token OAuth2 já funciona; falta autorização por produto.

   > **Alternativa mapeada (2026-07-24)** enquanto a ANBIMA não libera: para dados de **CRI/CRA/Debêntures** sem custo e com acesso programático —
   > **(1) B3 Hub de Dados Públicos** (https://www.b3.com.br/pt_br/dados/hub-de-dados-publicos/) — gratuito, oficial, CSV diário, cobre os três com preço de fechamento/PU e negócios do secundário (substituto mais direto da ANBIMA p/ preços);
   > **(2) CVM Dados Abertos / CKAN** (`distrpubl`, `securit-doc-inf_mensal_cri`, `securit-doc-inf_mensal_cra`) — gratuito, cadastro + emissões + estoque + eventos (não traz preço, casa com a B3 por ISIN);
   > **(3) Debêntures.com.br / SND** — histórico longo de PU/negociação de debêntures desde 2005 (scraping de páginas `.asp`, sem API). Acelerador: lib `PythonicCafe/mercados`. A "taxa indicativa" (MtM) segue sendo produto pago ANBIMA — paliativo grátis é o `data.anbima.com.br` (só últimos 5 dias úteis).

2. **(Decisão de negócio)** — avaliar upgrade do Supabase para o plano Pro (~$25/mês, 8GB) caso o backfill do COTAHIST e a eventual expansão do universo de tickers aproximem o banco do limite de 500MB do free tier.

3. **Descomissionar o LibreChat + MongoDB Atlas** — o Copiloto migrou pra tool use nativo (item 37). Os arquivos órfãos no repo (`librechat/`, workflow `deploy-librechat.yml`) já foram removidos. **Ação manual pendente (fora do repo):** desligar o serviço LibreChat no Render + o cluster MongoDB Atlas, e **rotacionar** a senha que estava em `librechat/agents/create_agents.ps1` — remover o arquivo do HEAD **não** a tira do histórico do git nem do serviço live, então a rotação continua obrigatória.

4. **Investigar variação de volume no COTAHIST** — contagem de ativos caiu a cada dia na primeira semana (1.412 → 1.396 → 1.257); confirmar se é liquidez normal de sexta-feira ou parsing incompleto antes da Fase 2.
