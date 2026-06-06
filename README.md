# Plataforma MCP Brasil — Financial Analytics

Plataforma financeira analítica com Copilot baseado em dados públicos do Brasil.

## Visão do produto

Permitir que usuários consultem dados financeiros consolidados, realizem análises de risco e performance, e obtenham explicações sofisticadas via Chat Finance — tudo baseado em dados históricos internos, sem dependência de APIs em tempo real.

## Funcionalidades

- Dashboard de indicadores econômicos (IPCA, SELIC, CDI, PIB)
- Dashboard de Renda Variável (B3)
- Análise por classe de ativo: RF · RV · Fundos
- Camada analítica: Sharpe, Drawdown, Volatilidade
- Feed de notícias financeiras classificadas
- Chat Finance (LLM + RAG sobre dados internos)

## URLs de produção

| Serviço | URL |
|---|---|
| Frontend | https://plataforma-mcp-brasil.vercel.app |
| Backend API | https://plataforma-mcp-brasil-api.onrender.com |

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Frontend | Next.js + Vercel | 15 (App Router) |
| UI | shadcn/ui + Tailwind CSS | Nova preset |
| Gráficos | Recharts | 2.x |
| Tema | next-themes | dark por padrão + toggle |
| Backend | FastAPI + Render | 0.111.0 |
| Banco | Supabase (PostgreSQL) | supabase-py 2.4.6 |
| Python | Python 3.12 (não 3.14) | 3.12.x |
| Copilot | Claude Sonnet (Anthropic) | anthropic 0.25.0 |
| Versionamento | GitHub | — |

> **Atenção:** usar Python 3.12 — `pydantic-core` e outras dependências não têm wheels pré-compilados para Python 3.14 no Windows.

> **Atenção:** `supabase-py 2.4.6` não suporta o novo formato de chave `sb_publishable_`/`sb_secret_`. Usar as chaves JWT legadas (Settings → API → "Legacy API keys").

## Estrutura do repositório

```
plataforma-mcp-brasil/
├── README.md
├── architecture.md
├── .gitignore
├── render.yaml              ← configuração de deploy Render
├── backend/
│   ├── main.py              ← FastAPI app (CORS + 5 routers)
│   ├── db.py                ← Supabase client (SERVICE_KEY)
│   ├── requirements.txt
│   ├── runtime.txt          ← python-3.12.0 (Render)
│   ├── .env                 ← nunca comitar (SUPABASE_URL, KEYS, ANTHROPIC_API_KEY)
│   ├── .env.example
│   ├── routes/
│   │   ├── indicadores.py
│   │   ├── rv.py
│   │   ├── fundos.py        ← filtro CNPJS_ALVO + {cnpj:path}
│   │   ├── noticias.py
│   │   └── copilot.py
│   └── copilot/
│       ├── orchestrator.py  ← SHA256 cache + Claude Sonnet
│       └── context_builder.py
├── etl/
│   ├── config.py            ← Supabase client compartilhado
│   ├── requirements.txt
│   ├── indicadores.py       ← BCB SGS API (IPCA, SELIC, CDI, PIB)
│   ├── rv_historico.py      ← yfinance (.SA) — 16 tickers B3
│   ├── fundos.py            ← CVM arquivos locais (anti-WAF)
│   └── data/
│       └── cvm/             ← arquivos .csv/.zip baixados manualmente
│           └── .gitkeep     ← pasta versionada, arquivos ignorados
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       ← ThemeProvider (dark padrão) + Sidebar
│   │   ├── indicadores/     ← IPCA, SELIC, CDI, PIB + gráfico histórico
│   │   ├── rv/              ← lista B3 + gráfico de preço
│   │   ├── fundos/          ← 8 fundos CVM + evolução de cota
│   │   └── copilot/         ← Chat Finance (Claude Sonnet)
│   ├── components/
│   │   ├── Sidebar.tsx      ← navegação + toggle dark/light
│   │   └── ThemeProvider.tsx
│   ├── lib/
│   │   └── api.ts           ← funções fetchAPI tipadas
│   └── .env.local           ← NEXT_PUBLIC_API_URL
├── database/
│   └── schema.sql           ← 13 tabelas + triggers
└── docs/
    └── erros_e_solucoes.md  ← troubleshooting Semanas 1–5
```

## Dados no Supabase (status atual)

| Tabela | Registros | Fonte | Período |
|---|---|---|---|
| indicadores_economicos | ~4.035 | BCB SGS API | 2020–hoje |
| rv_ativos | 16 | yfinance | — |
| rv_historico | ~22.000 | yfinance (.SA) | 2020–hoje |
| fundos_cadastro | 8 | CVM cad_fi.csv | — |
| fundos_historico | ~4.852 | CVM inf_diario_fi_*.zip | 2024–2026 |

## Setup local

### Pré-requisitos

- Python **3.12** (não 3.14)
- Conta Supabase com schema aplicado (`database/schema.sql`)
- Chaves JWT legadas do Supabase (não as `sb_publishable_`)
- API Key da Anthropic (`sk-ant-api03-...`)

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
# Para fundos: baixar arquivos em https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/
# Salvar em etl/data/cvm/ e executar:
python fundos.py
```

### ETL de Fundos — por que arquivos locais?

O portal CVM (`dados.cvm.gov.br`) usa Cloudflare WAF que bloqueia requisições HTTP automatizadas com 403. A solução é baixar os arquivos manualmente no navegador e colocá-los em `etl/data/cvm/`. O script aceita `.csv` e `.zip`.

## Roadmap MVP (8 semanas)

| Semana | Entregável | Status |
|---|---|---|
| 1 | Repositório + schemas SQL | ✅ Concluída |
| 2 | Supabase configurado + schema aplicado | ✅ Concluída |
| 3 | Backend FastAPI (5 rotas + Copilot) | ✅ Concluída |
| 4 | ETL completo (Indicadores + RV + Fundos) | ✅ Concluída |
| 5 | Frontend Next.js + deploy Vercel | ✅ Concluída |
| 6 | Chat Finance MVP | ⏳ Pendente |
| 7 | Feed de notícias + polimentos | ⏳ Pendente |
| 8 | Estabilização + documentação | ⏳ Pendente |

### Semana 5 — o que foi entregue

- Frontend Next.js 15 com App Router, shadcn/ui (Nova preset), Tailwind CSS
- 4 páginas funcionais com dados reais: Indicadores, Renda Variável, Fundos, Chat Finance
- Dark mode por padrão com toggle light/dark na sidebar
- Deploy automatizado: backend no Render, frontend no Vercel
- Gráficos Recharts com domínio automático e cores adaptadas ao tema
- 10 bugs documentados e resolvidos (ver `docs/erros_e_solucoes.md`)

## Custo estimado (MVP)

~R$ 25/mês (apenas API Anthropic — Supabase, Render e Vercel no free tier)

## Troubleshooting

Ver [`docs/erros_e_solucoes.md`](docs/erros_e_solucoes.md) para todos os erros encontrados e suas soluções.
