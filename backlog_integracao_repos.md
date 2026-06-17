# Backlog — Integração dos 4 Repos Analisados

_Criado em 2026-06-16 após análise arquitetural._

Premissa: nada quebra o que já está em produção. Cada épico é independente e pode ser priorizado ou pausado sem afetar os demais.

---

## Épico A — Módulo Carteira com motor analítico VibeTrading

**Objetivo:** entregar item 6 do backlog (rastreamento de posições + cálculo de performance) usando o `BacktestEngine` do VibeTrading para métricas de risco profissionais.

**Por quê VibeTrading:** Sharpe / Sortino / Calmar / Drawdown / Win-rate já implementados e testados. Importar como lib é mais barato que reescrever.

### A.1 — Schema Supabase (1h)
- [ ] Criar `carteira_posicoes` (`session_id`, `ticker`, `tipo`, `quantidade`, `preco_medio`, `data_entrada`)
- [ ] Criar `carteira_snapshots` (`session_id`, `data`, `valor_total`, `rentabilidade_pct`, `vs_cdi`, `vs_ibov`, métricas de risco)
- [ ] Aplicar migration no Supabase

### A.2 — Wrapper VibeTrading no backend (3h)
- [ ] `pip install vibetrading` em `backend/requirements.txt`
- [ ] Criar `backend/carteira/metricas.py` — wrapper fino:
  - Input: série histórica `[(data, valor)]`
  - Output: dict com Sharpe, Sortino, Calmar, Drawdown, Win-rate
- [ ] Testes unitários com série conhecida

### A.3 — Rotas FastAPI `backend/routes/carteira.py` (3h)
- [ ] `POST /carteira/posicoes` — adicionar posição
- [ ] `GET /carteira/posicoes` — listar da sessão
- [ ] `DELETE /carteira/posicoes/{id}`
- [ ] `GET /carteira/analise` — P&L + métricas VibeTrading + comparação CDI/IBOV
- [ ] Registrar no `main.py` com `tags=["Carteira"]`

### A.4 — Página `/carteira` no frontend (5h)
- [ ] `frontend/app/carteira/page.tsx` — 3 painéis (form, tabela, resumo)
- [ ] `frontend/lib/carteira.ts` — tipos e helpers de cálculo
- [ ] Integração com `useSession` simples para `session_id`
- [ ] Sidebar: novo item "Carteira"

### A.5 — QA + skill (1h)
- [ ] Cenário `CARTEIRA-01` na skill QA
- [ ] Checks em `qa_run.py` Seção 8

**Esforço total:** ~13h • **Dependências:** nenhuma • **Risco:** baixo

---

## Épico B — Assistente de Pesquisa com LibreChat

**Objetivo:** entregar item 7 do backlog (interface conversacional avançada com outputs estruturados) instalando LibreChat como segundo backend de chat, consumindo nossa `/mcp` existente.

**Por quê LibreChat:** já fala MCP nativamente. Nossa API já expõe MCP via `fastapi-mcp`. Match perfeito sem precisar reescrever nada.

### B.1 — POC LibreChat local + MCP (4h)
- [ ] `docker compose up` LibreChat em `librechat/` no repo
- [ ] Configurar `librechat.yaml` com nosso MCP server (`https://plataforma-mcp-brasil-api.onrender.com/mcp`)
- [ ] Validar que LibreChat enxerga nossas tools (`get_ativos`, `get_indicadores`, etc.)
- [ ] Pedir ao chat: _"Qual o desempenho do PETR4 nos últimos 30 dias?"_ — verificar se ele chama a tool MCP correta

### B.2 — Decisão de deploy (1h, sem código)
- [ ] Comparar custos: Render Pro (R$ 35/mês) vs Railway free vs Fly.io
- [ ] Definir hostname (`copilot-pro.plataforma-mcp-brasil.com`?)
- [ ] Documentar escolha em `architecture.md`

### B.3 — Deploy LibreChat em prod (4h)
- [ ] CI/CD: GitHub Action faz build + deploy
- [ ] Configurar OAuth (Google login) para multi-user
- [ ] Configurar secrets (GEMINI_API_KEY, MCP_URL)
- [ ] Health check + monitoring

### B.4 — Skills/Agents inspirados em AutoHedge (3h)
- [ ] Criar `Skill: Analista Quant` — prompt focado em métricas de risco e análise técnica (inspirado no Quant Agent do AutoHedge)
- [ ] Criar `Skill: Analista Macro` — prompt focado em SELIC/IPCA/PIB
- [ ] Criar `Skill: Analista Renda Variável` — prompt focado em fundamentals
- [ ] Cada skill chama tools MCP específicas

### B.5 — Link no frontend para `/copilot-pro` (1h)
- [ ] Adicionar botão "Assistente avançado" no `/copilot` atual
- [ ] Manter `/copilot` simples (Gemini direto) para usuários casuais
- [ ] Sidebar: badge "PRO" no item

### B.6 — QA + skill (2h)
- [ ] Cenário `PESQUISA-01`: chat consegue invocar tool MCP e retornar resposta com dados reais
- [ ] Documentar prompts das 3 skills em `references/`

**Esforço total:** ~15h • **Dependências:** decisão de deploy (B.2) • **Risco:** médio (custo Render)

---

## Épico C — Inspiração FinceptTerminal: expansão de fontes

**Objetivo:** roadmap futuro de novas fontes de dado, copiando a curadoria do FinceptTerminal mas implementando como ETLs próprios na nossa stack.

**Por quê só inspiração:** stack incompatível (C++/Qt6 desktop) + licença AGPL/comercial bloqueia uso de código.

### C.1 — Levantamento de fontes prioritárias (1h, sem código)
Da lista de 100+ connectors do FinceptTerminal, priorizar para mercado BR/comparativo:
- [ ] **FRED** (Federal Reserve Economic Data) — taxas US para comparação
- [ ] **IMF DataMapper** — projeções econômicas Brasil vs G20
- [ ] **World Bank** — indicadores estruturais (Gini, PIB per capita)
- [ ] **Polygon.io** (free tier) — dados intraday de ETFs BR negociados em NY

### C.2 — ETL FRED (3h)
- [ ] `etl/fred.py` seguindo padrão `ETLRun` + `retry_request`
- [ ] Nova tabela `indicadores_internacionais` (série, país, data, valor)
- [ ] Rota `GET /internacionais?serie=...`

### C.3 — Widget "Brasil vs Mundo" no dashboard (4h)
- [ ] Componente comparando SELIC vs Fed Funds Rate
- [ ] IPCA vs CPI US
- [ ] Inserir em `/dashboard/v3` como 4ª coluna

**Esforço total:** ~8h • **Dependências:** nenhuma • **Risco:** baixo • **Priority:** baixa

---

## Épico D — Hardening operacional (achados do QA de hoje)

**Objetivo:** fechar os achados 🟠 e 🟡 do último QA antes de novas features.

### D.1 — Fix cron de indicadores (✅ JÁ APLICADO — pending push) (15min)
- [x] `.github/workflows/etl.yml`: cron de indicadores `0 12 * * 1` → `0 12 * * 1-5`
- [x] Remover BCFF11 de `ATIVOS[]` em `etl/rv_historico.py`
- [ ] Commit + push

### D.2 — Fix qa_run.py — códigos RF (1h)
- [ ] Trocar `LFT_2029` por `LFT_2029-03-01` no script de QA
- [ ] Validar rerun: score deve subir para 92%+

### D.3 — Categorização de notícias (2h)
- [ ] Trocar URL Valor Investe geral por feeds de seção (`/financas/`, `/mercados/`)
- [ ] Mudar fallback de "Macro" para "Outros" em `etl/noticias.py:71`
- [ ] Frontend `/noticias`: filtrar "Outros" por padrão

### D.4 — Limpeza de arquivos temporários (15min)
- [ ] Adicionar ao `.gitignore`: `_tmp_skill.md`, `perf/resultado_*.csv`, `perf/resumo_*.txt`, `qa-financeiro-extracted/`, `qa-financeiro.zip`
- [ ] Mover SKILL.md atualizado da skill QA para `skills/qa-financeiro/SKILL.md` versionado

**Esforço total:** ~4h • **Dependências:** nenhuma • **Risco:** zero

---

## Sequência recomendada

```
1. Épico D (4h)    — Hardening: fechar QA + commit pendente
2. Épico A (13h)   — Carteira com VibeTrading
3. Épico B (15h)   — LibreChat (decisão de deploy primeiro)
4. Épico C (8h)    — FRED + comparação internacional (roadmap)
```

**Total geral:** ~40h • **Distribuição sugerida:** 2 sprints de 1 semana cada (D+A no primeiro, B no segundo, C como overflow).

---

## Custos recorrentes possíveis

| Item | Cenário | Custo/mês |
|------|---------|-----------|
| brapi Pro | Se passar de 90d de histórico | R$ 116 (anual) |
| Render Pro | Se LibreChat estourar 512MB | R$ 35 |
| Railway free | Alternativa LibreChat | R$ 0 |
| Polygon.io | Se Épico C precisar de intraday | R$ 0 (free tier) |

Decisões de pagar só após validação real, com plano free como default.
