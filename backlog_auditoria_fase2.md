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
- [ ] **F5** Race conditions no frontend (`/rv`, `/fundos`) — ⚠️ REVISADO (2026-07-08): a premissa original ("resolvido pelo `useApi` do R1") não se confirmou — `/rv` não encaixa num hook genérico (debounce + paginação + `requestIdRef` próprio, já testado e aprovado 2x nesta sessão) e `/fundos` não demonstrou ter uma race condition observável hoje (fetch disparado por navegação/clique, não por digitação rápida). `/rv` já tem sua própria solução (`requestIdRef`, ver E2) — na prática, **F5 já está coberto para `/rv`**; só falta investigar se `/fundos` realmente precisa de alguma proteção (não confirmado). Não bloqueante.
- [x] **F6** ✅ (2026-07-08) `limit: Union[int, str]` + `int()` sem try em 14 rotas (`anbima.py` ×8, `fundos.py` ×2, `indicadores.py`, `rf.py`, `rv.py`, `search.py`) — trocado por `Query(default, ge=1, le=max)`, removido o clamp manual e o import `Union` órfão. Testado via FastAPI `TestClient` com um Supabase falso: `limit` fora do range e não-numérico agora dão 422 (antes: clamp silencioso ou, no caso de string não-numérica, um 500 não tratado).
- [x] **F7** ✅ (2026-07-07) `etl/anbima.py` — adicionado `ETLRun.set_status()` + helper `_marcar_status_parcial`; os 3 loops agora marcam `error` (tudo falhou) ou `partial` (parte) em `etl_runs`. O 401 da ANBIMA passa a aparecer no `/status`.
- [x] **F8** ✅ (2026-07-08) `backend/copilot/orchestrator.py` — incluído `contexto_extra` no hash do cache (sem isso, a mesma pergunta textual com contextos diferentes colidia na mesma chave). **Achado ao investigar:** a premissa de "`expira_em` nunca é gravado" era falsa — `database/schema.sql` já define `expira_em TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'` desde o primeiro commit da tabela (confirmado via `git log -p`), então o Postgres já aplica a expiração de 24h automaticamente mesmo com o insert do Python omitindo a coluna. Não adicionado código redundante para isso.
- [x] **F9** ✅ (2026-07-08) `backend/routes/search.py` — `sanitizar_busca()` (novo `backend/postgrest_utils.py`) remove `,.()*` antes de interpolar `q` no `.or_()`. Reaproveitado também na busca nova de `/rv/ativos` (E2).
- [x] **F10** ✅ (2026-07-08) Timezone — `hoje_brt()` (`ZoneInfo("America/Sao_Paulo")`) adicionado em `log_etl.py`, usado em `cotahist.py` (qual pregão buscar), `rv_historico.py` (janela incremental + status delisted) e `validar_cotahist.py` (janela de comparação). Sem isso, um job às 21h10 BRT (00h10 UTC do dia seguinte) via `date.today()` puro pegava o dia civil errado — confirmado com um teste isolado simulando esse horário exato.
- [x] **F11** ✅ (2026-07-08) `etl/eventos_corporativos.py` — agora pula tickers já cobertos (`success` em `etl_runs`) e para no primeiro 403 em vez de insistir no resto da lista. Cron diário adicionado (`0 19 * * 1-5`) para convergir sozinho sem disparo manual.
- [x] **F12** ✅ (2026-07-08) `etl/eventos_corporativos.py` — `_dedup_por_chave()` remove duplicatas pela chave de conflito antes de cada upsert. Confirmado em produção: ITUB4 estava derrubando o batch com "ON CONFLICT DO UPDATE command cannot affect row a second time".
- [x] **F13** ✅ (2026-07-08, hotfix urgente pós-corte) `backend/routes/rv.py` — `GET /rv/ativos` fazia `.select("*")` sem paginação; com `rv_ativos` em 2.368 tickers (Passo 5 da Fase 2), o limite padrão de 1000 do PostgREST truncava a lista silenciosamente. Corrigido com `_buscar_paginado()` + `.order("ticker")` (branch `fix/rv-ativos-paginacao`, revisado 2x por pair-programming, mergeado em `main`). Migration `013_rv_variacao_diaria_order.sql` adiciona `ORDER BY` na RPC `rv_variacao_diaria`.
- [x] **F14** ✅ (2026-07-08) `backend/routes/rv.py:/historico/{ticker}` — mesma classe de bug do F13. `_buscar_historico()` agora pagina em blocos de 1000 via `.range()` quando `limit` (até 2000) excede o teto padrão do PostgREST. Testado via `TestClient` com um ticker sintético de 1.500 candles: antes retornaria 1000, agora retorna os 1.500 pedidos.

**Critério de aceite:** QA 100% mantido + teste manual de `?limit=abc` (400, não 500) + `carteira/analise` retorna preços da última semana.

---

## Proposta 2 — Código redundante 🟡 (~13h)

> Consolidações que reduzem o custo de toda página/ETL futuro. Fazer depois das falhas, antes da performance.

### Frontend (~7h)
- [x] **R1** ✅ (2026-07-08) `lib/useApi.ts` criado (loading/error/data + guard contra resposta obsoleta via flag `cancelado`, `reload()`) — ⚠️ REVISADO DE ESCOPO: das 8 páginas candidatas (não 9), um agente de exploração mapeou o fetch de cada uma antes de mexer, e só 2 (`indicadores`, `renda-fixa`) são um encaixe limpo (1 fetch/Promise.all, 1 loading state, sem debounce/race-guard próprio). As outras 6 têm padrões que um hook genérico não cobre bem sem virar complexo: `carteira` (2 fetchers cross-invalidando), `fundos` (2 loading states + auto-seleção via URL), `noticias` (loading vs refreshing + polling por `setInterval`), `rf` (2º fetch sequencialmente dependente do 1º), `rv` (debounce + `requestIdRef` + paginação — já revisado e aprovado 2x nesta sessão, mexer de novo é risco desnecessário), `status` (fetch acoplado a um countdown de 1s). Aplicado só em `indicadores/page.tsx` e `renda-fixa/page.tsx`. **F5 (race conditions em /rv, /fundos) continua ABERTO** — não é resolvido por este R1 mais restrito; `/rv` já tem sua própria solução testada (`requestIdRef`, ver E2), `/fundos` não demonstrou de fato ter uma race condition observável no fetch atual (fetches disparados por navegação/clique, não por digitação rápida). Revisão de pair-programming encontrou 1 achado real: o hook usava `useRef` pro padrão "latest ref" (`fetcherRef.current = fetcher` mutando durante o render), que a própria regra `react-hooks/refs` do projeto marca como erro — corrigido trocando por `useEffectEvent` (já estável no React 19.2.4/Next 16.2.7 deste projeto), a API desenhada exatamente pra esse padrão. Testado com `tsc`, `eslint` (limpo), build, e screenshots das 2 páginas com dados mockados antes e depois do fix.
- [x] **R2** ✅ (2026-07-08) `components/Sparkline.tsx` adotado como implementação única — ganhou props (`fillColor`, `showDot`, `strokeWidth`, `dotRadius`, `padding`) pra cobrir as 3 variações visuais reais que existiam (`app/page.tsx`: preenchimento sólido "soft" por direção; `app/indicadores/page.tsx`: sem preenchimento, menor; `app/renda-fixa/page.tsx::MiniLine`: sem preenchimento nem ponto). `components/KPICard.tsx` apagado — confirmado órfão (nenhum import em todo o projeto). Verificado com teste de equivalência exata (props geram os mesmos atributos SVG que o código original) e screenshots das 3 páginas com dados mockados — sem regressão visual.
- [x] **R3** ✅ (2026-07-08) `juroRealFisher()` consolidado em `lib/format.ts` — as "3 cópias" eram genuinamente idênticas (`app/page.tsx`, `app/copilot/page.tsx`, `app/noticias/page.tsx`), risco real de fix aplicado em só 1 lugar. `fmtDate` tinha 2 versões só na aparência — na real são semânticas diferentes (timestamp completo com fuso vs. data pura sem horário, evitando bug de fuso do `new Date("YYYY-MM-DD")`) — movidas para `lib/format.ts` como `formatDataHoraBRT`/`formatDataBR` distintas, não forçadas numa função só. `lib/carteira.ts::fmtBRL`/`fmtPct` viraram re-exports de `formatBRL`/`formatPctSinal` (nova, em `lib/format.ts`) em vez de reimplementar; o `fmtPct` inline de `app/noticias/page.tsx` também migrou pra `formatPctSinal` (harmonização documentada: `v>=0` em vez de `v>0`, muda só o sinal de "+" em variação exatamente zero). Testado com equivalência numérica exata contra as versões antigas + screenshots.

### ETL (~4h)
- [x] **R4** ✅ (2026-07-08) Utilitários compartilhados em `log_etl.py`: `safe_float(value, *, replace_comma=, zero_as_none=, round_digits=)` unifica as 3 versões (`rf_tesouro.py`, `rv_historico.py`, `fundos.py::safe_numeric`) preservando o comportamento exato de cada uma via parâmetros (elas tinham semânticas diferentes — arredondamento, 0 como inválido, vírgula decimal — não eram duplicatas literais); `ultima_data(tabela, coluna_filtro, valor_filtro)` unifica a consulta repetida em `indicadores.py`/`rv_historico.py` (cada um mantém seu próprio fallback/formato por cima); `baixar_arquivo_b3()` unifica o loop de retry+404 de `cotahist.py`/`cotahist_backfill.py`; `DEFAULT_USER_AGENT` unifica os 2 User-Agents idênticos (`indicadores.py`/`rv_historico.py` — os outros 3 UAs no projeto são propositalmente diferentes, de navegador, pra evitar bloqueio de bot). Testado com equivalência exata (dict-a-dict e simulação de retry/404/5xx) contra o comportamento original.
- [x] **R5** ✅ (2026-07-08) `etl/anbima.py` — `etl_debentures` agora é `_etl_credito_privado(client, token, "debentures", data_ref)`. Cadastro tem esquema diferente por tipo (debêntures: emissor único + setor; CRI/CRA: cedente/securitizadora + série) — extraído pra `_montar_cadastro_credito(tipo, codigo, item)`, testado com equivalência exata contra os dicts originais. Histórico já era idêntico nos 3 tipos.
- [x] **R6** ✅ (2026-07-08) `etl/rf_tesouro.py` — migrado do `registrar_log()`/`etl_log` próprio para `with ETLRun("rf_tesouro") as run_ctx`, usando `run_ctx.set_status("error", ...)` nos 3 pontos de falha (download, parse, coluna faltando) e `run_ctx.set_rows(...)` no sucesso — mesmo padrão de todos os outros ETLs, agora visível em `/health/etl`. A tabela `etl_log` fica sem uso (não removida — era a única consumidora, decisão de dropar a tabela fica pra depois).

### CI (~2h)
- [x] **R7** ✅ (2026-07-08) `etl.yml` — os 16 jobs (não 12) quase idênticos viraram 1 job com `strategy.matrix.include` (16 itens: `id`, `label`, `script`, `args`, `crons`, `in_all`, `timeout` opcional). `if:` único usando `contains(matrix.crons, github.event.schedule)` em vez de 16 blocos `if:` escritos à mão. `env:` simplificado pra passar todos os secrets possíveis (BRAPI_TOKEN, ANBIMA_CLIENT_ID/SECRET) pra todo job da matrix — inofensivo pros scripts que não usam (já tratam token/credencial ausente como opcional). Reduz 195 linhas (mais que os ~150 estimados). **Nota honesta:** a duplicação cron `on.schedule` × condição de disparo por job não desaparece de verdade (limitação do GitHub Actions — o schedule tem que ser literal em `on.schedule`, e cada matrix item precisa listar os mesmos crons em `crons:` pra casar via `contains()`); o que melhora é a estrutura (lista de campos por item, não uma string `if:` escrita à mão por job) reduzir o risco do bug de espaço duplo no cron, não eliminá-lo. Verificado com uma simulação Python comparando, pra cada um dos 16 `workflow_dispatch` values e cada uma das 11 crons originais, se o conjunto de jobs disparados bate exatamente entre a lógica antiga (transcrita à mão dos 16 `if:` originais) e a nova matrix — 0 divergências. Comandos (`script`+`args`) e superset de env vars também verificados programaticamente. **Não testado contra uma execução real do GitHub Actions** (sem acesso para disparar workflows neste ambiente) — recomendado rodar `workflow_dispatch` manualmente pra 2-3 jobs (ex: `indicadores`, `anbima_cri`) depois do merge pra confirmar na prática. **Achado do pair-review (corrigido antes do commit):** o fallback inicial `timeout-minutes: ${{ matrix.timeout || 15 }}` teria introduzido silenciosamente um timeout de 15min pros 15 jobs que nunca tiveram `timeout-minutes` (default do GH Actions é 360min) — risco real pra `promover_cotahist` (escreve em produção) e `rv_historico` (retries da brapi podem acumular). Corrigido pra `|| 360`, preservando o comportamento original; só `cotahist_backfill` mantém seu `timeout: 30` explícito, igual antes.

**Critério de aceite:** `next build` limpo, QA 100%, nenhuma página importando sparkline local.

---

## Proposta 3 — Performance ⚡ (~9h + itens condicionais)

- [x] **P1** ✅ (2026-07-07) `etl/rf_tesouro.py` incremental — consulta `MAX(data)` em `rf_historico` e filtra o DataFrame (últimos N dias + overlap de 10d) antes do upsert. Carga inicial (banco vazio) processa tudo. Deixa de re-upsertar o CSV inteiro desde 2020 todo dia.
- [x] **P2** ✅ (2026-07-07) `etl.yml` — jobs `etl-anbima-cri`/`etl-anbima-cra` agora disparam só no dispatch dedicado; no schedule e no `all`, o `etl-anbima` (feed `all`) já cobre CRI/CRA. Elimina a coleta em dobro (e tripla no `all`).
- [ ] **P3** `backend/routes/indicadores.py:24` — `/series` carrega a tabela inteira p/ extrair distintos em Python. Criar RPC `SELECT DISTINCT serie`. `1h`
- [ ] **P4** `etl/fundos.py` — pular arquivos CVM já ingeridos (comparar max data por arquivo antes de reprocessar). `1h`
- [ ] **P5** brapi batch — usar `/quote/T1,T2,...` onde o plano permitir + `sleep` condicional ao token (hoje 4s fixos ≈ 130s de espera por run). `2h`
- [x] **P6** ✅ (2026-07-08) Virtualização das listas `/rv`, `/fundos`, `/renda-fixa` (`@tanstack/react-virtual`) implementada como preparação (volumes reais hoje — fundos=8, renda-fixa≤100, rv já paginado a 50 — não justificavam por si só). Testado com dados mockados (200/1000/150 itens) via Playwright; 3 bugs reais corrigidos: container sem altura limitada em `/fundos`/`/renda-fixa` (virtualização não tinha janela pra recortar), `ResizeObserver` de `/fundos` preso a um ref nulo por rodar antes do elemento montar (corrigido com callback ref), e `useWindowVirtualizer` trocado por `useVirtualizer` com container próprio em `/fundos` (scrollMargin não atualizava a janela visível). Ver ADR-001, Passo 7.
- [ ] **P7** _(condicional — quando houver tráfego)_ Rotas async nos hot paths + cache TTL em memória p/ dados que mudam 1×/dia. `3h`

**Critério de aceite:** run diário do `rf_tesouro` < 1min; cron 17h UTC sem jobs duplicados; `/rv` fluido com 2.000 itens (medir com staging).

---

## Proposta 4 — Escalabilidade 🏗️

> Decisões e infraestrutura — algumas são suas (💰 = decisão de negócio), o resto é código.

- [x] **E1** 💰 ✅ **DECIDIDO (2026-07-08): manter retenção do COTAHIST em 1 ano, permanecer no free tier do Supabase.** Universo completo (2.368 tickers em produção, ~349 mil linhas/ano) ocupa 52–87MB com 1 ano — folgado no limite de 500MB mesmo somando todas as outras famílias de ativo (RF, Fundos, Indicadores, ANBIMA, Notícias — juntas, poucas dezenas de milhares de linhas). Upgrade para Supabase Pro (~US$25/mês, 8GB) fica descartado por ora; só voltaria à mesa se a política de retenção mudar para múltiplos anos (5 anos do universo completo ≈ 261–435MB, aí sim perto do teto) — não há gatilho ativo para isso hoje.
- [x] **E2** ✅ (2026-07-08) Paginação server-side em `/rv/ativos` (`?page=&per_page=&q=&tipo=&excluir_fii=`) + busca no banco. Frontend busca via API (campo de busca com debounce, paginação anterior/próxima). Revisado por pair-programming em 2 rodadas — corrigiu bug real de deep-link (SearchBar → ticker fora da página 1 sumia), painel de detalhe instável ao paginar, e race condition sem guard.
- [x] **E3** ✅ (2026-07-08) `backend/routes/carteira.py` `GET /posicoes` — trocou a heurística frágil `limit(len(tickers)*5)` por `rv_variacao_diaria()` (mesma RPC que já serve `/rv/ativos`, corrigida com `ORDER BY` na migration 013). Elimina a duplicação de lógica e a cobertura desigual entre tickers. Revisado por pair-programming em 2 rodadas: 1ª encontrou falta de `try/except` na RPC e a janela de 10 dias da função escondendo tickers ilíquidos/suspensos; corrigido com `try/except` + fallback pontual por ticker. 2ª rodada: ✅ aprovado.
- [ ] **E3b** (achado ao implementar E3) `backend/routes/carteira.py` `GET /analise` linha ~215 — heurística DIFERENTE e mais complexa (`limit(periodo_dias * len(tickers))` para reconstruir a série histórica completa da carteira, não só o último preço). `rv_variacao_diaria()` não resolve isso (só devolve 1 linha/ticker). Precisa de uma função SQL própria que alinhe as séries por ticker/data (idealmente com forward-fill) em vez de um LIMIT global sem `ORDER BY` por ticker. `2h`
- [ ] **E4** Metadados setoriais para o universo novo — a planilha de classificação setorial da B3 (pública) cobre o que o brapi `fundamental` não alcança em 2.000 tickers. Pesquisar formato + ETL. `4h`
- [x] **E5** ✅ (2026-07-08) QA amostral — `qa_run.py` [3.4] agora amostra até 5 páginas de `/rv/ativos` (até ~2.500 ativos) e valida estatisticamente: % com preço atual, % de preços em faixa válida, cobertura por tipo (ACAO/FII), ausência de variações diárias absurdas. Testado localmente com `get()`/`check()` mockados cobrindo casos de borda (universo vazio, 100% sem preço, variação absurda, falha de API) — nenhum lança exceção, todos reportam falha/sucesso corretamente. Mantido o check específico de PETR4 (3.3) como canário barato, não removido. Revisão de pair-programming (2 rodadas): os 4 checks de limiar (nunca validados contra produção real) viraram `check_info()` — informativos, não bloqueiam o workflow `qa.yml` — até rodar uma vez e confirmar os números reais; só "amostra coletada" (endpoint responde) é bloqueante.
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
- [x] `ELET3`/`RBRF11` — ✅ FECHADO (2026-07-08). Janelas de data completamente disjuntas (staging para em nov/out-2025, produção só começa em mar/2026). ELET6 (classe PN da mesma Eletrobras) tem a mesma janela exata de ELET3 — descarta rebatização isolada, aponta para suspensão de negociação da empresa toda. RBRF11: busca por "RBRALPHA" no universo completo (1000 ativos) não achou nenhum ticker relacionado — sem sucessor visível, mesma leitura de suspensão. Não bloqueia: o mecanismo de corte por precedência de `fonte` (item 6 do ADR-001) já resolve preservando dado de produção quando staging não tem histórico recente. Ver ADR-001 item 5.
- [x] Critério definitivo para `ETF_OU_FUNDO` (BOVA11, IVVB11, SMAL11, XFIX11) — ✅ CONCLUÍDO (2026-07-08). Lista curada `ETFS_CONHECIDOS` (confirmados via busca — todos ETFs reais) classifica como `ETF`; resto do universo "CI" vira `FUNDO_LISTADO`.
- [x] Variação de volume diário no COTAHIST (1.412→1.396→1.257) — ✅ CONFIRMADO liquidez normal (2026-07-08). Série completa de 1 ano (265 dias úteis, 250 com dado): média por dia da semana estável (1381–1406), tendência +3,8% primeiros vs últimos 30 dias (alta, não queda), zero outliers (>20% vs média móvel de 10 dias). Os 15 dias sem dado são feriados nacionais conhecidos ou borda da janela — nenhum gap inexplicado. Não é bug.

### Passo 4 — 💰 Decisões suas
- [x] Escopo do universo — ✅ DECIDIDO (2026-07-08): **Opção C, universo completo do COTAHIST** (2.366 tickers medidos, ~348 mil linhas/ano). Cabe no free tier com 1 ano de retenção (52–87MB).
- [x] Upgrade Supabase Pro (E1) — ✅ DECIDIDO (2026-07-08): **não fazer upgrade** — retenção do COTAHIST fica em 1 ano, permanecendo no free tier (ver E1 na Proposta 4).

### Passo 5 — Mecanismo de corte — ~3h — ✅ CONCLUÍDO (2026-07-08)
- [x] `etl/promover_cotahist.py` — implementado. Copia **staging inteiro** (universo completo) → produção com `fonte='cotahist'`, preservando linhas brapi onde COTAHIST não cobre. Revisado por pair-programming (agent `.claude/agents/pair-reviewer.md`): pegou bug crítico (fechamento_adj sobrescrevendo com NULL) e um erro factual meu sobre a migration 008 — ambos corrigidos, ver ADR-001 "Mecanismo de corte".
- [x] Dry-run rodado e revisado com o usuário (2.335 tickers novos, ~4.785 linhas sobrescritas estimadas), migration 012 executada, promoção real aprovada e executada: **2.368 tickers + 349.452 linhas de histórico promovidos** para `rv_ativos`/`rv_historico`.

### Passo 6 — Operação paralela (1–2 semanas) — iniciada 2026-07-08
- [x] Simplificar `etl.yml` — ✅ CONCLUÍDO (2026-07-08). 6 janelas de descoberta → 2 crons (21h10 BRT principal + 07h10 BRT fallback), mantendo fallback D-1 no script. Revisado por pair-programming (conferiu rollover BRT→UTC caractere a caractere, sem reincidência do bug de espaço duplo já documentado).
- [x] `validar_cotahist.py` como job diário — ✅ CONCLUÍDO (2026-07-08). Cron `15 11 * * 2-6` (08h15 BRT), depois que brapi e COTAHIST já rodaram no dia.
- [x] **F15** ✅ (2026-07-08) `validar_cotahist.py` — quando há divergência real (`total_divergencias > 0`), o run agora chama `run_ctx.set_status("partial", ...)` (mesmo mecanismo do F7/F11), o que já aparece em `/health/etl` (Status ETL do frontend) como "stale" sem precisar checar log do GitHub Actions manualmente. "Sem overlap" (ELET3/RBRF11) foi deixado de fora de propósito — é um caso já investigado e fechado (ADR-001 item 5), tratá-lo como alerta criaria ruído permanente.
- [ ] Ao final da janela paralela (1-2 semanas a partir de 2026-07-08): aposentar `rv_historico.py` para preços (mantém-se para metadados via `fundamental`, em cadência semanal)

### Passo 7 — API + Frontend para o universo novo — ~7h
- E2 (paginação server-side) + E3 (RPC último preço) + P6 (virtualização) — nesta ordem

### Passo 8 — QA e documentação — ~2h ✅ concluído (2026-07-08)
- [x] E5 (QA amostral) no `qa_run.py`
- [x] Atualizar ADR-001 (status: Fase 2 concluída), README (tabela de dados), `architecture.md`

**Esforço total Fase 2: ~20h** (sem contar as Propostas 1–3, que somam ~29h e podem ser paralelizadas em parte).

### Sequência sugerida (3 sprints)

```
Sprint 1: Proposta 1 (falhas) + P1/P2 (perf críticos) + Passo 2 (ajuste proventos)   ~12h
Sprint 2: Proposta 2 (redundância) + Passo 3 (investigações) + decisões (Passo 4)    ~15h
Sprint 3: Passos 5–8 (corte + paralelo + API/frontend + QA)                          ~15h
```
