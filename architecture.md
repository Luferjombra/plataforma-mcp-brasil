# Arquitetura — Plataforma MCP Brasil

## Fluxo macro

```
Fontes Públicas
  ├── BCB SGS API          → indicadores_economicos
  ├── brapi.dev            → rv_ativos + rv_historico  (free tier — janela 90d)
  ├── COTAHIST (B3)        → rv_ativos_staging + rv_historico_staging (paralelo) → promovido para rv_ativos/rv_historico (corte Fase 2, ver ADR-001)
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
  ├── POST /copilot/pergunta + /copilot/chat  (tool use nativo)
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

O `/copilot` usa **tool use nativo da Anthropic** (`client.beta.messages.tool_runner`): o LLM vê as tools disponíveis e decide sozinho qual chamar. Substituiu tanto o classificador por regex antigo (`context_builder.py`, frágil — qualquer pergunta fora dos padrões fixos retornava dados vazios) quanto o proxy intermediário pro LibreChat (aposentado — sem serviço externo, sem Mongo, sem OAuth).

As tools não são escritas à mão: são as mesmas rotas FastAPI já expostas via `fastapi-mcp`, reaproveitadas em sub-servidores MCP escopados por persona.

```
Usuário (pergunta)
    ↓
POST /copilot/pergunta  (contrato antigo do widget: {pergunta} → {resposta, fonte, cached})
POST /copilot/chat      (novo: {pergunta, agent, session_id} → {resposta, agent})
    ↓
backend/copilot/native_agent.py
  ├── conecta no sub-servidor MCP da persona (loopback, mesmo processo):
  │     /mcp/rv · /mcp/macro · /mcp/quant  (montados em backend/main.py)
  ├── async_mcp_tool converte as tools MCP em runnables do tool_runner
  ├── session_id da carteira: injetado por nós nas tools de carteira
  │     (removido do schema — o LLM não preenche nem forja o de outro usuário);
  │     sem session_id, as tools de carteira nem são oferecidas
  └── client.beta.messages.tool_runner (Claude decide e chama as tools)
    ↓
Frontend (Chat Finance UI) — contrato {resposta, fonte, cached} preservado no /pergunta
```

**Segurança:** as personas do chat nunca escrevem na carteira — a separação de
tags `Carteira Leitura`/`Carteira Escrita` mantém `add`/`importar`/`delete`
posição fora das tools de todos os sub-servidores do Copilot (verificado por
teste automatizado que lista as tools de fato expostas).

## Regras fundamentais de arquitetura

| Regra | Descrição |
|---|---|
| Fontes públicas apenas em ETL | Usuário nunca dispara chamada externa |
| Dados sempre persistidos | Frontend só consome APIs FastAPI internas |
| LLM não calcula | Cálculos feitos na camada analítica (Python/SQL) |
| LLM acessa dados só via tool explícito | Copilot usa as tools do `/mcp` (rotas FastAPI sobre o Supabase), nunca fetch direto do LLM |
| Atualização incremental | ETL faz upsert idempotente (on_conflict) com overlap de 5 dias |
| Custo previsível | Tool use nativo com prompt enxuto; ~$0,01/pergunta nova (Anthropic) |
| ETL resiliente | ETLRun context manager + log_partial em erro parcial |
| Formatação padronizada | Todos os valores monetários e taxas: 2 casas decimais |

## Banco de dados — 25 tabelas

| Tabela | Tipo | Descrição |
|---|---|---|
| indicadores_economicos | time series | IPCA, SELIC, CDI, PIB |
| rv_ativos | relacional | Cadastro de ações/FIIs B3 — brapi.dev + COTAHIST (pós-corte Fase 2, ver ADR-001) |
| rv_historico | time series | OHLCV diário — brapi.dev + COTAHIST (pós-corte Fase 2) |
| rv_ativos_staging | relacional | COTAHIST — cadastro (staging, operação paralela pós-corte, ver ADR-001) |
| rv_historico_staging | time series | COTAHIST — OHLCV diário (staging, operação paralela pós-corte, ver ADR-001) |
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
| copilot_cache | cache | Não usado mais pelo `/copilot` (proxy LibreChat) — mantido no schema, sem escrita ativa |
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
- Download automático a cada execução (`garantir_cadastro_local`/`garantir_historico_local`) — necessário porque o runner do GitHub Actions começa de um checkout limpo
- **Informe diário mudou de formato:** a partir de jul/2025 a CVM publica `inf_diario_fi_AAAAMM.zip` em vez de `.csv` (mesma URL base, descoberto via API CKAN do portal — `package_show` em `fi-doc-inf_diario` — depois que o `.csv` direto passou a dar 403). Script aceita `.csv` e `.zip` (descompacta automaticamente)
- **Mudança de schema CVM:** coluna `CNPJ_FUNDO` renomeada para `CNPJ_FUNDO_CLASSE` nos arquivos de 2024+. O script detecta e normaliza automaticamente.
- **Duplicatas:** cad_fi.csv e inf_diario_fi_* podem ter linhas repetidas — `drop_duplicates()` antes de cada upsert
- `upsert_historico()` tem retry de 3 tentativas com backoff (1s, 2s)
- **`CNPJS_ALVO` expandido de 8 pra 13 fundos** — os 5 novos foram sorteados via `sortear_fundos.py` pra cobrir categorias que a plataforma ainda não tinha (Cambial, Crédito Privado), além de reforçar Ações/Multimercado/Renda Fixa.
- **Cadastro pós-Resolução CVM 175:** `cad_fi.csv` (legado) está encolhendo e não cobre mais fundos novos/multi-classe. `carregar_cadastro_novo()` complementa lendo `registro_fundo_classe.zip` (`registro_classe.csv` + `registro_fundo.csv`, ~33 mil candidatos). Filtra por `CNPJ_Classe` (não `CNPJ_Fundo` — são colunas diferentes: um fundo multi-classe tem CNPJ "guarda-chuva" próprio e cada classe tem o seu). Carregamento é best-effort (try/except) — se falhar, o histórico segue confiando no cadastro já persistido de runs anteriores.
- **Gotcha de produção (FK constraint):** `fundos_historico_cnpj_fkey` exige que o `cnpj` já exista em `fundos_cadastro`. Como `upsert_historico()` agrupa todos os CNPJs de um mês num único upsert, 1 CNPJ sem cadastro resolvido derruba o batch inteiro (não só aquele CNPJ) — expandir `CNPJS_ALVO` sem garantir cadastro completo pra cada CNPJ novo já causou uma regressão real (200 registros salvos → 0). `run()` agora filtra `cnpjs_alvo` pelos CNPJs com cadastro resolvido nesta run antes de chamar o histórico, e reporta `ETLRun` como `"partial"` (não "success" silencioso) quando o `cad_fi.csv` falha totalmente.

### ANBIMA Feed API (anbima.py)
- OAuth2 Client Credentials — token via `POST /oauth/access-token`, **`Content-Type: application/x-www-form-urlencoded`** (não JSON — erro comum que gera 401 no token endpoint)
- Cobre 5 feeds: Índices IMA/IDA, Debêntures, CRI, CRA, VNA de títulos públicos
- Requer app aprovado no portal `developers.anbima.com.br` com acesso aos produtos de dados — 401 nos endpoints de dados (mesmo com token válido) indica falta de autorização do app, não bug de código
- Rotas de sparklines (`/anbima/{tipo}/sparklines`) devem ser declaradas **antes** das rotas parametrizadas (`/{codigo}`) — FastAPI casa rotas por ordem de declaração

### COTAHIST (B3) — `cotahist.py` / `cotahist_backfill.py`
- Ver [ADR-001](docs/adr/001-cotahist-migracao-rv.md) para o contexto completo da decisão
- Um único download (`COTAHIST_D<ddmmaaaa>.ZIP`) cobre todo o universo de papéis do dia — ao contrário do brapi (ticker a ticker)
- **Fase 1 (concluída 2026-07-03):** ingestão só em staging (`rv_ativos_staging`/`rv_historico_staging`), nunca em produção
- **Fase 2 — corte para produção (concluído 2026-07-08):** `etl/promover_cotahist.py` promoveu o universo de staging para `rv_ativos`/`rv_historico` (2.368 tickers, 349.452 linhas de histórico). Staging continua recebendo ingestão diária em paralelo (`etl.yml`) para validação cruzada contínua — ver ADR-001
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
- CNPJs alvos: preferência por feeders (o que o cotista acessa) — 13 CNPJs curados em `CNPJS_ALVO` (duplicado em `etl/fundos.py` e `backend/routes/fundos.py`, sem import cruzado entre deploys)
- CNPJs com `/` na URL: usar `encodeURIComponent()` — já implementado em `api.ts`
- Camada analítica implementada via `fund_analytics.py`: retornos (1m/3m/6m/12m/ytd), volatilidade_12m, sharpe_12m, max_drawdown, pct_cdi_12m — gravado em `fund_analytics_metrics`, exposto via `GET /fundos/analytics/{cnpj}`. (Não confundir com o módulo Carteira/VibeTrading, que tem Sortino/Calmar/Win Rate — são cálculos diferentes sobre dados diferentes.)
- `sortear_fundos.py` é ferramenta de curadoria manual (não roda em produção): sorteia candidatos do cadastro pós-RCVM175 fora de `CNPJS_ALVO`, por categoria (`CATEGORIAS_ALVO`), pra apoiar decisão de expansão

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
| Anthropic API | Pay-as-you-go (~$0,01/pergunta) | Tool use nativo do Copilot (`client.beta.messages.tool_runner`) |
| ANBIMA Feed API | Free (registro) | developers.anbima.com.br — requer app aprovado por produto |
| ~~Bright Data~~ | — | _Aposentado com o LibreChat — busca web do Copilot descontinuada (ver trade-off abaixo)_ |
| ~~Render (LibreChat)~~ | — | _Aposentado — Copilot migrou pra tool use nativo. Serviço a desligar (pendência #3)_ |
| ~~MongoDB Atlas~~ | — | _Aposentado com o LibreChat. Cluster a desligar (pendência #3)_ |

> **Trade-off da migração pra tool use nativo (2026-07-24):** o Copilot perdeu a
> **busca na web** que o LibreChat tinha via Bright Data — o agente nativo só
> acessa as tools internas do `/mcp` (dados do Supabase). Perguntas que exigem
> web (ex: notícia recente fora do RSS interno) não são mais cobertas. Pode ser
> readicionada via a **web search nativa da Anthropic** (`web_search` server
> tool, suportada pelo SDK) sem reintroduzir o LibreChat, se/quando fizer sentido.

### Decisão histórica: LibreChat deploy em Render (2026-06-24) — aposentado em 2026-07-24

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
