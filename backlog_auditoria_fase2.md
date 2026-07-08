# Backlog — Auditoria 2026-07 + Plano Fase 2 (COTAHIST → produção)

_Criado em 2026-07-07 a partir da auditoria completa (backend, ETL, frontend — achados de severidade alta verificados linha a linha no código-fonte). Complementa o [ADR-001](docs/adr/001-cotahist-migracao-rv.md)._

**Como ler:** cada proposta é independente, mas a ordem entre elas importa — Falhas antes de Redundância (não refatorar em cima de bug), Redundância antes de Performance (não otimizar código que vai ser consolidado), e tudo alimenta a Fase 2.

---

## Proposta 1 — Falhas 🔴 (~7h)

> Bugs confirmados. F1–F4 pioram com o tempo ou disparam por calendário — são os urgentes.

### Sprint de correção imediata (F1–F4, ~2h) ✅ CONCLUÍDO (2026-07-07)
- [x] **F1** `backend/routes/carteira.py:206-213` — `desc=False` → `desc=True` (reordenação já era feita via `sorted()` downstream). A análise agora usa os pregões mais recentes.
- [x] **F2** `backend/routes/anbima.py` — filtro `indexador` implementado em debêntures/CRI/CRA via `!inner` + `.eq(cadastro.indexador)`, aplicado só quando há filtro (comportamento padrão preservado).
- [x] **F3** `etl/anbima.py` — índices IDA roteados para `/indices-mais/idas`, IMA/IRF-M seguem em `/imas`.
- [x] **F4** `etl/rf_tesouro.py` — `date.replace(month=...)` → `date.today() - timedelta(days=30)`. Sanity-check confirmou: retrocede seguro em jan→dez e dias 29-31.

### Robustez (F5–F12, ~5h)
- [ ] **F5** Race conditions no frontend (`/rv`, `/fundos`) — resolvido pelo hook `useApi` da Proposta 2 (R1); não corrigir separado para não fazer o trabalho duas vezes.
- [ ] **F6** `limit: Union[int, str]` + `int()` sem try em ~7 rotas — trocar por `Query(default, ge=1, le=max)` e remover o clamp manual. `1h`
- [x] **F7** ✅ (2026-07-07) `etl/anbima.py` — adicionado `ETLRun.set_status()` + helper `_marcar_status_parcial`; os 3 loops agora marcam `error` (tudo falhou) ou `partial` (parte) em `etl_runs`. O 401 da ANBIMA passa a aparecer no `/status`.
- [ ] **F8** `backend/copilot/orchestrator.py` — incluir `contexto_extra` no hash do cache e gravar `expira_em` no insert (hoje o cache é eterno e pode responder com contexto errado). `1h`
- [ ] **F9** `backend/routes/search.py` — sanitizar `q` (remover `,.()*`) antes de interpolar no `.or_()` do PostgREST (filter-injection). `30min`
- [ ] **F10** Timezone — helper `hoje_brt()` (`ZoneInfo("America/Sao_Paulo")`) em `log_etl.py`, usar em `cotahist.py`, `rv_historico.py`, `validar_cotahist.py`. `45min`
- [x] **F11** ✅ (2026-07-08) `etl/eventos_corporativos.py` — agora pula tickers já cobertos (`success` em `etl_runs`) e para no primeiro 403 em vez de insistir no resto da lista. Cron diário adicionado (`0 19 * * 1-5`) para convergir sozinho sem disparo manual.
- [x] **F12** ✅ (2026-07-08) `etl/eventos_corporativos.py` — `_dedup_por_chave()` remove duplicatas pela chave de conflito antes de cada upsert. Confirmado em produção: ITUB4 estava derrubando o batch com "ON CONFLICT DO UPDATE command cannot affect row a second time".

**Critério de aceite:** QA 100% mantido + teste manual de `?limit=abc` (400, não 500) + `carteira/analise` retorna preços da última semana.

---

## Proposta 2 — Código redundante 🟡 (~13h)

> Consolidações que reduzem o custo de toda página/ETL futuro. Fazer depois das falhas, antes da performance.

### Frontend (~7h)
- [ ] **R1** Hook `useApi(fn, deps)` com `AbortController` embutido → aplicar nas ~9 páginas que repetem o trio loading/error/data. Resolve F5 de brinde. `3h`
- [ ] **R2** Um único `<Sparkline>` — hoje há 4 implementações (e `components/Sparkline.tsx` + `KPICard.tsx` estão órfãos, ninguém importa). Apagar os órfãos ou adotá-los. `2h`
- [ ] **R3** Consolidar formatadores em `lib/format.ts` (`fmtBRL`/`fmtPct`/`fmtDate` têm 3+ versões com semânticas diferentes) + extrair `juroRealFisher()` (3 cópias — já causou o bug dos 1359% uma vez). `2h`

### ETL (~4h)
- [ ] **R4** Utilitários compartilhados em `log_etl.py`: `safe_float` (3 versões), `ultima_data_no_banco` (2), headers/User-Agent (6), `baixar_zip()` (2 loops de download iguais em cotahist/backfill). `2h`
- [ ] **R5** `etl/anbima.py` — `etl_debentures` vira chamada de `_etl_credito_privado(tipo="debentures")`. `1h`
- [ ] **R6** `etl/rf_tesouro.py` — migrar do sistema `etl_log` próprio para `ETLRun`/`etl_runs` (único ETL fora do padrão; hoje é invisível no `/status`). `1h`

### CI (~2h)
- [ ] **R7** `etl.yml` — converter os 12 jobs quase idênticos em `strategy.matrix` (script, feed, secrets como parâmetros). Reduz ~150 linhas e elimina a classe de bug do espaço duplo no cron. `2h`

**Critério de aceite:** `next build` limpo, QA 100%, nenhuma página importando sparkline local.

---

## Proposta 3 — Performance ⚡ (~9h + itens condicionais)

- [x] **P1** ✅ (2026-07-07) `etl/rf_tesouro.py` incremental — consulta `MAX(data)` em `rf_historico` e filtra o DataFrame (últimos N dias + overlap de 10d) antes do upsert. Carga inicial (banco vazio) processa tudo. Deixa de re-upsertar o CSV inteiro desde 2020 todo dia.
- [x] **P2** ✅ (2026-07-07) `etl.yml` — jobs `etl-anbima-cri`/`etl-anbima-cra` agora disparam só no dispatch dedicado; no schedule e no `all`, o `etl-anbima` (feed `all`) já cobre CRI/CRA. Elimina a coleta em dobro (e tripla no `all`).
- [ ] **P3** `backend/routes/indicadores.py:24` — `/series` carrega a tabela inteira p/ extrair distintos em Python. Criar RPC `SELECT DISTINCT serie`. `1h`
- [ ] **P4** `etl/fundos.py` — pular arquivos CVM já ingeridos (comparar max data por arquivo antes de reprocessar). `1h`
- [ ] **P5** brapi batch — usar `/quote/T1,T2,...` onde o plano permitir + `sleep` condicional ao token (hoje 4s fixos ≈ 130s de espera por run). `2h`
- [ ] **P6** Virtualização das listas `/rv`, `/fundos`, `/renda-fixa` (`@tanstack/react-virtual`) — **pré-requisito dos 2.000 tickers**, mas já beneficia os "40k fundos". `4h`
- [ ] **P7** _(condicional — quando houver tráfego)_ Rotas async nos hot paths + cache TTL em memória p/ dados que mudam 1×/dia. `3h`

**Critério de aceite:** run diário do `rf_tesouro` < 1min; cron 17h UTC sem jobs duplicados; `/rv` fluido com 2.000 itens (medir com staging).

---

## Proposta 4 — Escalabilidade 🏗️

> Decisões e infraestrutura — algumas são suas (💰 = decisão de negócio), o resto é código.

- [ ] **E1** 💰 **Supabase Pro (~US$25/mês)** — com 347 mil linhas já no staging + universo completo, o free tier (500MB) não sustenta a Fase 2. É a única despesa recorrente realmente necessária do plano. _Decisão antes do corte da Fase 2._
- [ ] **E2** Paginação server-side em `/rv/ativos` (`?page=&per_page=&q=`) + busca no banco. O frontend passa a buscar via API, não filtrar array de 2.000 no browser. `3h`
- [ ] **E3** View/RPC "último preço por ticker" — substitui a heurística frágil `limit(n_tickers*5)` da carteira e serve a lista do `/rv`. `1h`
- [ ] **E4** Metadados setoriais para o universo novo — a planilha de classificação setorial da B3 (pública) cobre o que o brapi `fundamental` não alcança em 2.000 tickers. Pesquisar formato + ETL. `4h`
- [ ] **E5** QA amostral — validação estatística (% de preços em faixa válida, cobertura por tipo) em vez de tickers hardcoded. `2h`
- [ ] **E6** 💰 _(quando houver usuários)_ Render pago — elimina cold start. Só depois de P7.

**Regra de ouro consolidada na auditoria:** para *preço/volume*, escala vem do COTAHIST (1 download = universo inteiro, ~10s/dia). brapi fica para metadados e eventos corporativos, preenchidos em lotes dentro da cota (~13 tickers/dia comprovados para `dividends`). Nunca escalar preço via API ticker-a-ticker (2.000 tickers ≈ 4h30/dia).

---

## Plano — Fase 2 do ADR-001 (staging → produção)

> Sequência executável. Os passos 1–3 podem começar já; 4 é decisão sua; 5–8 dependem dos anteriores.

### Passo 1 — Pré-requisitos de correção (Proposta 1, F1–F4 + F7) — ~3h
Não promover fonte nova por cima de bugs conhecidos, especialmente F1 (carteira) que consome `rv_historico`.

### Passo 2 — Ajuste por proventos — ~3h
- [x] Script `etl/aplicar_ajuste_proventos.py`: lê `rv_eventos_societarios`, aplica `preco_ajustado = preco_bruto / fator` (cumulativo, para eventos com `data_com` >= data do pregão) e grava `fechamento_adj` em `rv_historico_staging` — ✅ CONCLUÍDO (2026-07-07). Migration `011_fechamento_adj_staging.sql` executada; job `ajuste_proventos` rodou: 1.000 candles ajustados (ITUB4/MGLU3/PETR4/VALE3, 250 cada).
- [x] Validar: rodar `validar_cotahist.py --usar-ajustado` comparando `fechamento_adj` (staging) × `fechamento` (brapi) — ✅ CONCLUÍDO (2026-07-07). **0 divergências em 4.785 datas comparadas** (era 244 em ITUB4/MGLU3 + 1 em VIVT3). Job `validar_cotahist_ajustado` no `etl.yml`.
- [ ] Completar `rv_eventos_societarios` para os tickers que faltaram (3/31 cobertos oficialmente em `etl_runs`, mais ITUB4/MGLU3 já com dados na tabela; cron diário `0 19 * * 1-5` — ver F11 — converge sozinho ao longo dos próximos dias por causa da cota da brapi)

### Passo 3 — Investigações pendentes — ~2h
- [ ] `ELET3`/`RBRF11`: por que zero overlap de datas entre fontes (delisting? rebatização? gap de coleta?)
- [ ] Critério definitivo para `ETF_OU_FUNDO` (BOVA11, IVVB11, SMAL11, XFIX11) — proposta: lista curada de ETFs conhecidos + default "FUNDO_LISTADO"
- [ ] Variação de volume diário no COTAHIST (1.412→1.396→1.257): confirmar que é liquidez, com 1 semana a mais de dados do staging

### Passo 4 — 💰 Decisões suas
- [ ] Escopo do universo: 2.000 tickers completos ou subconjunto líquido (sugestão: começar com todos os ON/PN/FII/BDR do COTAHIST — são ~1.400–2.200/dia — e filtrar depois por liquidez se precisar)
- [ ] Upgrade Supabase Pro (E1) — antes do corte

### Passo 5 — Mecanismo de corte — ~3h
- [ ] `etl/promover_cotahist.py`: copia staging → produção com `fonte='cotahist'`, preservando linhas brapi onde COTAHIST não cobre (precedência por `fonte`)
- [ ] Rodar em modo dry-run primeiro (relatório de o que mudaria, sem escrever)

### Passo 6 — Operação paralela (1–2 semanas)
- [ ] Simplificar `etl.yml`: 6 janelas de descoberta → 1 cron ~21h BRT + fallback manhã (mantendo fallback D-1 no script — não há horário fixo da B3, comprovado na Fase 1)
- [ ] `validar_cotahist.py` como job diário durante a janela de paralelo — qualquer divergência nova > 1% aparece no log
- [ ] Ao final: aposentar `rv_historico.py` para preços (mantém-se para metadados via `fundamental`, em cadência semanal)

### Passo 7 — API + Frontend para o universo novo — ~7h
- E2 (paginação server-side) + E3 (RPC último preço) + P6 (virtualização) — nesta ordem

### Passo 8 — QA e documentação — ~2h
- [ ] E5 (QA amostral) no `qa_run.py`
- [ ] Atualizar ADR-001 (status: Fase 2 concluída), README (tabela de dados), `architecture.md`

**Esforço total Fase 2: ~20h** (sem contar as Propostas 1–3, que somam ~29h e podem ser paralelizadas em parte).

### Sequência sugerida (3 sprints)

```
Sprint 1: Proposta 1 (falhas) + P1/P2 (perf críticos) + Passo 2 (ajuste proventos)   ~12h
Sprint 2: Proposta 2 (redundância) + Passo 3 (investigações) + decisões (Passo 4)    ~15h
Sprint 3: Passos 5–8 (corte + paralelo + API/frontend + QA)                          ~15h
```
