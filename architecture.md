# Arquitetura — Plataforma MCP Brasil

## Fluxo macro

```
MCP Brasil (fonte pública)
    ↓
ETL Jobs (Python — execução diária)
    ↓
Supabase — Base Histórica (PostgreSQL)
    ├── Time Series (indicadores, preços, cotas)
    ├── Relacional (metadados, fundos, ETF, BDR)
    └── Analytical Layer (métricas pré-calculadas)
    ↓
FastAPI — APIs Internas
    ├── GET /indicadores
    ├── GET /rv/ativos
    ├── GET /fundos
    ├── GET /noticias
    └── POST /copilot/pergunta
    ↓
Next.js — Frontend
    ├── Dashboard Indicadores
    ├── Dashboard RV
    ├── Dashboard Fundos / ETF / BDR / RF
    ├── Feed de Notícias
    └── Chat Finance
```

## Arquitetura do Chat Finance (Copilot)

```
Usuário (pergunta)
    ↓
POST /copilot/pergunta
    ↓
Orquestrador
    ├── Identifica ativo (PETR4, Verde FIM, BOVA11...)
    ├── Classifica intenção (performance / risco / comparação / explicação)
    └── Define classe do ativo (RV / Fundo / ETF / BDR / RF)
    ↓
SQL Layer
    └── Query na tabela correta do Supabase
    ↓
Context Builder
    └── Monta contexto estruturado com os dados retornados
    ↓
Claude Sonnet (API Anthropic)
    └── Recebe contexto + pergunta → gera explicação
    ↓
Resposta estruturada (texto + dados)
    ↓
Frontend (Chat Finance UI)
```

## Regras fundamentais de arquitetura

| Regra | Descrição |
|---|---|
| MCP apenas em ingestão | Usuário nunca dispara chamada MCP |
| Dados sempre persistidos | Frontend só consome APIs internas |
| LLM não calcula | Cálculos feitos na camada analítica (Python) |
| LLM não acessa MCP | Copilot usa apenas dados do Supabase |
| Atualização incremental | ETL busca apenas novos registros (idempotente) |
| Custo previsível | Prompt enxuto + cache de respostas frequentes |

## Decisões de modelagem

### Renda Fixa
- Alta granularidade: risco, duração, spread
- Histórico diário de mercado

### Renda Variável
- Dados de pregão B3
- Campos: adjusted_close, market_cap, free_float

### ETF
- Herda RV + composição + tracking error

### BDR
- Herda RV + câmbio + lastro internacional

### Fundos
- Modelo próprio (não herda RV)
- Camada analítica forte: Sharpe, Drawdown, Volatilidade, % CDI

## Controle de custo

```
Cenário incorreto:
  10k usuários × 3 chamadas MCP × 3k tokens = ~90M tokens/dia

Cenário atual (correto):
  500 chamadas ETL × 2k tokens = ~1M tokens/dia
  Redução: >90%
```

## Serviços e ambientes

| Serviço | Ambiente | URL |
|---|---|---|
| Supabase | Banco + Auth | supabase.com |
| Render | Backend (FastAPI) | render.com |
| Vercel | Frontend (Next.js) | vercel.com |
| GitHub | Versionamento | github.com |
| Anthropic | LLM (Claude Sonnet) | anthropic.com |
