# Plataforma MCP Brasil — Financial Analytics

Plataforma financeira analítica com Copilot baseado em dados públicos do Brasil.

## Visão do produto

Permitir que usuários consultem dados financeiros consolidados, realizem análises de risco e performance, e obtenham explicações sofisticadas via Chat Finance — tudo baseado em dados históricos internos, sem dependência de APIs em tempo real.

## Funcionalidades

- Dashboard de indicadores econômicos (IPCA, SELIC, CDI, PIB)
- Dashboard de Renda Variável (B3)
- Análise por classe de ativo: RF · RV · ETF · BDR · Fundos
- Camada analítica: Sharpe, Drawdown, Volatilidade
- Feed de notícias financeiras classificadas
- Chat Finance (LLM + RAG sobre dados internos)

## Arquitetura

```
MCP Brasil → ETL (Python) → Supabase (PostgreSQL) → FastAPI → Next.js → Chat Finance
```

Princípios:
- MCP usado apenas em ingestão, nunca em tempo real
- Base histórica como fonte única da verdade
- LLM apenas para explicação — cálculos são feitos na camada analítica
- Custo previsível e governança de dados

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js + Vercel |
| Backend | FastAPI (Python) + Render |
| Banco | Supabase (PostgreSQL) |
| ETL | Python scripts |
| Copilot | API Anthropic (Claude Sonnet) |
| Versionamento | GitHub |

## Estrutura do repositório

```
plataforma-mcp-brasil/
├── README.md
├── architecture.md
├── PRD.md
├── /frontend          ← Next.js
├── /backend           ← FastAPI
│   ├── main.py
│   ├── routes/
│   └── copilot/
├── /etl
│   ├── indicadores.py
│   ├── rv_historico.py
│   ├── fundos.py
│   └── analytics/
├── /database
│   └── schema.sql
└── /docs
    └── user_stories.md
```

## Roadmap MVP (8 semanas)

| Semana | Entregável |
|---|---|
| 1 | Repositório + schemas SQL |
| 2 | ETL indicadores + dados reais no Supabase |
| 3 | APIs FastAPI funcionais |
| 4 | Frontend conectado + deploy público |
| 5 | Camada analítica de Fundos |
| 6 | Chat Finance MVP |
| 7 | Feed de notícias + polimentos |
| 8 | Estabilização + documentação |

## Custo estimado (MVP)

~R$ 25/mês (apenas API Anthropic — demais serviços no free tier)

## Status

🟡 Em desenvolvimento — Semana 1
