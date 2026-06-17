# Status — Plataforma Investimento

_Atualizado em: 2026-06-16_

---

## ✅ Atividades Realizadas

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

1. **Módulo Carteira** — rastreamento de posições e cálculo de performance por ativo e por carteira.

2. **Assistente de pesquisa** — interface conversacional sobre dados históricos, com outputs estruturados de estudos e análises.

3. **Investigar BCFF11** — único FII com 404 na brapi; provavelmente renomeado ou deslistado pela B3.

4. **(Decisão de negócio)** — avaliar assinatura brapi Pro (R$ 116/mês anual) quando precisarmos de histórico > 90d ou novos tickers obscuros.

5. **(Pendência operacional)** — verificar por que o cron de indicadores não disparou em 16/06 (último run válido em 15/06 17:12 UTC).
