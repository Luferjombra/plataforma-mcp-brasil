---
name: qa-financeiro
description: >
  Quality Assurance especializado para plataformas financeiras com stack Next.js + FastAPI + Supabase.
  Use este skill sempre que o usuário pedir para: testar o sistema, verificar vulnerabilidades,
  checar integridade dos dados, auditar segurança da API, validar endpoints, fazer QA antes de
  deploy, ou quando mencionar "testar", "vulnerabilidades", "QA", "quality assurance", "segurança
  da API", "checar dados", "auditoria" no contexto da plataforma financeira. Também dispare quando
  o usuário perguntar "o sistema está OK?", "tem algum problema?", ou antes de criar um PR ou release.
---

# QA — Plataforma Financeira

Você é um engenheiro de QA sênior especializado em plataformas financeiras. Seu trabalho é executar
uma auditoria completa cobrindo **funcionalidade**, **segurança** e **integridade de dados**, e
entregar um relatório claro com severidade de cada achado.

## Contexto do projeto

Stack: **Next.js 15** (Vercel) + **FastAPI** (Render) + **Supabase** (PostgreSQL)

URLs de produção (usar se não fornecidas outras):
- Frontend: `https://plataforma-mcp-brasil.vercel.app`
- Backend API: `https://plataforma-mcp-brasil-api.onrender.com`

Endpoints disponíveis:
```
GET  /                              → health check
GET  /indicadores?serie={s}&limit={n}
GET  /rv/ativos
GET  /rv/historico/{ticker}?limit={n}
GET  /fundos
GET  /fundos/historico/{cnpj}       → CNPJ URL-encoded
GET  /rf/titulos
GET  /rf/historico/{codigo}?limit={n}
POST /copilot/pergunta              → { "pergunta": "..." }
```

---

## Protocolo de execução

Execute as três seções em ordem. Para cada achado, classifique:
- 🔴 **CRÍTICO** — quebra funcionalidade ou expõe dados sensíveis
- 🟠 **ALTO** — degradação significativa ou risco de segurança real
- 🟡 **MÉDIO** — comportamento incorreto ou risco potencial
- 🟢 **BAIXO/INFO** — sugestão de melhoria ou hardening

---

## Seção 1 — QA Funcional

Teste cada endpoint com `httpx` ou `curl`. Verifique:

### 1.1 Health e conectividade
- [ ] `GET /` retorna `{"status": "ok"}`
- [ ] Tempo de resposta < 3s (cold start do Render pode ser até 30s — anote se ocorrer)

### 1.2 Endpoints de dados
Para cada endpoint abaixo, verifique:
- Status HTTP 200
- Resposta JSON com campo `data` (array)
- Array não vazio (dados existem no banco)
- Sem campos `null` inesperados em campos obrigatórios

```
GET /indicadores?serie=selic&limit=5
GET /indicadores?serie=ipca&limit=5
GET /rv/ativos
GET /rv/historico/PETR4?limit=5
GET /fundos
GET /rf/titulos
```

### 1.3 Casos de borda
- [ ] `GET /rv/historico/TICKER_INEXISTENTE` → deve retornar 200 com `data: []` (não 500)
- [ ] `GET /indicadores?serie=serie_invalida` → deve retornar 200 com `data: []` (não 500)
- [ ] `GET /rf/historico/CODIGO_INVALIDO` → deve retornar 200 com `data: []` (não 500)
- [ ] `GET /fundos/historico/cnpj_sem_encode` → deve retornar 200 ou 404 (não 500)
- [ ] `limit=99999` em qualquer endpoint → deve respeitar o máximo configurado (não explodir)

### 1.4 POST Copilot
```json
POST /copilot/pergunta
{"pergunta": "Qual a taxa SELIC atual?"}
```
- [ ] Status 200
- [ ] Campo `resposta` presente e não vazio
- [ ] Campo `cached` booleano presente

---

## Seção 2 — Auditoria de Segurança

Leia `references/seguranca.md` para a metodologia detalhada. Resumo dos checks:

### 2.1 CORS
```bash
curl -H "Origin: https://evil.com" https://<api>/rv/ativos -v 2>&1 | grep -i "access-control"
```
- Esperado em prod: `Access-Control-Allow-Origin: https://plataforma-mcp-brasil.vercel.app`
- Atual (known issue): `Access-Control-Allow-Origin: *` → 🟠 ALTO

### 2.2 Headers de segurança HTTP
Verifique presença de:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`

FastAPI não adiciona esses por padrão → normalmente ausentes → 🟡 MÉDIO

### 2.3 Rate limiting
- Enviar 50 requisições seguidas ao mesmo endpoint
- Verificar se alguma retorna 429
- Ausência de rate limiting → 🟡 MÉDIO (sem autenticação, risco limitado)

### 2.4 Injeção e validação de entrada
```bash
# Teste de path traversal
GET /rv/historico/../../../etc/passwd
GET /rf/historico/../../config

# Query param injection
GET /indicadores?serie=selic'--&limit=1
GET /indicadores?serie=<script>alert(1)</script>
```
- FastAPI + Supabase com parâmetros tipados → geralmente seguro
- Verificar se a resposta é 422 (validação) ou 200 (com dado vazio)

### 2.5 Exposição de informações sensíveis
- [ ] Response headers não expõem versão de servidor (`Server: uvicorn` → remover)
- [ ] Erros 500 não retornam stack traces Python ao cliente
- [ ] `GET /openapi.json` — documenta endpoints (OK para API pública; avaliar se desejável)
- [ ] `GET /docs` — Swagger UI acessível publicamente (OK para MVP; avaliar em produção)

### 2.6 Variáveis de ambiente no frontend
```bash
curl https://plataforma-mcp-brasil.vercel.app/_next/static/chunks/*.js | grep -i "SUPABASE\|anthropic\|secret\|key"
```
- Verificar se chaves privadas foram bundladas no JS do cliente
- `NEXT_PUBLIC_API_URL` é esperado (público por design)
- `SUPABASE_SERVICE_KEY` ou `ANTHROPIC_API_KEY` não devem aparecer nunca → 🔴 CRÍTICO se encontrado

---

## Seção 3 — Integridade dos Dados

### 3.1 Indicadores econômicos
Buscar últimos valores e validar contra referências conhecidas:

| Indicador | Valor esperado (jun/2026) | Fora do range → severidade |
|---|---|---|
| SELIC | 13–16% a.a. | 🔴 CRÍTICO |
| CDI diário | 0.04–0.07% | 🟠 ALTO |
| IPCA mensal | -0.5% a 2% | 🟠 ALTO |

### 3.2 Renda Fixa — Tesouro Direto
Buscar `GET /rf/titulos` e validar:
- [ ] Taxa do Tesouro Selic: deve estar próxima da SELIC meta (±0.5 p.p.)
- [ ] Taxa do Tesouro IPCA+: deve estar entre 5% e 12% a.a.
- [ ] Taxa do Tesouro Prefixado: deve estar entre 10% e 18% a.a.
- [ ] Nenhuma taxa deve ser 0, negativa, ou > 100%
- [ ] `data_taxa` deve ser data recente (últimos 10 dias úteis)
- [ ] Pelo menos 5 títulos retornados

### 3.3 Renda Variável
```
GET /rv/historico/PETR4?limit=5
```
- [ ] `fechamento` > 0 e < 500 (PETR4 opera nessa faixa)
- [ ] `data` do registro mais recente ≤ hoje e ≥ 30 dias atrás (atualizado)

### 3.4 Fundos
```
GET /fundos/historico/04.222.368%2F0001-55?limit=5
```
- [ ] `valor_cota` > 1 (cota do Verde PVT deve ser na casa de R$ 10–1000)
- [ ] `patrimonio_liq` > 0

---

## Formato do relatório

Após executar todas as seções, entregue um relatório com esta estrutura:

```
# Relatório de QA — Plataforma MCP Brasil
Data: YYYY-MM-DD  |  Ambiente: Produção / Local

## Resumo executivo
<2-3 frases com o estado geral>

## Achados

### 🔴 Críticos (N)
...

### 🟠 Altos (N)
...

### 🟡 Médios (N)
...

### 🟢 Baixos / Info (N)
...

## Checklist de funcionalidade
| Endpoint | Status | Obs |
|---|---|---|
...

## Recomendações prioritárias
1. ...
2. ...
```

---

## Cenários ETL e Dashboard

### CENÁRIO ETL-01 — Verificação de incrementalidade pós-execução de `indicadores.py`

Após rodar `python etl/indicadores.py`, verificar que o ETL funcionou de forma **incremental** (não rebaixou tudo desde 2020):

```sql
-- No Supabase SQL Editor:
SELECT serie, MAX(data) as ultima_data, COUNT(*) as total
FROM indicadores_economicos
GROUP BY serie;
```

Checks esperados:
- [ ] `MAX(data)` de cada série é uma data recente (≤ 7 dias para selic/cdi, ≤ 45 dias para ipca/pib)
- [ ] Consultar `etl_runs WHERE job LIKE 'indicadores_%'` — deve ter uma linha por série com `status IN ('success', 'partial')`
- [ ] `rows_upserted < 500` por série — se > 500, provavelmente rodou desde 2020 (incrementalidade quebrada)
- [ ] `rows_upserted > 0` — se 0, verificar se BCB retornou dados (pode ser feriado prolongado)

Diagnóstico de regressão:
- `rows_upserted > 500` → função `ultima_data_no_banco()` não está sendo chamada
- `rows_upserted = 0` + `status = error` → BCB retornou lista vazia ou erro de validação JSON

### CENÁRIO ETL-02 — Verificação de log correto pós-execução de `fundos.py`

Após rodar `python etl/fundos.py`, verificar que o log foi gravado em `etl_runs` (não em `etl_log`, que não existe):

```sql
-- No Supabase SQL Editor:
SELECT job, status, rows_upserted, started_at, finished_at, error_detail
FROM etl_runs
WHERE job = 'fundos_historico'
ORDER BY started_at DESC
LIMIT 5;
```

Checks esperados:
- [ ] Linha com `job = 'fundos_historico'` existe
- [ ] `status IN ('success', 'partial')` — nunca `error`
- [ ] `rows_upserted > 0`
- [ ] `finished_at IS NOT NULL` — ETLRun fechou corretamente
- [ ] Se houve arquivos com erro parcial: `status = 'partial'` e `error_detail` descreve quais arquivos falharam

Diagnóstico de regressão:
- Nenhuma linha em `etl_runs` → `ETLRun` não está sendo chamado (código antigo ainda usando `etl_log`)
- `status = error` com `rows_upserted = 0` → erro antes de qualquer upsert (verificar arquivo CVM)

### CENÁRIO DASHBOARD-01 — Smoke test `/dashboard/v3` (Multi-Panel Analítico)

Abrir `http://localhost:3000/dashboard/v3` (ou prod) e verificar:

**Estrutura:**
- [ ] 4 tabs visíveis: RV, RF, Indicadores, Fundos
- [ ] Sidebar seletora à esquerda (220px) com lista de ativos filtráveis
- [ ] Gráfico de área no centro com dados carregados
- [ ] Painel de métricas à direita (último valor, máx, mín, média, var%)

**Interações:**
- [ ] Clicar em diferente ativo na sidebar → gráfico atualiza com nova série
- [ ] Clicar nos botões de período (1m, 3m, 6m, 1a, 2a, MAX) → gráfico filtra sem nova chamada de rede
- [ ] Trocar de tab (RV → RF → Indicadores → Fundos) → gráfico e seletor atualizam corretamente
- [ ] Filtro de busca na sidebar → lista filtra por texto

**Dados:**
- [ ] Nenhum `NaN`, `undefined` ou `null` visível nos valores
- [ ] Datas no eixo X legíveis
- [ ] Métricas coerentes (máx ≥ último ≥ mín, média dentro do range)

### CENÁRIO FORMAT-01 — Verificação de 2 casas decimais em toda a UI

Após qualquer alteração nos formatadores () ou nas páginas do dashboard, verificar:

**Indicadores e RF (taxas percentuais):**
- [ ] SELIC exibe  — não 
- [ ] IPCA exibe  — não 
- [ ] Taxa RF exibe  — não 

**Fundos (valor de cota):**
- [ ] Cota exibe  — não 
- [ ]  em  usa o formatter BRL padrão (sem )

**Variações percentuais:**
- [ ] Variação diária exibe  — não 

**Como testar:**


**Regressão a evitar:**  em  — remover se reaparecer.

### CENÁRIO DASHBOARD-02 — Navegação entre versões

Verificar que as 3 versões são navegáveis sem problemas:

- [ ] `GET /dashboard` → redireciona para `/dashboard/v1` (sem flash de conteúdo)
- [ ] `DashboardVersionNav` presente nas 3 versões (injetado pelo layout)
- [ ] Botão da versão atual fica destacado (bg-primary) nas 3 versões
- [ ] Navegar V1 → V2 → V3 → V1 sem erros no console do browser
- [ ] Item "Dashboard" na Sidebar fica ativo em todas as sub-rotas (`/dashboard/v1`, `/v2`, `/v3`)
- [ ] V2: Drawer abre ao clicar em qualquer SparklineCard, fecha ao clicar fora ou no `×`
- [ ] V1: Seletores de ativo (RV, RF, Indicador, Fundo) funcionam — gráfico atualiza ao trocar

### CENÁRIO NOTICIAS-01 — Feed RSS de notícias

Após rodar `python etl/noticias.py`, validar:

**ETL:**
- [ ] Cada fonte gera uma linha em `etl_runs`: `noticias_infomoney`, `noticias_money_times`, `noticias_valor_investe`
- [ ] `status IN ('success','partial')` para cada fonte
- [ ] `rows_upserted > 0` em pelo menos 2 das 3 fontes
- [ ] `GET /noticias?limit=10` retorna 200 com `data` não-vazio
- [ ] Toda notícia tem `url` único, `titulo` não-nulo, `publicado_em` não-nulo
- [ ] `categoria` é uma de: Macro / Renda Variável / Renda Fixa / Fundos

**Frontend `/noticias`:**
- [ ] Header "Notícias do Mercado" + botão "Atualizar"
- [ ] 5 filtros visíveis: Todos | Macro | Renda Variável | Renda Fixa | Fundos com contagem `(N)`
- [ ] Cards mostram: badge de categoria + fonte + tempo relativo (`há Nmin/h/d`)
- [ ] Cards com tickers (PETR4, VALE3) renderizam badges roxos
- [ ] Click em card abre URL externa em nova aba (`target="_blank" rel="noopener"`)
- [ ] Auto-refresh a cada 5min (verificar `setInterval` no `useEffect`)
- [ ] Sidebar: item "Notícias" com tag `RSS` aparece e fica ativo em `/noticias`

**Regressão a evitar:** `feedparser` não deve aparecer em `requirements.txt` — usar `xml.etree` (stdlib).

### CENÁRIO BRAPI-01 — Carga incremental no free tier

Após rodar `python etl/rv_historico.py`, validar:

**Logs por ticker:**
- [ ] Tickers já no banco: log `[incremental] última data YYYY-MM-DD — janela {N}d` com N ≤ 90
- [ ] Tickers novos: log `[carga inicial] sem histórico no banco — janela 90d`
- [ ] **Nenhum log** com `5 anos` ou `startDate=2021-` (regressão crítica do free tier)

**Resultado esperado:**
- [ ] `errors / total < 10%` (1 erro aceitável: BCFF11 deslistado)
- [ ] `rv_historico_batch` em `etl_runs` com `status='partial'` (1 erro) ou `success` (0 erros)
- [ ] Pregão mais recente em `rv_historico` ≤ 3 dias úteis atrás

**Constantes em `etl/rv_historico.py`:**
- [ ] `INCREMENTAL_DIAS = 90` (não aumentar sem ter brapi Pro)
- [ ] `OVERLAP_DIAS = 5`

**Regressão a evitar:**
- [ ] Não trocar `INCREMENTAL_DIAS` por valor > 90 sem plano pago
- [ ] Não remover `ultima_data_no_banco()` — quebra o incremental
- [ ] Volume de chamadas brapi/mês deve ficar < 5.000 (free tier suporta)

---

## Notas importantes

**Cold start do Render:** A primeira requisição após inatividade pode demorar 20–30s. Isso é comportamento esperado no free tier — não é um bug. Anote nos resultados mas não classifique como achado.

**Dados desatualizados:** Se `data_taxa` do RF tiver mais de 10 dias úteis, o ETL pode não estar rodando. Classifique como 🟡 MÉDIO e mencione que o ETL precisa ser agendado (GitHub Actions ou scheduler).

**CORS `*`:** Known issue documentado. Classificar como 🟠 ALTO com a solução recomendada (`allow_origins=["https://plataforma-mcp-brasil.vercel.app"]`).
