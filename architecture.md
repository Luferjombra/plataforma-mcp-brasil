# Arquitetura — Plataforma MCP Brasil

## Fluxo macro

```
Fontes Públicas
  ├── BCB SGS API          → indicadores_economicos
  ├── brapi.dev            → rv_ativos + rv_historico  (free tier — janela 90d)
  ├── COTAHIST (B3)        → rv_ativos_staging + rv_historico_staging (Fase 1, ver ADR-001)
  ├── ANBIMA Feed API      → anbima_indices, anbima_debentures_*, anbima_cri_*, anbima_cra_*
  ├── CVM (arquivos local) → fundos_cadastro + fundos_historico
  └── RSS (InfoMoney/MT/Valor) → noticias
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
  ├── GET  /anbima/{indices,debentures,cri,cra}[/sparklines]
  ├── GET  /noticias
  ├── GET  /health/etl
  ├── POST /copilot/pergunta
  ├── POST /carteira/posicoes
  ├── GET  /carteira/posicoes?session_id=
  ├── DELETE /carteira/posicoes/{id}?session_id=
  └── GET  /carteira/analise?session_id=
         ↓
Next.js — Frontend (Vercel)
  ├── /indicadores        — Macro (BCB)
  ├── /rv                 — Renda Variável (B3)
  ├── /rf                 — Renda Fixa (Tesouro Direto)
  ├── /renda-fixa         — Dashboard Contextual V3 (Debêntures/CRI/CRA, sparklines)
  ├── /fundos             — Fundos de Investimento (CVM)
  ├── /dashboard/v1       — Painel Unificado (Timeline multi-série)
  ├── /dashboard/v2       — Grid + Drawer (SparklineCards)
  ├── /dashboard/v3       — Multi-Panel Analítico (3 colunas)
  ├── /carteira           — Módulo Carteira (session_id anônimo, VibeTrading metrics)
  ├── /noticias           — Feed RSS agregado (auto-refresh 5min)
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

## Banco de dados — 25 tabelas

| Tabela | Tipo | Descrição |
|---|---|---|
| indicadores_economicos | time series | IPCA, SELIC, CDI, PIB |
| rv_ativos | relacional | Cadastro de ações B3 |
| rv_historico | time series | OHLCV diário |
| rv_ativos_staging | relacional | COTAHIST — cadastro (Fase 1, ver ADR-001) |
| rv_historico_staging | time series | COTAHIST — OHLCV diário (Fase 1, ver ADR-001) |
| cotahist_smoke_test | operacional | Resultado do smoke test por run (8 papéis de tipo conhecido) |
| fundos_cadastro | relacional | Cadastro CVM |
| fundos_historico | time series | Cotas diárias CVM |
| fund_analytics_metrics | analítica | Sharpe, Drawdown, Vol (pré-calculados) |
| etf_cadastro | relacional | — |
| bdr_cadastro | relacional | — |
| rf_titulos | relacional | Títulos Tesouro Direto |
| rf_historico | time series | Taxas e PU históricos |
| anbima_indices | time series | Índices IMA/IDA diários |
| anbima_debentures_cadastro | relacional | Cadastro de debêntures |
| anbima_debentures_historico | time series | Preços/taxas indicativos diários |
| anbima_cri_cadastro | relacional | Cadastro de CRI |
| anbima_cri_historico | time series | Preços/taxas indicativos diários |
| anbima_cra_cadastro | relacional | Cadastro de CRA |
| anbima_cra_historico | time series | Preços/taxas indicativos diários |
| noticias | relacional | Feed financeiro |
| etl_runs | operacional | Auditoria de jobs ETL (status, rows_upserted, error_detail) |
| copilot_cache | cache | Respostas Gemini por hash SHA256 |
| carteira_posicoes | relacional | Posições por session_id (anônimo) |
| carteira_snapshots | time series | Snapshots diários de valor e métricas de risco |

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

### brapi.dev (rv_historico.py)
- API oficial brasileira (substituiu yfinance em 2026)
- **Free tier limita ranges longos** — recusa `startDate > 90 dias atrás` com 400 Bad Request para a maioria dos FIIs/ações secundárias
- **Estratégia incremental obrigatória** (fix arquitetural 2026-06-16):
  - `ultima_data_no_banco(ticker)` antes da chamada
  - Já no banco: janela `min(90, diff_dias + 5)` — overlap de 5d para correções
  - Não está no banco: carga inicial limitada a 90 dias; próximos runs populam progressivamente
  - Constantes em `rv_historico.py`: `INCREMENTAL_DIAS=90`, `OVERLAP_DIAS=5`
- `safe_float()` obrigatório para filtrar NaN/Inf antes do upsert PostgreSQL
- Detecção de delisting: último pregão > 30 dias → `status = 'delisted'`
- 404 Not Found = ticker provavelmente renomeado/deslistado pela B3 (ex: BCFF11)
- **Decisão de negócio futura**: assinar plano Pro (R$ 116/mês anual) quando precisar de histórico > 90d para todos os tickers

### RSS Notícias (noticias.py)
- Fontes: InfoMoney, Money Times, Valor Investe (feeds RSS públicos)
- Parse XML via `xml.etree` (stdlib) — sem dependência extra como `feedparser`
- Categorização por keywords no título+resumo: Macro / Renda Variável / Renda Fixa / Fundos
- Extração de tickers via regex `\b([A-Z]{4}\d{1,2})\b`
- Upsert idempotente por `url` em `noticias`
- Cada fonte vira um `ETLRun` separado (`noticias_infomoney`, etc.) para granularidade no `etl_runs`

### CVM (fundos.py)
- **Problema:** Cloudflare WAF bloqueia todas as requisições HTTP automatizadas com 403
- **Solução:** download manual dos arquivos no navegador → `etl/data/cvm/`
- Script aceita `.csv` e `.zip` (descompacta automaticamente)
- **Mudança de schema CVM:** coluna `CNPJ_FUNDO` renomeada para `CNPJ_FUNDO_CLASSE` nos arquivos de 2024+. O script detecta e normaliza automaticamente.
- **Duplicatas:** cad_fi.csv e inf_diario_fi_*.csv podem ter linhas repetidas — `drop_duplicates()` antes de cada upsert
- `upsert_historico()` tem retry de 3 tentativas com backoff (1s, 2s)

### ANBIMA Feed API (anbima.py)
- OAuth2 Client Credentials — token via `POST /oauth/access-token`, **`Content-Type: application/x-www-form-urlencoded`** (não JSON — erro comum que gera 401 no token endpoint)
- Cobre 5 feeds: Índices IMA/IDA, Debêntures, CRI, CRA, VNA de títulos públicos
- Requer app aprovado no portal `developers.anbima.com.br` com acesso aos produtos de dados — 401 nos endpoints de dados (mesmo com token válido) indica falta de autorização do app, não bug de código
- Rotas de sparklines (`/anbima/{tipo}/sparklines`) devem ser declaradas **antes** das rotas parametrizadas (`/{codigo}`) — FastAPI casa rotas por ordem de declaração

### COTAHIST (B3) — `cotahist.py` / `cotahist_backfill.py`
- Ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md) para o contexto completo da decisão
- Um único download (`COTAHIST_D<ddmmaaaa>.ZIP`) cobre todo o universo de papéis do dia — ao contrário do brapi (ticker a ticker)
- **Fase 1 (concluída 2026-07-03):** ingestão só em staging (`rv_ativos_staging`/`rv_historico_staging`), nunca em produção
- Sem horário fixo de publicação da B3 — fallback D-1 obrigatório (não é detalhe de implementação)
- Backfill anual (`cotahist_backfill.py --anos N`) usa `COTAHIST_A<aaaa>.ZIP`; escopo inicial de 1 ano por limite de armazenamento do Supabase free tier

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

### Módulo Carteira
- `session_id` anônimo gerado no browser via `crypto.randomUUID()` + localStorage
- Posições suportadas: ação, fii, etf (MVP); fundo, rf, bdr em roadmap
- Preço atual: busca em `rv_historico` → sem dados → retorna `null`
- Métricas de risco: VibeTrading `BacktestEngine` (Sharpe, Sortino, Calmar, Max Drawdown, Win Rate) com fallback pandas
- Snapshot diário em `carteira_snapshots` gerado automaticamente no `GET /carteira/analise`
- Mínimo 22 pregões com histórico para calcular métricas (1 mês de dados)

### Renda Variável
- Dados de pregão B3 via brapi.dev
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
| ANBIMA Feed API | Free (registro) | developers.anbima.com.br — requer app aprovado por produto |
| **Render** | **Free** | **LibreChat — librechat-rlev.onrender.com** |
| **MongoDB Atlas** | **Free (512MB)** | **Banco do LibreChat — cluster0.ksxkolr.mongodb.net** |

### Decisão: LibreChat deploy em Render (2026-06-24)

- **Render free tier** escolhido: Koyeb exige $29/mês Pro, Railway usa crédito consumível, Fly.io tem apenas 256MB
- **MongoDB Atlas free (M0, Sao Paulo)** para persistência do LibreChat (conversas, usuários) — separado do Supabase que guarda dados financeiros
- **Imagem customizada:** `ghcr.io/luferjombra/librechat-mcp-brasil:latest` (librechat base + librechat.yaml embutido)
- **CI/CD:** `.github/workflows/deploy-librechat.yml` — build → GHCR → Render Deploy Hook (`curl -X POST $RENDER_DEPLOY_HOOK_URL`)

## Controle de custo

```
Cenário incorreto (MCP em tempo real):
  10k usuários × 3 chamadas × 3k tokens = ~90M tokens/dia

Cenário atual (ETL batch + cache + Gemini free tier):
  ETL periódico + cache SHA256 de respostas frequentes
  LLM: Gemini 2.5 Flash (gratuito) com fallback para gemini-2.0-flash-lite
  Redução: >90% no custo de tokens vs chamadas em tempo real
```
