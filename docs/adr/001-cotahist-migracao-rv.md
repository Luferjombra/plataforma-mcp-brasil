# ADR-001 — Migração da fonte de Renda Variável para o COTAHIST (B3)

**Status:** Fase 1 concluída (2026-07-03) · Validação cruzada concluída (2026-07-07) · Fonte de eventos corporativos resolvida (2026-07-07) · Ajuste por proventos implementado (2026-07-07) · Fase 2 em andamento
**Referenciado em:** `etl/cotahist.py`, `etl/cotahist_backfill.py`, `etl/validar_cotahist.py`, `etl/eventos_corporativos.py`, `etl/aplicar_ajuste_proventos.py`, `database/migrations/008_cotahist_staging.sql`, `database/migrations/010_eventos_corporativos.sql`, `database/migrations/011_fechamento_adj_staging.sql`, `.github/workflows/etl.yml`

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

**Ponto de atenção para a Fase 2:** o número de ativos caiu a cada dia (1.412 → 1.396 → 1.257). Pode ser liquidez normal de sexta-feira, mas não foi investigado — deve ser resolvido antes de promover para produção.

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

## Fase 2 — pendências

Antes de promover `rv_ativos_staging`/`rv_historico_staging` para `rv_ativos`/`rv_historico`:

1. ~~**Validação cruzada**~~ — ✅ concluída (2026-07-06/07), ver seção acima. Abriu uma pendência nova (item 4).
2. **Resolver `ETF_OU_FUNDO`** — critério definitivo antes do campo `tipo` virar fonte de verdade.
3. **Decidir escopo do universo exposto** — manter curadoria de ~30 tickers ou expor o universo completo do COTAHIST (implica paginação/busca server-side na API e frontend).
4. **Ajuste por proventos (implementado 2026-07-07; pendente validar após população completa de eventos)** — `setor`, `subsetor`, `market_cap`, `free_float` (hoje vêm do brapi `fundamental=true`) continuam sem fonte equivalente no COTAHIST. O gap de `fechamento_adj` (ajustado por proventos) — confirmado como bloqueador real pela validação cruzada — está resolvido para os tickers com evento cadastrado: `database/migrations/011_fechamento_adj_staging.sql` adiciona a coluna e `etl/aplicar_ajuste_proventos.py` calcula `preco_ajustado = preco_bruto / fator_acumulado` (ver seção "Ajuste por proventos" abaixo). Falta rodar o ETL de eventos até cobrir todo o universo (hoje ~13/31 tickers, por causa do rate limit da brapi) e reconfirmar via `validar_cotahist.py --usar-ajustado`.
5. **Investigar ELET3 e RBRF11** — sem overlap de datas mesmo com contagens parecidas nas duas fontes; checar se é delisting, rebatização de ticker ou gap de coleta.
6. **Mecanismo de corte** — script de promoção com regra de precedência por `fonte` (coluna já preparada nas migrations 007/008); rodar em paralelo por 1–2 semanas antes de aposentar `rv_historico.py`.
7. **Simplificar `etl.yml`** — trocar as 6 janelas de descoberta por 1 cron único (mantendo fallback D-1), já que não existe horário fixo confiável.
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
- `database/migrations/011_fechamento_adj_staging.sql` — adiciona `fechamento_adj NUMERIC(14,4)` em `rv_historico_staging` (produção já tinha essa coluna; staging não).
- `etl/aplicar_ajuste_proventos.py` — só processa tickers já presentes em `rv_eventos_societarios` (hoje ~13/31, limitado pelo rate limit da brapi em `eventos_corporativos.py`); recalcula e faz upsert de `fechamento_adj` em `rv_historico_staging`. Payload do upsert inclui `ticker`/`data`/`fechamento` (não só `fechamento_adj`) porque `ON CONFLICT DO UPDATE` no PostgREST valida as constraints `NOT NULL` da tabela mesmo no ramo de conflito.
- Disparo manual via `workflow_dispatch` (`ajuste_proventos`).
- Validação: `etl/validar_cotahist.py --usar-ajustado` compara `fechamento` (brapi, já ajustado) contra `fechamento_adj` (staging) em vez do `fechamento` bruto — usar depois de rodar o ajuste para confirmar que as divergências de ITUB4/MGLU3 caem a ~0%.
- **Pendente:** cobrir o restante do universo de eventos (o ajuste só vale para tickers com evento cadastrado) e rodar `eventos_corporativos.py` recorrentemente até fechar a lacuna (ver F11 do backlog de auditoria — tratar 403 como sinal de parada, não erro).

**O que ainda falta (não faz parte desta etapa):** o cálculo de `preco_ajustado = preco_bruto / fator` para as datas anteriores a `data_com` — `rv_eventos_societarios` fornece o dado, mas a lógica de ajuste em si ainda não foi escrita. Fica como próximo passo antes de fechar o item 4 da Fase 2.

## Referências

- `etl/cotahist.py` — ETL diário (staging), smoke test, classificação
- `etl/cotahist_backfill.py` — backfill anual (staging)
- `etl/validar_cotahist.py` — validação cruzada COTAHIST × brapi (só leitura, OHLC completo)
- `etl/eventos_corporativos.py` — bonificação/desdobramento/grupamento/proventos (brapi dividendsData)
- `database/migrations/008_cotahist_staging.sql` — tabelas de staging + coluna `fonte`
- `database/migrations/009_cleanup_indice_redundante.sql` — remoção de índice duplicado
- `database/migrations/010_eventos_corporativos.sql` — `rv_eventos_societarios` + `rv_proventos`
- `.github/workflows/etl.yml` — jobs `etl-cotahist-staging` (schedule); `etl-cotahist-backfill`, `etl-validar-cotahist` e `etl-eventos-corporativos` (manuais)
