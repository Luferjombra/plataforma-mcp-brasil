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
uma auditoria completa cobrindo **funcionalidade**, **segurança**, **integridade de dados** e
**saúde do pipeline ETL**, entregando um relatório claro com severidade de cada achado.

## Contexto do projeto

Stack: **Next.js 15** (Vercel) + **FastAPI** (Render) + **Supabase** (PostgreSQL) + **GitHub Actions** (ETL cron)

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
GET  /health/etl                    → status dos jobs ETL (etl_runs table)
GET  /health/etl/{job}?limit={n}    → histórico de runs de um job específico
```

ETL Pipeline (GitHub Actions, roda dias úteis em UTC):
- `rv_historico_batch` — 21h UTC (18h BRT), dados B3 via brapi.dev
- `indicadores_{selic,ipca,cdi,pib}` — 22h UTC (19h BRT), dados BCB-SGS
- `fundos` — 23h UTC (20h BRT), dados CVM
- `rf_tesouro` — manual via workflow_dispatch

---

## Protocolo de execução

Execute as quatro seções em ordem. O script `qa_run.py` cobre as Seções 1, 2, 3 e 4 automaticamente:
```bash
python qa_run.py
```

Para cada achado, classifique:
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
- Anterior (known issue): `Access-Control-Allow-Origin: *` → 🟠 ALTO

### 2.2 Headers de segurança HTTP
Verifique presença de:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`

FastAPI não adiciona esses por padrão — implementados via `SecurityHeadersMiddleware` no `main.py`.

### 2.3 Rate limiting
- Enviar 50 requisições seguidas ao mesmo endpoint
- Verificar se alguma retorna 429
- Ausência de rate limiting → 🟡 MÉDIO (sem autenticação, risco limitado)
- **Próximo passo**: implementar `slowapi` em `/copilot/pergunta`

### 2.4 Injeção e validação de entrada
```bash
GET /rv/historico/../../../etc/passwd
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
- [ ] Taxa do Tesouro Selic: spread sobre SELIC deve estar entre 0.00% e 0.20% (LFT)
- [ ] Taxa do Tesouro IPCA+: deve estar entre 4% e 12% a.a. (spread)
- [ ] Taxa do Tesouro Prefixado: deve estar entre 10% e 18% a.a.
- [ ] Nenhuma taxa deve ser 0, negativa, ou > 100%
- [ ] `data_taxa` deve ser data recente (últimos 15 dias úteis / 22 dias corridos)
- [ ] Pelo menos 5 títulos retornados

### 3.3 Renda Variável
```
GET /rv/historico/PETR4?limit=5
```
- [ ] `fechamento` > R$5 e < R$200 (faixa histórica da PETR4)
- [ ] `data` do registro mais recente ≤ hoje e ≥ 30 dias atrás (atualizado)
- [ ] Fonte: brapi.dev (não yfinance)

### 3.4 Fundos

A plataforma monitora 13 fundos curados em `CNPJS_ALVO` (`etl/fundos.py` e
`backend/routes/fundos.py`), cobrindo 5 categorias: Multimercado, Renda Fixa,
Ações, Cambial e Crédito Privado. Testar pelo menos 1 CNPJ por categoria, não
só o primeiro da lista — cada categoria tem faixas de `valor_cota` bem
diferentes e um cadastro resolvido por fonte distinta (`cad_fi.csv` legado ou
`registro_fundo_classe.zip` pós-Resolução CVM 175).

```
GET /fundos/                                            # deve retornar 13 fundos (não mais, não menos)
GET /fundos/historico/04.222.368%2F0001-55?limit=5       # Verde PVT — Multimercado (cadastro legado)
GET /fundos/historico/00.822.954%2F0001-80?limit=5       # Itaú B Cambial — Cambial (cadastro novo/RCVM175)
GET /fundos/historico/60.760.008%2F0001-88?limit=5       # Bradesco BKFD — Crédito Privado (cadastro novo/RCVM175)
GET /fundos/analytics/04.222.368%2F0001-55                # retornos/volatilidade_12m/sharpe_12m/max_drawdown/pct_cdi_12m
```
- [ ] `GET /fundos/` retorna exatamente 13 registros (nem mais — vazamento de fundo não-curado — nem menos — CNPJ sem cadastro resolvido)
- [ ] `valor_cota` > 1 em todos os 3 CNPJs testados (faixa varia por fundo, mas nunca ≤ 1)
- [ ] `patrimonio_liq` > 0 em todos os 3
- [ ] Os 2 fundos resolvidos via `registro_fundo_classe.zip` (Itaú B Cambial, Bradesco BKFD) retornam histórico — valida que o fallback de cadastro pós-RCVM175 está funcionando, não só o legado
- [ ] `GET /fundos/analytics/{cnpj}` retorna 200 com `sharpe_12m`/`max_drawdown`/`pct_cdi_12m` não-nulos (404 é aceitável só se `fund_analytics_metrics` ainda não rodou para aquele CNPJ). **Não confundir** com o módulo Carteira/VibeTrading (Sortino/Calmar/Win Rate) — são cálculos e endpoints diferentes.

---

## Seção 4 — Monitoramento ETL ⚡ NOVO

Verifica a saúde do pipeline de dados. Se `/health/etl` retornar 404, a migration
`003_etl_runs.sql` ainda não foi aplicada no Supabase — 🟠 ALTO.

### 4.1 Endpoint de saúde
```
GET /health/etl
```
Resposta esperada:
```json
{
  "jobs": [
    {
      "job": "rv_historico_batch",
      "status": "ok",          // ok | stale | error | running | unknown
      "status_raw": "success",  // valor direto da tabela etl_runs
      "started_at": "...",
      "finished_at": "...",
      "duration_seconds": 312,
      "rows_upserted": 1250,
      "error_msg": null
    }
  ],
  "summary": { "total": 4, "ok": 4, "stale": 0, "error": 0, "unknown": 0 }
}
```

### 4.2 Checks de saúde ETL
- [ ] `GET /health/etl` retorna 200
- [ ] `summary.total` ≥ 1 (pelo menos um job rodou)
- [ ] Nenhum job em status `error` → 🟠 ALTO se encontrado
- [ ] ETLs recentes: nenhum job em status `stale` ou `unknown` → 🟡 MÉDIO
- [ ] `rv_historico_batch.rows_upserted` > 0 → indica dados de B3 ingeridos
- [ ] Verificar se `started_at` do RV é de data recente (dia útil anterior) → 🟡 MÉDIO se antigo

### 4.3 Diagnóstico de falhas
Se algum job estiver em `error`, buscar histórico para entender padrão:
```
GET /health/etl/rv_historico_batch?limit=10
```
- Falhas pontuais (1 em 10) → normal, retry com backoff está configurado
- Falhas consecutivas (3+ seguidas) → 🔴 CRÍTICO — investigar logs no GitHub Actions
- `error_msg` com "RetryExhausted" → API externa (brapi.dev ou BCB) instável

### 4.4 GitHub Actions (verificar manualmente se tiver acesso)
- [ ] Workflow `etl.yml` ativo no repositório
- [ ] Secrets configurados: `SUPABASE_URL`, `SUPABASE_KEY`, `BRAPI_TOKEN`
- [ ] Secret opcional: `DISCORD_WEBHOOK_URL` (para notificações de falha)
- [ ] Último run do workflow com status `success`

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

## Status ETL
| Job | Status | Última execução | Rows | Duração |
|---|---|---|---|---|
...

## Recomendações prioritárias
1. ...
2. ...
```

---

## Notas importantes

**Cold start do Render:** A primeira requisição após inatividade pode demorar 20–30s. Isso é
comportamento esperado no free tier — não é um bug. Anote nos resultados mas não classifique como achado.

**ETL e migration:** O endpoint `/health/etl` só funciona depois de executar `003_etl_runs.sql`
no Supabase SQL Editor e rodar pelo menos um ETL. Se retornar 404, a migration ainda não foi aplicada.

**Dados desatualizados:** Se `data_taxa` do RF tiver mais de 22 dias corridos, o ETL não está
rodando. Verifique os GitHub Actions e os secrets configurados.

**brapi.dev:** O ETL de RV usa brapi.dev (substituiu yfinance). Sem `BRAPI_TOKEN` o rate limit
é menor mas funciona. Registrar token gratuito em https://brapi.dev aumenta o limite.

**Dashboard de monitoramento:** Abrir `monitoring/etl-dashboard.html` no browser para ver o
status dos ETLs em tempo real com auto-refresh de 60s.
