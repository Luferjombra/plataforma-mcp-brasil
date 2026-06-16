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
  ├── GET  /rv/ativos + /rv/historico/{ticker}
  ├── GET  /fundos + /fundos/historico/{cnpj}
  ├── GET  /rf/titulos + /rf/historico/{codigo}
  ├── GET  /health/etl
  └── POST /copilot/pergunta
         ↓
Next.js — Frontend (Vercel)
  ├── /indicadores        — Macro (BCB)
  ├── /rv                 — Renda Variável (B3)
  ├── /rf                 — Renda Fixa (Tesouro Direto)
  ├── /fundos             — Fundos de Investimento (CVM)
  ├── /dashboard/v1       — Painel Unificado (Timeline multi-série)
  ├── /dashboard/v2       — Grid + Drawer (SparklineCards)
  ├── /dashboard/v3       — Multi-Panel Analítico (3 colunas)
  ├── /copilot            — Chat Finance
  └── /status             — Status ETL
```

## Arquitetura do Chat Finance (Copilot)

```
Usuário (pergunta)
    ↓
POST /copilot/pergunta
    ↓
Orquestrador
  ├── SHA256(pergunta) → busca copilot_cache → hit → retorna resposta cacheada
  └── miss → context_builder → Gemini Flash → salva no cache → retorna
    ↓
context_builder.py
  ├── Identifica ativo (PETR4, CNPJ de fundo...)
  ├── Classifica intenção (performance / risco / comparação / explicação)
  └── Query Supabase → contexto estruturado
    ↓
Google Gemini (gemini-2.5-flash / gemini-2.0-flash-lite fallback)
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
| Atualização incremental | ETL faz upsert idempotente (on_conflict) com overlap de 5 dias |
| Custo previsível | Prompt enxuto + cache SHA256 de respostas |
| ETL resiliente | ETLRun context manager + log_partial em erro parcial |
| Formatação padronizada | Todos os valores monetários e taxas: 2 casas decimais |

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
| rf_titulos | relacional | Títulos Tesouro Direto |
| rf_historico | time series | Taxas e PU históricos |
| noticias | relacional | Feed financeiro |
| etl_runs | operacional | Auditoria de jobs ETL (status, rows_upserted, error_detail) |
| copilot_cache | cache | Respostas Gemini por hash SHA256 |

> ⚠️ A tabela de auditoria ETL é **`etl_runs`** — não `etl_log` (não existe).
> Usar sempre via `ETLRun` context manager em `log_etl.py`.

## ETL — Padrão obrigatório

Todo ETL **deve** seguir o padrão de `rv_historico.py`:

```python
from log_etl import ETLRun, retry_request, log_partial

def run():
    erros, total = [], 0
    for item in itens:
        try:
            with ETLRun("job_name") as run:
                dados = buscar(item)
                salvos = salvar(dados)
                run.set_rows(salvos)
                total += salvos
        except Exception as e:
            erros.append(f"{item}: {e}")

    if erros and total > 0:
        log_partial("job_name_batch", total, "; ".join(erros))
```

- `ETLRun` grava em `etl_runs` (started_at, finished_at, status, rows_upserted)
- `log_partial` registra sucesso parcial quando ≥1 item falhou e ≥1 teve sucesso
- `retry_request` envolve toda chamada HTTP externa (3 tentativas, backoff exponencial)
- Incrementalidade: query Supabase para `MAX(data)` antes de buscar, com overlap de 5 dias

## ETL — Fontes e decisões

### BCB SGS API (indicadores.py)
- Endpoint público, sem WAF, sem autenticação
- Séries: IPCA=433, SELIC=432, CDI=12, PIB=7326
- **Importante:** PIB usar série 7326 (variação % trimestral), NÃO a 4380 (valor absoluto R$ bilhões — causa overflow em NUMERIC(12,6))
- BCB retorna `[]` sem erro HTTP quando não há dados — validar com `isinstance(dados, list)`
- Incrementalidade via `ultima_data_no_banco(serie)` — overlap de 5 dias para IPCA/PIB atrasados

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
- `upsert_historico()` tem retry de 3 tentativas com backoff (1s, 2s)

## Frontend — Convenções

### Formatação de valores (obrigatório — 2 casas decimais)
Usar sempre os formatters de `frontend/lib/format.ts`:

| Tipo | Função | Exemplo |
|------|--------|---------|
| Preço RV | `formatBRL(v)` | R$ 38,42 |
| Cota de fundo | `formatCota(v)` | R$ 415,15 |
| Taxa % | `v.toFixed(2) + '%'` | 12.25% |
| Variação % | `v.toFixed(2) + '%'` | +0.94% |
| Patrimônio | `formatMilhoes(v)` | R$ 1.2B |

> ⚠️ Nunca usar `.toFixed(4)` ou `minimumFractionDigits > 2` em valores exibidos ao usuário.

### Dashboard — Estrutura de rotas
```
/dashboard          → redirect para /dashboard/v1
/dashboard/layout   → injeta DashboardVersionNav em todas as versões
/dashboard/v1       → Painel Unificado: LineChart multi-série, eixo Y duplo
/dashboard/v2       → Grid + Drawer: 4 SparklineCards, drawer lateral AreaChart
/dashboard/v3       → Multi-Panel: sidebar seletora | AreaChart | MetricasPanel
```

### Componentes reutilizáveis
| Componente | Localização | Uso |
|-----------|-------------|-----|
| `SparklineCard` | `components/SparklineCard.tsx` | Card com sparkline 80px + valor + variação |
| `DashboardVersionNav` | `components/DashboardVersionNav.tsx` | Nav entre v1/v2/v3 |
| `Sidebar` | `components/Sidebar.tsx` | Nav global — active com `startsWith` para /dashboard |

## Performance Testing

Scripts em `perf/` prontos para rodar com k6:

```
perf/
  config.js           → URLs, thresholds e endpoints centralizados
  smoke_test.js       → 1 VU / 30s — valida todos endpoints antes do load test
  load_test.js        → ramping 0→100 VUs em 5 fases (12min total)
  supabase_monitor.sql → queries para monitorar conexões durante o teste
```

**Limite esperado no free tier:**
- Render: degradação p95 > 3s em torno de 30–50 VUs simultâneos
- Supabase: saturação de conexões em ~60 VUs (60 conexões diretas free tier)

**Ferramenta de performance:** k6 (não Locust) — ver justificativa em `qa-financeiro.skill`.

## Decisões de modelagem

### Renda Variável
- Dados de pregão B3 via yfinance
- Campos: open, high, low, close, close_adj, volume
- Status: `ativo` ou `delisted`

### Fundos de Investimento
- Modelo próprio, sem herança de RV
- CNPJs alvos: preferência por feeders (o que o cotista acessa)
- CNPJs com `/` na URL: usar `encodeURIComponent()` — já implementado em `api.ts`
- Camada analítica futura: Sharpe, Drawdown, Volatilidade, % CDI

### Renda Fixa
- Tesouro Direto via `rf_titulos` e `rf_historico`
- Taxa exibida: `taxa_compra` (não `taxa_mercado`)
- Títulos cotados como spread sobre índice (LFT = spread sobre SELIC ≈ 0–0.20%)

## Serviços e ambientes

| Serviço | Plano | URL / Referência |
|---|---|---|
| Supabase | Free | tbrnvroihuxiudwsgrjz.supabase.co |
| Render | Free | plataforma-mcp-brasil-api.onrender.com |
| Vercel | Free | plataforma-mcp-brasil.vercel.app |
| GitHub | Free | github.com/Luferjombra/plataforma-mcp-brasil |
| Google AI | Free tier | Gemini 2.5 Flash (copilot) |

## Controle de custo

```
Cenário incorreto (MCP em tempo real):
  10k usuários × 3 chamadas × 3k tokens = ~90M tokens/dia

Cenário atual (ETL batch + cache + Gemini free tier):
  ETL periódico + cache SHA256 de respostas frequentes
  LLM: Gemini 2.5 Flash (gratuito) com fallback para gemini-2.0-flash-lite
  Redução: >90% no custo de tokens vs chamadas em tempo real
```
