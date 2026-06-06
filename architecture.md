# Arquitetura — Plataforma MCP Brasil

## Fluxo macro

```
Fontes Públicas
  ├── BCB SGS API          → indicadores_economicos
  ├── Yahoo Finance (yf)   → rv_ativos + rv_historico
  └── CVM (arquivos local) → fundos_cadastro + fundos_historico
         ↓
ETL Jobs (Python — execução periódica manual ou via cron)
         ↓
Supabase — Base Histórica (PostgreSQL)
  ├── Time Series  (indicadores, preços, cotas)
  ├── Relacional   (metadados, fundos)
  └── Cache        (copilot_cache)
         ↓
FastAPI — APIs Internas (Render)
  ├── GET  /indicadores
  ├── GET  /rv/ativos
  ├── GET  /fundos
  ├── GET  /noticias
  └── POST /copilot/pergunta
         ↓
Next.js — Frontend (Vercel)
  ├── Dashboard Indicadores
  ├── Dashboard RV
  ├── Dashboard Fundos
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
  ├── SHA256(pergunta) → busca copilot_cache → hit → retorna resposta cacheada
  └── miss → context_builder → Claude Sonnet → salva no cache → retorna
    ↓
context_builder.py
  ├── Identifica ativo (PETR4, CNPJ de fundo...)
  ├── Classifica intenção (performance / risco / comparação / explicação)
  └── Query Supabase → contexto estruturado
    ↓
Claude Sonnet (API Anthropic)
  └── contexto + pergunta → resposta em linguagem natural
    ↓
Frontend (Chat Finance UI)
```

## Regras fundamentais de arquitetura

| Regra | Descrição |
|---|---|
| Fontes públicas apenas em ETL | Usuário nunca dispara chamada externa |
| Dados sempre persistidos | Frontend só consome APIs FastAPI internas |
| LLM não calcula | Cálculos feitos na camada analítica (Python/SQL) |
| LLM não acessa fontes externas | Copilot usa apenas dados do Supabase |
| Atualização incremental | ETL faz upsert idempotente (on_conflict) |
| Custo previsível | Prompt enxuto + cache SHA256 de respostas |

## Banco de dados — 13 tabelas

| Tabela | Tipo | Descrição |
|---|---|---|
| indicadores_economicos | time series | IPCA, SELIC, CDI, PIB |
| rv_ativos | relacional | Cadastro de ações B3 |
| rv_historico | time series | OHLCV diário |
| fundos_cadastro | relacional | Cadastro CVM |
| fundos_historico | time series | Cotas diárias CVM |
| fund_analytics_metrics | analítica | Sharpe, Drawdown, Vol (pré-calculados) |
| etf_cadastro | relacional | — |
| bdr_cadastro | relacional | — |
| rf_titulos | relacional | — |
| rf_historico | time series | — |
| noticias | relacional | Feed financeiro |
| etl_log | operacional | Auditoria de jobs ETL |
| copilot_cache | cache | Respostas Claude por hash |

## ETL — Fontes e decisões

### BCB SGS API (indicadores.py)
- Endpoint público, sem WAF, sem autenticação
- Séries: IPCA=433, SELIC=432, CDI=12, PIB=7326
- **Importante:** PIB usar série 7326 (variação % trimestral), NÃO a 4380 (valor absoluto R$ bilhões — causa overflow em NUMERIC(12,6))

### Yahoo Finance / yfinance (rv_historico.py)
- Tickers B3 requerem sufixo `.SA` (ex: `PETR4.SA`)
- `safe_float()` obrigatório para filtrar NaN/Inf antes do upsert PostgreSQL
- Detecção de delisting: último pregão > 30 dias → `status = 'delisted'`
- Ações delistadas: registram histórico disponível + status no cadastro

### CVM (fundos.py)
- **Problema:** Cloudflare WAF bloqueia todas as requisições HTTP automatizadas com 403
- **Solução:** download manual dos arquivos no navegador → `etl/data/cvm/`
- Script aceita `.csv` e `.zip` (descompacta automaticamente)
- **Mudança de schema CVM:** coluna `CNPJ_FUNDO` renomeada para `CNPJ_FUNDO_CLASSE` nos arquivos de 2024+. O script detecta e normaliza automaticamente.
- **Duplicatas:** cad_fi.csv e inf_diario_fi_*.csv podem ter linhas repetidas — `drop_duplicates()` antes de cada upsert

## Decisões de modelagem

### Renda Variável
- Dados de pregão B3 via yfinance
- Campos: open, high, low, close, close_adj, volume
- Status: `ativo` ou `delisted`

### Fundos de Investimento
- Modelo próprio, sem herança de RV
- CNPJs alvos: preferência por feeders (o que o cotista acessa)
- Camada analítica futura: Sharpe, Drawdown, Volatilidade, % CDI

## Serviços e ambientes

| Serviço | Plano | URL |
|---|---|---|
| Supabase | Free | tbrnvroihuxiudwsgrjz.supabase.co |
| Render | Free | — (deploy pendente) |
| Vercel | Free | — (deploy pendente) |
| GitHub | Free | github.com/Luferjombra/plataforma-mcp-brasil |
| Anthropic | Pay-per-use | console.anthropic.com |

## Controle de custo

```
Cenário incorreto (MCP em tempo real):
  10k usuários × 3 chamadas × 3k tokens = ~90M tokens/dia

Cenário atual (ETL batch + cache):
  ETL periódico + cache de respostas frequentes
  Redução: >90% no custo de tokens
```
