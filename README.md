# Plataforma MCP Brasil — Financial Analytics

Plataforma financeira analítica com Copilot baseado em dados públicos do Brasil.

## Visão do produto

Permitir que usuários consultem dados financeiros consolidados, realizem análises de risco e performance, e obtenham explicações sofisticadas via Chat Finance — tudo baseado em dados históricos internos, sem dependência de APIs em tempo real.

## Funcionalidades

- Dashboard de indicadores econômicos (IPCA, SELIC, CDI, PIB)
- Dashboard de Renda Variável (B3)
- Dashboard Contextual de Renda Fixa (Tesouro Direto + Debêntures/CRI/CRA via ANBIMA)
- Módulo Carteira — rastreamento de posições e métricas de risco (Sharpe, Sortino, Calmar, Drawdown)
- Análise por classe de ativo: RF · RV · Fundos
- Feed de notícias financeiras classificadas
- Chat Finance (LLM + RAG sobre dados internos) + LibreChat com agents MCP especializados

## URLs de produção

| Serviço | URL |
|---|---|
| Frontend | https://plataforma-mcp-brasil.vercel.app |
| Backend API | https://plataforma-mcp-brasil-api.onrender.com |
| LibreChat (Copilot avançado) | https://librechat-rlev.onrender.com |

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Frontend | Next.js + Vercel | 16.2.7 (App Router + Turbopack) |
| Design System | Clarity (dark editorial) — Newsreader + Inter | custom |
| UI base | shadcn/ui + Tailwind CSS v4 | `@theme inline` |
| Gráficos | Recharts | 2.x |
| Tema | next-themes | dark por padrão + toggle |
| Backend | FastAPI + Render | 0.111.0 |
| Banco | Supabase (PostgreSQL) | supabase-py 2.4.6 |
| Python | Python 3.12 (não 3.14) | 3.12.x |
| Copilot | Gemini 2.5 Flash (free tier) ou Claude (Anthropic) | configurável via `LLM_PROVIDER` |
| Copilot avançado | LibreChat + MCP (fastapi-mcp) | agents Quant/Macro/RV |
| Versionamento | GitHub | — |

> **Atenção:** usar Python 3.12 — `pydantic-core` e outras dependências não têm wheels pré-compilados para Python 3.14 no Windows.

> **Atenção:** `supabase-py 2.4.6` não suporta o novo formato de chave `sb_publishable_`/`sb_secret_`. Usar as chaves JWT legadas (Settings → API → "Legacy API keys").

## Clarity Design System

O frontend usa o design system **Clarity** — tema editorial dark com tokens semânticos CSS:

| Token | Valor (dark) | Uso |
|---|---|---|
| `--cl-navy` | `#13315c` | CTAs, active, logo |
| `--cl-accent` | `#1f6feb` | Links, destaque |
| `--cl-up` | `#0f9d58` | Variação positiva |
| `--cl-down` | `#d93838` | Variação negativa |
| `--cl-amber` | `#b9770a` | Alertas, stale |
| `--cl-bg` / `--cl-card` | `#0c1118` / `#121a26` | Fundo / cartão |

**Tipografia:** Newsreader (serif, via `next/font/google`) para KPIs e headings · Inter para corpo.

**Componentes compartilhados** (`frontend/components/`):
- `DataStates.tsx` — `SkeletonShimmer`, `ErrorState` (retry), `EmptyState`
- `MobileTabBar.tsx` — nav bottom fixo (mobile only, 4 itens)
- `Sidebar.tsx` — sidebar desktop com tokens `--cl-*`
- `ClientLayout.tsx` — sidebar `hidden md:flex` + MobileTabBar `md:hidden`

## Estrutura do repositório

```
plataforma-mcp-brasil/
├── README.md
├── architecture.md
├── docs/
│   ├── adr/
│   │   └── 001-cotahist-migracao-rv.md  ← decisão: migração RV brapi → COTAHIST
│   ├── erros_e_solucoes.md              ← troubleshooting
│   └── plano_renda_fixa.md
├── .gitignore
├── render.yaml              ← configuração de deploy Render
├── backend/
│   ├── main.py              ← FastAPI app (CORS + 10 routers + MCP em /mcp e /sse)
│   ├── db.py                ← Supabase client (SERVICE_KEY)
│   ├── requirements.txt
│   ├── runtime.txt          ← python-3.12.0 (Render)
│   ├── .env                 ← nunca comitar (SUPABASE_URL, KEYS, GEMINI_API_KEY, ANTHROPIC_API_KEY)
│   ├── .env.example
│   ├── routes/
│   │   ├── indicadores.py
│   │   ├── rv.py            ← variação diária via RPC rv_variacao_diaria()
│   │   ├── fundos.py        ← filtro CNPJS_ALVO + {cnpj:path}
│   │   ├── rf.py
│   │   ├── anbima.py        ← índices IMA/IDA, debêntures, CRI, CRA, VNA + sparklines
│   │   ├── carteira.py      ← posições + análise (VibeTrading metrics)
│   │   ├── noticias.py
│   │   ├── search.py        ← busca unificada (3 queries em paralelo)
│   │   ├── health.py        ← monitoramento ETL (view etl_health)
│   │   └── copilot.py
│   ├── carteira/
│   │   └── metricas.py      ← wrapper VibeTrading (Sharpe, Sortino, Calmar, Drawdown)
│   └── copilot/
│       ├── orchestrator.py  ← SHA256 cache + LLM (Gemini default, Anthropic opcional)
│       └── context_builder.py
├── etl/
│   ├── config.py            ← Supabase client compartilhado
│   ├── log_etl.py           ← ETLRun (auditoria) + retry_request + log_partial
│   ├── requirements.txt
│   ├── indicadores.py       ← BCB SGS API (IPCA, SELIC, CDI, PIB)
│   ├── rv_historico.py      ← brapi.dev — ~30 tickers curados B3
│   ├── cotahist.py          ← COTAHIST (B3) diário — staging, ver ADR-001
│   ├── cotahist_backfill.py ← COTAHIST anual — backfill histórico (staging)
│   ├── rf_tesouro.py        ← Tesouro Transparente CSV
│   ├── anbima.py            ← ANBIMA Feed API (OAuth2) — índices/debêntures/CRI/CRA/VNA
│   ├── fundos.py            ← CVM arquivos locais (anti-WAF)
│   ├── noticias.py          ← RSS InfoMoney/Money Times/Valor Investe
│   └── data/
│       └── cvm/             ← arquivos .csv/.zip baixados manualmente
│           └── .gitkeep     ← pasta versionada, arquivos ignorados
├── frontend/
│   ├── .env.example         ← NEXT_PUBLIC_API_URL
│   ├── next.config.ts
│   ├── app/
│   │   ├── globals.css      ← tokens Clarity + utility classes responsivas (cl-panel, cl-kpi4…)
│   │   ├── layout.tsx       ← Inter + Newsreader via next/font + ThemeProvider
│   │   ├── page.tsx         ← Home: hero Newsreader + KPI cards + sparklines SVG
│   │   ├── indicadores/     ← SELIC, IPCA, CDI, PIB · sidebar 240px + AreaChart
│   │   ├── rv/              ← ativos B3/FIIs · sidebar 300px + AreaChart dinâmico
│   │   ├── rf/              ← Tesouro Direto · overlay 3 indexadores + tabela
│   │   ├── renda-fixa/      ← Dashboard Contextual V3 · Debêntures/CRI/CRA + sparklines
│   │   ├── fundos/          ← CVM · filter chips + grid cards + AreaChart cota
│   │   ├── carteira/        ← posições + P&L + métricas de risco
│   │   ├── noticias/        ← feed RSS · filtros por categoria + tickers
│   │   ├── dashboard/       ← v1/v2/v3 — protótipos de painel unificado
│   │   ├── copilot/         ← Chat Finance · split 1fr/1fr + contexto macro
│   │   └── status/          ← ETL monitor · KPIs + source cards + TerminalLog
│   ├── components/
│   │   ├── ClientLayout.tsx ← sidebar desktop / MobileTabBar mobile
│   │   ├── Sidebar.tsx      ← navegação com tokens --cl-* + toggle dark/light
│   │   ├── MobileTabBar.tsx ← bottom nav 4 itens (mobile only, < 768px)
│   │   ├── DataStates.tsx   ← SkeletonShimmer · ErrorState · EmptyState
│   │   └── ThemeProvider.tsx
│   └── lib/
│       ├── api.ts           ← funções fetchAPI tipadas + APIError
│       └── format.ts        ← formatadores pt-BR compartilhados (BRL, %, cota)
├── librechat/                ← LibreChat + MCP — Copilot avançado (Render + MongoDB Atlas)
│   ├── docker-compose.yml
│   ├── librechat.yaml       ← mcpServers apontando para /mcp do backend
│   ├── Dockerfile
│   └── agents/              ← configs exportadas: Analista Quant/Macro/RV
└── database/
    ├── schema.sql           ← schema base (histórico — ver migrations para o estado atual)
    └── migrations/          ← aplicar manualmente no Supabase SQL Editor, em ordem
        ├── 003_etl_runs.sql                    ← tabela etl_runs + view etl_health
        ├── 004_indices_e_variacao_diaria.sql   ← índices parciais + rv_variacao_diaria()
        ├── 005_carteira.sql                    ← carteira_posicoes + carteira_snapshots
        ├── 006_anbima.sql                      ← anbima_indices + debêntures
        ├── 007_anbima_cri_cra.sql              ← anbima_cri_* + anbima_cra_*
        ├── 008_cotahist_staging.sql            ← rv_*_staging + cotahist_smoke_test
        └── 009_cleanup_indice_redundante.sql   ← remove índice duplicado em rv_historico
```

## Dados no Supabase (status atual)

| Tabela | Registros | Fonte | Período |
|---|---|---|---|
| indicadores_economicos | ~4.035 | BCB SGS API | 2020–hoje |
| rv_ativos | ~30 | brapi.dev | — |
| rv_historico | ~22.000 | brapi.dev | 2020–hoje |
| rv_ativos_staging / rv_historico_staging | crescendo | COTAHIST (B3) | desde 2026-07-01 (Fase 1, ver ADR-001) |
| fundos_cadastro | 8 | CVM cad_fi.csv | — |
| fundos_historico | ~4.852 | CVM inf_diario_fi_*.zip | 2024–2026 |
| rf_titulos | 78 | Tesouro Transparente CSV | — |
| rf_historico | ~65.927 | Tesouro Transparente CSV | 2020–hoje |
| anbima_indices / anbima_debentures_* / anbima_cri_* / anbima_cra_* | — | ANBIMA Feed API | pendente de acesso liberado no portal (ver `docs/erros_e_solucoes.md`) |
| carteira_posicoes / carteira_snapshots | por sessão | usuário (session_id anônimo) | — |

## Setup local

### Pré-requisitos

- Python **3.12** (não 3.14)
- Node.js 18+ para o frontend
- Conta Supabase com schema aplicado (`database/schema.sql` + migrations em `database/migrations/`, em ordem)
- Chaves JWT legadas do Supabase (não as `sb_publishable_`)
- API Key do Google Gemini (gratuita em https://aistudio.google.com/apikey — criar em projeto **sem** conta de faturamento vinculada, senão retorna 429)
- (Opcional) API Key da Anthropic, se usar `LLM_PROVIDER=anthropic`
- (Opcional) Credenciais ANBIMA (`ANBIMA_CLIENT_ID`/`ANBIMA_CLIENT_SECRET`) — registro gratuito em `developers.anbima.com.br`, requer app aprovado por produto

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Editar .env.local com NEXT_PUBLIC_API_URL
npm install
npm run dev       # http://localhost:3000
npm run build     # build de produção
```

### Backend

```powershell
cd backend
py -3.12 -m venv venv
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Criar .env com base no .env.example
uvicorn main:app --reload
```

### ETL

```powershell
cd etl
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python indicadores.py
python rv_historico.py
python rf_tesouro.py
python cotahist.py                       # COTAHIST diário (staging)
python cotahist_backfill.py --anos 1     # backfill histórico (staging)
python anbima.py                         # requer ANBIMA_CLIENT_ID/SECRET
# Para fundos: baixar arquivos em https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/
# Salvar em etl/data/cvm/ e executar:
python fundos.py
```

### ETL de Fundos — por que arquivos locais?

O portal CVM (`dados.cvm.gov.br`) usa Cloudflare WAF que bloqueia requisições HTTP automatizadas com 403. A solução é baixar os arquivos manualmente no navegador e colocá-los em `etl/data/cvm/`. O script aceita `.csv` e `.zip`.

## Roadmap MVP (8 semanas) + extensões pós-MVP

| Semana | Entregável | Status |
|---|---|---|
| 1 | Repositório + schemas SQL | ✅ Concluída |
| 2 | Supabase configurado + schema aplicado | ✅ Concluída |
| 3 | Backend FastAPI (5 rotas + Copilot) | ✅ Concluída |
| 4 | ETL completo (Indicadores + RV + Fundos) | ✅ Concluída |
| 5 | Frontend Next.js + deploy Vercel | ✅ Concluída |
| 6 | Renda Fixa (Tesouro Direto) | ✅ Concluída |
| 7 | Chat Finance MVP + Feed de notícias | ✅ Concluída |
| 8 | Redesign Clarity + Mobile + QA | ✅ Concluída |
| Épico A | Módulo Carteira (VibeTrading) | ✅ Concluída |
| Épico B | LibreChat + MCP (Copilot avançado) | ✅ Concluída |
| — | ANBIMA (índices/debêntures/CRI/CRA) + Dashboard V3 Renda Fixa | ⚙️ Backend/ETL prontos — acesso de dados pendente no portal ANBIMA |
| — | COTAHIST (B3) — Fase 1 (staging + descoberta de horário) | ✅ Concluída (2026-07-03) |
| — | COTAHIST (B3) — Fase 2 (promoção para produção) | 🔲 Pendente — ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md) |

### Semana 8 — Redesign Clarity (frontend completo)

**Design System:**
- Tokens semânticos `--cl-*` em `globals.css` (navy, accent, up/down/amber + soft variants)
- Tipografia: Newsreader (display/KPIs) + Inter (corpo) via `next/font/google`
- Componentes: `SkeletonShimmer`, `ErrorState` (retry), `EmptyState`, `MobileTabBar`

**7 páginas redesenhadas (3 sprints):**
- **Home** (`/`) — hero Newsreader italic, KPI cards com sparklines SVG, Painel Macro, Próximos Eventos
- **Indicadores** (`/indicadores`) — sidebar 240px com sparklines + AreaChart + tabela histórica
- **Renda Variável** (`/rv`) — sidebar 300px com lista assets + AreaChart dinâmico (verde/vermelho)
- **Renda Fixa** (`/rf`) — overlay LineChart 3 indexadores + cards por indexador + tabela
- **Fundos** (`/fundos`) — filter chips + grid cards por tipo + detalhe com AreaChart
- **Chat Finance** (`/copilot`) — split 1fr/1fr contexto macro + chat com bolhas navy/card
- **Status ETL** (`/status`) — 4 KPIs + source cards com TerminalLog dark

**Mobile responsive:**
- `MobileTabBar` fixo no bottom (64px, 4 itens: Início/Ações/Fixa/Chat)
- Sidebar `hidden md:flex`, main `p-4 md:p-8 pb-20 md:pb-8`
- Classes CSS responsivas: `cl-panel` (240px→1fr), `cl-kpi4` (4col→2×2), `cl-copilot` (split→stack), `cl-rf3`/`cl-sched3` (3col→1col)

**QA:**
- TypeScript: zero erros
- Build Turbopack: 20 páginas estáticas geradas
- Lighthouse mobile: home 93, indicadores 95, renda-fixa 89, rv 83, fundos 83 (> 80 em todas)
- Deploy Vercel: automático via push (Root Directory = `frontend`)

### Extensões pós-MVP

<details>
<summary>Módulo Carteira (Épico A)</summary>

- Backend: `backend/carteira/metricas.py` — wrapper VibeTrading (Sharpe, Sortino, Calmar, Max Drawdown, Win Rate)
- Rotas: `POST/GET/DELETE /carteira/posicoes` + `GET /carteira/analise`
- `session_id` anônimo (`crypto.randomUUID()` + localStorage) — sem autenticação
- Frontend `/carteira`: form + tabela de posições + resumo de performance
</details>

<details>
<summary>LibreChat + MCP (Épico B)</summary>

- Backend expõe `/mcp` (Streamable HTTP) e `/sse` (fallback) via `fastapi-mcp`
- LibreChat deploy: Render free tier + MongoDB Atlas free (M0, São Paulo)
- 3 agents pré-configurados: Analista Quant, Analista Macro, Analista RV — cada um com tools MCP específicas
- CI/CD: `.github/workflows/deploy-librechat.yml` (build → GHCR → Render Deploy Hook)
</details>

<details>
<summary>ANBIMA + Dashboard V3 Renda Fixa</summary>

- ETL `anbima.py`: 5 feeds (índices IMA/IDA, debêntures, CRI, CRA, VNA), OAuth2 Client Credentials
- Rotas `backend/routes/anbima.py` + sparklines dedicadas (`/anbima/{tipo}/sparklines`)
- Frontend `/renda-fixa`: topbar navy + tabs + lista com sparklines SVG + painel de detalhe
- **Pendência conhecida:** endpoints de dados retornam 401 mesmo com token OAuth2 válido — app precisa de autorização explícita no portal ANBIMA para os produtos de Feed de Preços e Índices (não é bug de código; ver `docs/erros_e_solucoes.md`)
</details>

<details>
<summary>COTAHIST (B3) — migração de fonte de Renda Variável</summary>

Ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md) para o histórico completo. Resumo:
- Fase 1 (concluída): ingestão em staging, 3 dias consecutivos de smoke test passando, descoberta de que a B3 não tem horário fixo de publicação
- Backfill anual (`cotahist_backfill.py`) implementado, escopo inicial de 1 ano (limite de armazenamento do Supabase free tier)
- Fase 2 (pendente): validação cruzada com brapi, resolução de ambiguidade ETF/fundo, decisão de escopo do universo e mecanismo de corte para produção
</details>

<details>
<summary>Semana 5 — Frontend inicial</summary>

- Frontend Next.js 15 com App Router, shadcn/ui (Nova preset), Tailwind CSS
- 4 páginas funcionais com dados reais: Indicadores, Renda Variável, Fundos, Chat Finance
- Dark mode por padrão com toggle light/dark na sidebar
- Deploy automatizado: backend no Render, frontend no Vercel
- Gráficos Recharts com domínio automático e cores adaptadas ao tema
</details>

<details>
<summary>Semana 6 — Renda Fixa</summary>

- Página Renda Fixa com 78 títulos do Tesouro Direto (Selic, IPCA+, Prefixado)
- ETL `rf_tesouro.py` via Tesouro Transparente (CSV público, sem Cloudflare WAF)
- 65.927 registros históricos de taxas e preços (2020–hoje)
- Títulos agrupados por indexador com taxa atual e gráfico histórico
</details>

<details>
<summary>Semana 7/8 — Chat Finance + Performance</summary>

- Fix N+1 em `/rv/ativos`: variação diária calculada no Postgres via `LAG()` (função `rv_variacao_diaria()`, migration 004)
- `/search` paralelizado: 3 queries simultâneas via `asyncio.gather` (latência ~3x menor)
- Chat Finance com Gemini 2.5 Flash (free tier) via `LLM_PROVIDER` configurável
- Retry automático em 429/503, formatadores pt-BR centralizados
</details>

## Variáveis de ambiente

### Frontend (`frontend/.env.local`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Sim | URL do backend (ex: `https://plataforma-mcp-brasil-api.onrender.com`) |

### Backend / Render

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Sim | Conexão com o banco |
| `LLM_PROVIDER` | Não (default `gemini`) | `gemini` ou `anthropic` |
| `GEMINI_API_KEY` | Se provider=gemini | Chave do AI Studio (free tier) |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | Não | Defaults: `gemini-2.5-flash` / `gemini-2.5-flash-lite` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Se provider=anthropic | Default model: `claude-sonnet-4-6` |
| `ANBIMA_CLIENT_ID` / `ANBIMA_CLIENT_SECRET` | Se usar ETL ANBIMA | Registro em `developers.anbima.com.br` |
| `BRAPI_TOKEN` | Não (aumenta rate limit) | Token gratuito em `brapi.dev` |

## Custo estimado (MVP)

**R$ 0/mês** — Supabase, Render, Vercel e Gemini (free tier). Anthropic disponível como alternativa paga via `LLM_PROVIDER=anthropic`.

**Atenção ao crescer o volume de dados:** o backfill histórico do COTAHIST e a eventual expansão do universo de tickers têm potencial de ultrapassar os 500MB do Supabase free tier — ver seção "Backfill histórico" do [ADR-001](docs/adr/001-cotahist-migracao-rv.md).

## Troubleshooting

Ver [`docs/erros_e_solucoes.md`](docs/erros_e_solucoes.md) para todos os erros encontrados e suas soluções.
