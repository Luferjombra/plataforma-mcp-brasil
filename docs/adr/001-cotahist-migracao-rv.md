# ADR-001 — Migração da fonte de Renda Variável para o COTAHIST (B3)

**Status:** Fase 1 concluída (2026-07-03) · Validação cruzada concluída (2026-07-07) · Fonte de eventos corporativos resolvida (2026-07-07) · Ajuste por proventos implementado e validado (2026-07-07) · **Corte staging → produção concluído (2026-07-08)** · Fase 2 em andamento (operação paralela)
**Referenciado em:** `etl/cotahist.py`, `etl/cotahist_backfill.py`, `etl/validar_cotahist.py`, `etl/eventos_corporativos.py`, `etl/aplicar_ajuste_proventos.py`, `etl/promover_cotahist.py`, `backend/routes/rv.py`, `backend/routes/search.py`, `backend/postgrest_utils.py`, `frontend/app/rv/page.tsx`, `frontend/lib/api.ts`, `database/migrations/008_cotahist_staging.sql`, `database/migrations/010_eventos_corporativos.sql`, `database/migrations/011_fechamento_adj_staging.sql`, `database/migrations/012_widen_ticker_producao.sql`, `database/migrations/013_rv_variacao_diaria_order.sql`, `.github/workflows/etl.yml`

---

## Contexto

O ETL de Renda Variável (`etl/rv_historico.py`) usa a brapi.dev, ticker a ticker, para uma lista curada de ~30 papéis (`ATIVOS[]`). Isso tem três limites estruturais:

1. **Rate limit por ticker** — o free tier da brapi aceita ~15 req/min; cobrir centenas ou milhares de tickers exigiria pagar um plano Pro (R$ 116/mês) e ainda assim manter uma arquitetura ticker-a-ticker.
2. **Cobertura fixa** — só existem dados para os tickers explicitamente listados em `ATIVOS[]`. Expandir o universo (ex.: para 2.000 tickers) significa manter essa lista manualmente e escalar linearmente o número de chamadas.
3. **Sem preço ajustado consistente para o universo todo** — depende do que a brapi devolve por ticker.

A B3 publica diariamente um arquivo público (`COTAHIST_D<ddmmaaaa>.ZIP`) com **todos os papéis do mercado à vista negociados no dia** — ações, FIIs, ETFs, BDRs — em um único download, layout fixo documentado (`SeriesHistoricas_Layout.pdf`, registro tipo "01", 245 bytes). Também publica arquivos anuais (`COTAHIST_A<aaaa>.ZIP`) para histórico retroativo.

## Decisão

Migrar a fonte de Renda Variável de brapi.dev (ticker a ticker) para o COTAHIST (B3, universo completo em um download), em duas fases:

- **Fase 1** — ingestão em tabelas de *staging* (`rv_ativos_staging`, `rv_historico_staging`), rodando em paralelo ao ETL de produção existente, sem tocar `rv_ativos`/`rv_historico`. Objetivo: validar parsing/classificação e descobrir empiricamente a janela de publicação do arquivo diário da B3.
- **Fase 2** — promoção staging → produção, depois de validação cruzada. Ver [Fase 2 — pendências](#fase-2--pendências-não-iniciada) abaixo.

### Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Assinar brapi Pro e manter arquitetura ticker-a-ticker | Custo cresce com o número de tickers; não resolve o limite estrutural de 1 chamada por papel |
| Expandir `ATIVOS[]` manualmente para mais tickers | Não escala para milhares de papéis; continua sujeito a rate limit |
| COTAHIST como fonte primária (decisão tomada) | Um único download cobre todo o universo do dia; gratuito; layout estável e documentado pela própria B3 |

## Fase 1 — execução e resultados

**Mecanismo de descoberta:** como a B3 não documenta um horário fixo de publicação, `etl/cotahist.py` rodou 6x/dia via cron (`etl.yml`) durante a semana de 2026-06-29 a 2026-07-04, tentando o arquivo do dia e caindo para o pregão anterior (D-1) em caso de 404 — tratado como resultado esperado, não falha.

**Smoke test:** cada run classifica 8 papéis de tipo conhecido e não-ambíguo (PETR4, VALE3, ITUB4, BBAS3, WEGE3 — ações; HGLG11, MXRF11, KNRI11 — FIIs) e compara com o esperado. Critério de saída: **N ≥ 3 execuções diárias consecutivas sem falha**.

**Resultado (atingido em 2026-07-03/04):**

| Pregão | Ativos (mercado à vista) | Smoke test | Quando o arquivo apareceu |
|---|---|---|---|
| 2026-07-01 | 1.412 | 8/8 ✅ | já disponível às 22h38 BRT |
| 2026-07-02 | 1.396 | 8/8 ✅ | entre 19h20–20h19 BRT |
| 2026-07-03 | 1.257 | 8/8 ✅ | só depois das 21h10 BRT |

**Achado principal:** não existe horário fixo de publicação — variou de "disponível às 19h" a "só depois das 21h" em dias diferentes da mesma semana. Conclusão prática: o fallback D-1 não é um detalhe de implementação, é **obrigatório** — qualquer cron único de coleta precisa aceitar que o arquivo do dia pode não estar pronto ainda.

**Limitação conhecida (não bloqueia a Fase 1):** o campo `ESPECI` bruto "CI" cobre tanto ETFs quanto outros fundos negociados em bolsa (FIAgro, FIDC listado etc.) — o layout público não distingue os dois de forma inequívoca. Ativos nessa categoria (`BOVA11`, `IVVB11`, `SMAL11`, `XFIX11` observados até agora) são marcados como `tipo='ETF_OU_FUNDO'` e reportados à parte, sem travar o smoke test.

~~**Ponto de atenção para a Fase 2:**~~ ✅ resolvido (2026-07-08) — o número de ativos caiu a cada dia (1.412 → 1.396 → 1.257) nessa amostra de 3 dias. Com ~1 ano de backfill já em `rv_historico_staging`, um script de diagnóstico pontual (`etl/analisar_liquidez_diaria.py`, descartado após uso) mediu a série completa (265 dias úteis, 250 com dado): média por dia da semana muito estável (1381–1406, sem efeito sistemático de "sexta é mais fraca"), tendência **+3,8%** entre os primeiros e os últimos 30 dias com dado (leve alta, não queda), e **zero outliers** (nenhum dia com queda >20% vs. média móvel de 10 dias úteis) em toda a série. Os 15 dias úteis sem dado batem exatamente com feriados nacionais conhecidos (Consciência Negra, Natal, Ano Novo, Carnaval, Sexta-feira Santa, Tiradentes, Dia do Trabalho, Corpus Christi) ou a borda da janela de coleta. **Confirmado: é variação normal de liquidez, não bug no ETL.**

## Backfill histórico (2026-07-04)

`etl/cotahist_backfill.py` baixa os arquivos **anuais** do COTAHIST para reconstituir histórico retroativo, escrevendo na mesma disciplina de staging. Parametrizado por `--anos N` (padrão 1) ou `--ano-inicio AAAA`.

**Decisão de escopo (2026-07-04):** começar com **1 ano** de backfill, não 5. Motivo: estimativa de armazenamento para 2.000 tickers × 5 anos gira em torno de 375–625MB só em `rv_historico`, o que se aproxima ou ultrapassa o limite do free tier do Supabase (500MB) — sem contar o restante do banco (fundos CVM, ANBIMA, indicadores, notícias). Ver também `migrations/009_cleanup_indice_redundante.sql`, que remove um índice duplicado em `rv_historico` para reduzir esse overhead antes do volume crescer.

Esse limite de armazenamento é a variável que decide se um universo de ~2.000 tickers é viável no free tier ou exige upgrade para o plano Pro (~$25/mês, 8GB) — decisão de negócio ainda em aberto.

## Validação cruzada — resultado (2026-07-06/07)

Item 1 da Fase 2 executado via `etl/validar_cotahist.py` (só leitura, compara `rv_historico` produção × `rv_historico_staging` COTAHIST nos 31 tickers da lista curada de `rv_historico.py`, janela de 400 dias). Resultado sobre 4.756 datas comparadas:

| Categoria | Tickers | Achado |
|---|---|---|
| Match perfeito | 26/31 | 0% de divergência em todos os campos (abertura/máxima/mínima/fechamento) em até 249 dias cada |
| Divergência sistemática | `ITUB4`, `MGLU3` | Offset **constante** em todos os 4 campos do candle — 3,0% e 5,0% respectivamente, em ~120 de 249 dias |
| Divergência isolada | `VIVT3` | 1 dia de 248 diverge, e só no `fechamento` (abertura/máxima/mínima batem 100%) |
| Sem overlap de datas | `ELET3`, `RBRF11` | Contagens parecidas nas duas fontes (74–90 registros) mas datas completamente diferentes — não investigado a fundo ainda |

**Causa confirmada do offset sistemático (ITUB4/MGLU3):** os dois passaram por **bonificação em ações** com ex-direito em dezembro/2025 — ITUB4 3% (ex-direito 26/12/2025), MGLU3 5% / 1 ação nova a cada 20 (ex-direito 30/12/2025). O fator teórico de ajuste (1 ÷ (1 + bonificação)) bate com o offset observado: 1/1,03 ≈ -2,91% (medido: ~3,0%) e 1/1,05 ≈ -4,76% (medido: ~5,0%). O offset ser idêntico nos 4 campos do candle (não só no fechamento) confirma que é retroajuste de série inteira, não erro de parsing.

**Conclusão:** o brapi retroajusta o histórico de preço (`fechamento`, e também OHLC) para refletir bonificações/desdobramentos futuros em relação à data do candle — mantendo a série "contínua" para quem calcula retorno. O COTAHIST reporta o preço exatamente como foi negociado no pregão daquele dia, sem esse retroajuste. **Não é bug — é diferença de convenção entre as fontes**, mas é uma diferença que precisa de decisão explícita antes da promoção (ver item 4 da Fase 2 abaixo, agora com evidência concreta).

O caso VIVT3 (offset isolado, só no fechamento, um único dia) tem assinatura diferente — não é compatível com evento societário (que afetaria o candle inteiro). Provável revisão pontual de preço entre as fontes; não bloqueia a Fase 2, mas fica registrado.

**Confirmação pós-ajuste (2026-07-07):** depois de rodar `aplicar_ajuste_proventos.py` (ver seção "Ajuste por proventos" abaixo), `validar_cotahist.py --usar-ajustado` repetiu a mesma comparação usando `fechamento_adj` no lado staging: **0 divergências em 4.785 datas comparadas** (31 tickers). ITUB4 e MGLU3 foram a 0% (eram ~121/249 e ~123/249 divergências); o caso isolado de VIVT3 também zerou. Único achado remanescente: `ELET3`/`RBRF11` continuam sem overlap de datas (item 5 da Fase 2, não relacionado a preço ajustado).

## Fase 2 — pendências

Antes de promover `rv_ativos_staging`/`rv_historico_staging` para `rv_ativos`/`rv_historico`:

1. ~~**Validação cruzada**~~ — ✅ concluída (2026-07-06/07), ver seção acima. Abriu uma pendência nova (item 4).
2. ~~**Resolver `ETF_OU_FUNDO`**~~ — ✅ concluído (2026-07-08). O layout público não distingue ETF de outro fundo listado só pela ESPECI "CI" — resolvido por curadoria: `ETFS_CONHECIDOS = {BOVA11, IVVB11, SMAL11, XFIX11}` (confirmados via B3/gestoras — BOVA11/IVVB11/SMAL11 são iShares/BlackRock, XFIX11 é ETF do IFIX da XP Vista, primeiro ETF imobiliário do Brasil) classificam como `tipo='ETF'`; o resto do universo "CI" cai em `tipo='FUNDO_LISTADO'` (renomeado de `ETF_OU_FUNDO`). `classificar()` em `etl/cotahist.py` agora recebe o ticker além de especi/codbdi. BOVA11 promovido ao smoke test (esperado `ETF`).
3. ~~**Decidir escopo do universo exposto**~~ — ✅ decidido (2026-07-08): **universo completo do COTAHIST** (2.366 tickers medidos em `rv_ativos_staging`, ~348 mil linhas/ano em `rv_historico_staging`). Dimensionamento (script descartável `medir_universo_storage.py`, usado e removido): com 1 ano de retenção, o universo completo ocupa **52–87MB**, folgado no free tier do Supabase (500MB) mesmo somando as demais tabelas do projeto (fundos CVM, ANBIMA, indicadores, notícias). O gatilho real para precisar do Supabase Pro não é o tamanho do universo, é reter **múltiplos anos** de histórico (5 anos do universo completo chegaria a 261–435MB, aí sim perto do teto) — não decidido ainda, mas não bloqueia começar com 1 ano. Implica paginação/busca server-side na API e frontend (E2/P6) e metadados setoriais para o universo novo (E4, já que `setor`/`subsetor`/`market_cap` do brapi só cobrem a curadoria antiga).
4. ~~**Ajuste por proventos**~~ — ✅ concluído e validado (2026-07-07). `preco_ajustado = preco_bruto / fator_acumulado` aplicado via `aplicar_ajuste_proventos.py`, confirmado por `validar_cotahist.py --usar-ajustado` (0 divergências, ver seção acima). `setor`, `subsetor`, `market_cap`, `free_float` (hoje vêm do brapi `fundamental=true`) continuam sem fonte equivalente no COTAHIST — não bloqueiam a promoção de preço/OHLC, mas ficam como gap conhecido. **Ainda pendente:** o ajuste só cobre os 4 tickers com evento cadastrado hoje (ITUB4, MGLU3, PETR4, VALE3) — rodar `eventos_corporativos.py` recorrentemente até cobrir o restante do universo (rate limit da brapi, ver F11 do backlog de auditoria) e reaplicar o ajuste conforme a base crescer.
5. ~~**Investigar ELET3 e RBRF11**~~ — ✅ diagnosticado e fechado (2026-07-08), não bloqueia a Fase 2. `validar_cotahist.py` passou a reportar o range de datas de cada fonte quando não há overlap, o que revelou o padrão real: as janelas são **completamente disjuntas no tempo**, não uma diferença de cobertura. ELET3: produção (brapi) cobre 2026-03-18→2026-07-07, staging (COTAHIST) cobre 2025-07-07→**2025-11-07** — nenhuma linha depois disso. RBRF11: produção 2026-03-18→2026-07-06, staging 2025-07-07→**2025-10-02**. Gap de 4-5,5 meses sem registro em nenhuma das duas fontes, apesar do cron diário do staging rodando continuamente — ou seja, não é falta de coleta.
   Um script de diagnóstico pontual (`etl/diagnosticar_ticker_sucessor.py`, descartado após uso) buscou candidatos a sucessor no universo completo do `rv_ativos_staging`. Achado-chave: **ELET6** (mesma empresa, classe PN de ELETROBRAS) tem a **mesma janela exata** que ELET3 (90 dias, 2025-07-07→2025-11-07) — ou seja, as duas classes de ação pararam de negociar no mesmo dia. Isso descarta rebatização de um único código isolado e aponta para algo que afetou a empresa inteira (suspensão de negociação/reestruturação societária), não um bug de ETL. Para RBRF11 (FII, nome truncado `'FII RBRALPHA'`), uma primeira busca pelo termo genérico "FII" não foi útil (bateria em centenas de fundos); repetindo com o termo distintivo "RBRALPHA" em todo o universo (1000 ativos), **zero candidatos** — nenhum outro ticker com nome parecido, ou seja, sem sucessor visível na base. Diferente de ELET3 (que tem irmã), RBRF11 não tem nenhum ticker relacionado — o padrão é consistente com suspensão de negociação do próprio fundo sob o mesmo código, não uma troca de código.
   **Resolução:** o mecanismo de corte já planejado no item 6 (precedência por `fonte`) resolve isso naturalmente — se o COTAHIST não tem dado recente para um ticker, o corte preserva o dado de produção (brapi) em vez de sobrescrever com COTAHIST desatualizado. Não é um bloqueador novo, é uma confirmação de que o design do corte já contemplava esse caso. Vale reconferir em alguns dias se o cron diário do COTAHIST volta a captar ELET3/ELET6/RBRF11 (já que o brapi os mostra ativamente negociados agora) — se não voltar, aí sim investigar um possível bug de parsing específico desses 2 papéis.
6. ~~**Mecanismo de corte**~~ — ✅ **executado (2026-07-08)**: **2.368 tickers** e **349.452 linhas de histórico** promovidos para `rv_ativos`/`rv_historico` (ver seção dedicada abaixo para números completos e o dry-run que precedeu). Falta a janela de operação paralela (1–2 semanas) antes de aposentar `rv_historico.py` para preço.
7. ~~**Simplificar `etl.yml`**~~ — ✅ concluído (2026-07-08): as 6 janelas de descoberta da Fase 1 viraram 2 crons (21h10 BRT principal + 07h10 BRT fallback, `10 0 * * 2-6` / `10 10 * * 2-6`), mantendo o fallback D-1 dentro do próprio script. `validar_cotahist.py` ganhou cron diário (08h15 BRT, `15 11 * * 2-6`) para a janela de operação paralela (Passo 6). **Limitação registrada:** o script só imprime divergências no log, não falha o job nem alerta ativamente — monitorar exige checar o Actions manualmente todo dia durante a janela paralela (ver backlog).
8. **QA** — cenário de sanity check para o universo ampliado (não só os 8 tickers do smoke test).

## Eventos corporativos — base de dados (implementado 2026-07-07)

Decorrente do achado da validação cruzada: para o COTAHIST virar fonte de preço ajustado (ou para o app calcular o próprio ajuste), era preciso uma base estruturada de eventos societários (bonificação, desdobramento, grupamento, dividendos). Duas linhas de fonte avaliadas:

- **brapi.dev (`dividends=true`)** — `rv_historico.py` já passava `"dividends": "false"` no payload da brapi, ou seja, o parâmetro para pedir esse dado já existia na API que o projeto usa; só nunca tinha sido ativado.
- **Busca web (agente)** — usada nesta investigação pontual para confirmar as bonificações de ITUB4/MGLU3 via notícias (Money Times, Suno, Investidor10). Útil para achar o evento e a data, mas descartada como fonte de produção — risco de erro de extração em cima de texto de notícia, sem número exato.

**Decisão: brapi.dev confirmada como fonte, via teste real na API (GitHub Actions, já que este ambiente não alcança `brapi.dev` diretamente).** `dividends=true` respondeu **200 OK** sem bloqueio de plano, com `dividendsData` trazendo 3 arrays: `cashDividends` (dividendo/JCP), `stockDividends` (bonificação/desdobramento/grupamento, com `factor` numérico), `subscriptions`. Os fatores bateram exatamente com o offset medido na validação cruzada:

| Ticker | `factor` (API) | Offset teórico (1 − 1/factor) | Offset medido |
|---|---|---|---|
| ITUB4 | 1,03 | -2,91% | ~3,0% |
| MGLU3 | 1,05 | -4,76% | ~5,0% |

**Implementação:**
- `database/migrations/010_eventos_corporativos.sql` — duas tabelas: `rv_eventos_societarios` (bonificação/desdobramento/grupamento, `CHECK` no `tipo` com fallback `OUTROS` para rótulos não mapeados — a API já devolveu um rótulo inesperado, `"CIS RED CAP"`, para ITUB4) e `rv_proventos` (dividendo/JCP, base para futura funcionalidade de calendário/yield).
- `etl/eventos_corporativos.py` — popula as duas tabelas a partir do `dividendsData`, mesma lista de tickers (`ATIVOS`) e mesmo padrão `ETLRun`/rate-limit de `rv_historico.py`.
- Disparo manual via `workflow_dispatch` (`eventos_corporativos`) — vira cron só depois de validar o volume real de dados.

## Ajuste por proventos (implementado 2026-07-07)

Com `rv_eventos_societarios` populada, dá para calcular o mesmo retroajuste que o brapi já faz, diretamente no COTAHIST:

`fator_acumulado(data_pregao) = produto de fator de todo evento do ticker com data_com >= data_pregao` (eventos ainda "à frente" daquele pregão). `fechamento_adj = fechamento / fator_acumulado`.

**Implementação:**
- `database/migrations/011_fechamento_adj_staging.sql` — adiciona `fechamento_adj NUMERIC(14,4)` em `rv_historico_staging` (produção já tinha essa coluna; staging não). Executada em produção 2026-07-07.
- `etl/aplicar_ajuste_proventos.py` — só processa tickers já presentes em `rv_eventos_societarios` (hoje 4: ITUB4, MGLU3, PETR4, VALE3 — limitado pelo rate limit da brapi em `eventos_corporativos.py`); recalcula e faz upsert de `fechamento_adj` em `rv_historico_staging`. Payload do upsert inclui `ticker`/`data`/`fechamento` (não só `fechamento_adj`) porque `ON CONFLICT DO UPDATE` no PostgREST valida as constraints `NOT NULL` da tabela mesmo no ramo de conflito. Primeira execução (2026-07-07): 1.000 candles ajustados (250 por ticker).
- Disparo manual via `workflow_dispatch` (`ajuste_proventos`).
- **Validação confirmada (2026-07-07):** `etl/validar_cotahist.py --usar-ajustado` (job `validar_cotahist_ajustado` no `etl.yml`) compara `fechamento` (brapi, já ajustado) contra `fechamento_adj` (staging) — resultado: **0 divergências em 4.785 datas comparadas**, incluindo ITUB4 e MGLU3 (ver seção "Validação cruzada — resultado" acima).
- **Pendente:** cobrir o restante do universo de eventos (o ajuste só vale para tickers com evento cadastrado) e rodar `eventos_corporativos.py` recorrentemente até fechar a lacuna (ver F11 do backlog de auditoria — tratar 403 como sinal de parada, não erro).

## Mecanismo de corte (executado 2026-07-08)

Item 6 da Fase 2 — promove `rv_ativos_staging`/`rv_historico_staging` (universo completo) para `rv_ativos`/`rv_historico` (produção).

**Correção de premissa:** a primeira versão deste item (e da migration 012) partiu da suposição de que `fonte` "não existia" em produção. Errado — checar de novo revelou que `database/migrations/008_cotahist_staging.sql`, seção 1, já adiciona `fonte VARCHAR(20) DEFAULT 'brapi'` em `rv_ativos`/`rv_historico` desde a Fase 1. O erro veio de um `grep -v staging` que descartou por engano as linhas da própria migration 008 (o filtro bate no *nome do arquivo* inteiro, que contém "staging", não só no conteúdo). `database/migrations/012_widen_ticker_producao.sql` foi reduzida para o que realmente falta: alargar `ticker` de VARCHAR(10) para VARCHAR(12) em produção, igualando o staging (evita truncar tickers do universo completo com código mais longo).

**Achado crítico de revisão (pair-programming, 2026-07-08):** a primeira versão de `etl/promover_cotahist.py` mandava `fechamento_adj` no upsert de histórico para todo o universo — mas `aplicar_ajuste_proventos.py` só calcula essa coluna para os tickers com evento societário cadastrado (hoje 4: ITUB4/MGLU3/PETR4/VALE3). Para os ~27 tickers curados restantes, `fechamento_adj` é `NULL` em staging; mandar isso no payload teria **sobrescrito com `NULL` o valor real já calculado em produção pela brapi** (PostgREST só pula colunas *ausentes* do payload, não colunas presentes com valor `null`). Corrigido: o upsert de histórico agora separa as linhas com `fechamento_adj` calculado (mandam a coluna) das que não têm (omitem a chave inteira do payload), preservando o que já existe em produção para essas últimas.

**Implementação:**
- `database/migrations/012_widen_ticker_producao.sql` — alarga `ticker` para VARCHAR(12) em `rv_ativos`/`rv_historico`.
- `etl/promover_cotahist.py` — dois modos: `--dry-run` (só leitura, relatório de quantas linhas/tickers seriam afetados, reusa paginação segura contra o limite de 1000 do PostgREST) e promoção real (upsert em lotes de 500, ativos antes de histórico por causa da FK). Precedência por `fonte` é implícita: upsert por `(ticker, data)` sobrescreve produção onde o COTAHIST tem dado; onde não tem (ex.: ELET3/RBRF11, ver item 5), a linha antiga da brapi não é tocada.
- Jobs `promover_cotahist_dry_run` e `promover_cotahist` no `etl.yml` (`workflow_dispatch`).

**Dry-run (2026-07-08):** 2.335 tickers novos + 31 já existentes (metadata atualizada), ~4.785 linhas de histórico sobrescritas (0 divergências já validadas), ~343.241 linhas novas estimadas.

**Promoção real (2026-07-08, aprovada após dry-run + migration 012 executada):**

| Métrica | Resultado |
|---|---|
| Tickers promovidos em `rv_ativos` | **2.368** |
| Linhas de histórico promovidas em `rv_historico` | **349.452** |
| — com `fechamento_adj` calculado | 1.000 |
| — sem (payload omitiu a coluna, preservando o valor já existente) | 348.452 |

Números batem com a estimativa do dry-run (pequena diferença por causa do universo ter crescido entre a medição e a execução). `rv_ativos`/`rv_historico` agora cobrem o universo completo do COTAHIST.

**Hotfix pós-corte (2026-07-08):** `GET /rv/ativos` fazia `.select("*")` sem paginação — com `rv_ativos` em 2.368 tickers, o limite padrão de 1000 linhas do PostgREST passou a truncar a lista silenciosamente (bug ativo em produção desde a promoção acima). Corrigido em branch dedicada `fix/rv-ativos-paginacao` (mergeada em `main`): `_buscar_paginado()` (mesmo padrão de `etl/promover_cotahist.py`) aplicado no select de `rv_ativos` e na RPC `rv_variacao_diaria`. Revisão de pair-programming pegou um segundo problema (paginação via `LIMIT/OFFSET` sem `ORDER BY` não é determinística entre páginas) — corrigido com `.order("ticker")` no backend e `database/migrations/013_rv_variacao_diaria_order.sql` (também alarga o retorno da função para `varchar(12)`). Confirmado com teste real contra Postgres (1.500 tickers sintéticos, zero duplicados na paginação). **Fora de escopo, registrado como não bloqueante:** `GET /rv/historico/{ticker}` aceita `limit` até 2000, mas está sujeito ao mesmo cap de 1000 do PostgREST se algum ticker do universo completo tiver mais de 1000 candles — não ocorre hoje (default é 252), mas é a mesma classe de bug.

**Operação paralela (Passo 6):** ✅ em andamento desde 2026-07-08 — `etl.yml` simplificado (6 janelas de descoberta → 2 crons) e `validar_cotahist.py` rodando diariamente. Ao final da janela (1-2 semanas): aposentar `rv_historico.py` para preço.

- **Risco conhecido, não bloqueante (apontado na revisão):** `abertura`/`maxima`/`minima` são nullable nas duas tabelas e `parse_linha` (`etl/cotahist.py`) pode gerar `None` para esses campos quando o COTAHIST não traz o valor. Em tese o mesmo problema do `fechamento_adj` acima se aplicaria — sobrescrever OHLC válido da brapi com `NULL` numa data de overlap. A validação cruzada já documentada (0% de divergência em todos os campos OHLC nos 31 tickers testados) sugere que isso não ocorre na prática hoje, mas não há garantia estrutural para o universo completo (2.366 tickers). Resolver direito exigiria agrupar o upsert por combinação de campos nulos (até 8 grupos) — desproporcional a um risco ainda não observado. Ficar de olho depois do corte; se aparecer, aplicar o mesmo padrão do `fechamento_adj`.

## Passo 7 — API e frontend para o universo novo (em andamento)

**E2 — Paginação server-side (concluído 2026-07-08):** `GET /rv/ativos` aceita `q` (busca ticker/nome), `tipo`, `excluir_fii`, `page`, `per_page` e pagina de verdade no banco (`.range()` + `count="exact"`), substituindo o hotfix F13 que ainda buscava o universo inteiro no backend. RPC `rv_variacao_diaria` filtrada só pelos tickers da página atual via `.in_()`. De brinde, corrigiu o F9 (filter injection não sanitizado no `.or_()` de `backend/routes/search.py`) com um helper novo (`backend/postgrest_utils.py::sanitizar_busca`) reaproveitado nos dois lugares.

Revisão de pair-programming (2 rodadas) encontrou e corrigiu 3 problemas reais no frontend (`frontend/app/rv/page.tsx`): (1) deep-link vindo da busca global (`/rv?ticker=X`) quebrava silenciosamente para qualquer ticker fora da primeira página em ordem alfabética — corrigido inicializando a busca com o `tickerParam` da URL; (2) o painel de detalhe do ativo selecionado ficava inconsistente ao trocar de página (dependia de `ativos.find()` sobre a página atual) — corrigido com estado `ativoSel` próprio, desacoplado da paginação; (3) troca rápida de filtro/busca podia disparar 2 requisições fora de ordem sem guard — corrigido com um `requestIdRef` que descarta respostas obsoletas.

**Pendente:** E3 (RPC/view de último preço por ticker, substituindo a heurística frágil de `backend/routes/carteira.py`) e P6 (virtualização das listas `/rv`, `/fundos`, `/renda-fixa`).

## Referências

- `etl/cotahist.py` — ETL diário (staging), smoke test, classificação
- `etl/cotahist_backfill.py` — backfill anual (staging)
- `etl/validar_cotahist.py` — validação cruzada COTAHIST × brapi (só leitura, OHLC completo)
- `etl/eventos_corporativos.py` — bonificação/desdobramento/grupamento/proventos (brapi dividendsData)
- `etl/aplicar_ajuste_proventos.py` — calcula `fechamento_adj` em `rv_historico_staging`
- `etl/promover_cotahist.py` — promoção staging → produção (Passo 5), `--dry-run` e real
- `database/migrations/008_cotahist_staging.sql` — tabelas de staging + coluna `fonte` (produção e staging)
- `database/migrations/009_cleanup_indice_redundante.sql` — remoção de índice duplicado
- `database/migrations/010_eventos_corporativos.sql` — `rv_eventos_societarios` + `rv_proventos`
- `database/migrations/011_fechamento_adj_staging.sql` — coluna `fechamento_adj` em staging
- `database/migrations/012_widen_ticker_producao.sql` — `ticker` VARCHAR(12) em produção
- `.github/workflows/etl.yml` — jobs `etl-cotahist-staging` (schedule); `etl-cotahist-backfill`, `etl-validar-cotahist`, `etl-eventos-corporativos`, `etl-promover-cotahist-dry-run` e `etl-promover-cotahist` (manuais)
