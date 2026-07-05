# ADR-001 — Migração da fonte de Renda Variável para o COTAHIST (B3)

**Status:** Fase 1 concluída (2026-07-03) · Fase 2 pendente
**Referenciado em:** `etl/cotahist.py`, `etl/cotahist_backfill.py`, `database/migrations/008_cotahist_staging.sql`, `.github/workflows/etl.yml`

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

## Fase 2 — pendências (não iniciada)

Antes de promover `rv_ativos_staging`/`rv_historico_staging` para `rv_ativos`/`rv_historico`:

1. **Validação cruzada** — comparar COTAHIST vs. brapi nos tickers que ambos cobrem (preço, volume, negócios) por período; investigar a variação de contagem de ativos por dia.
2. **Resolver `ETF_OU_FUNDO`** — critério definitivo antes do campo `tipo` virar fonte de verdade.
3. **Decidir escopo do universo exposto** — manter curadoria de ~30 tickers ou expor o universo completo do COTAHIST (implica paginação/busca server-side na API e frontend).
4. **Gaps de schema** — `setor`, `subsetor`, `market_cap`, `free_float` (hoje vêm do brapi `fundamental=true`) e `fechamento_adj` (ajustado por proventos — não existe no layout diário do COTAHIST) não têm fonte equivalente no COTAHIST. Decidir se ficam nulos para o universo novo ou se precisam de fonte complementar.
5. **Mecanismo de corte** — script de promoção com regra de precedência por `fonte` (coluna já preparada nas migrations 007/008); rodar em paralelo por 1–2 semanas antes de aposentar `rv_historico.py`.
6. **Simplificar `etl.yml`** — trocar as 6 janelas de descoberta por 1 cron único (mantendo fallback D-1), já que não existe horário fixo confiável.
7. **QA** — cenário de sanity check para o universo ampliado (não só os 8 tickers do smoke test).

## Referências

- `etl/cotahist.py` — ETL diário (staging), smoke test, classificação
- `etl/cotahist_backfill.py` — backfill anual (staging)
- `database/migrations/008_cotahist_staging.sql` — tabelas de staging + coluna `fonte`
- `database/migrations/009_cleanup_indice_redundante.sql` — remoção de índice duplicado
- `.github/workflows/etl.yml` — jobs `etl-cotahist-staging` (schedule) e `etl-cotahist-backfill` (manual)
