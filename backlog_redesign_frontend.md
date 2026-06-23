# Backlog — Redesign Frontend (Clarity)

_Análise realizada em 2026-06-23. Design: Handoff "Clarity" (fundo escuro, Newsreader + Inter, tokens semânticos)._

---

## Resumo executivo

| Métrica | Valor |
|---|---|
| Telas no design | 7 + mobile (14 variantes) |
| Código frontend atual | ~1.800 linhas (páginas + componentes) |
| Componentes novos a criar | 14 |
| Páginas a reescrever | 7 |
| **Esforço total estimado** | **70–80h** |
| Sprints sugeridos | 3 × 1 semana |

---

## O que já existe e pode ser reusado

| Item | Status | Reuso |
|---|---|---|
| Next.js 16 + React 19 + Tailwind 4 | ✅ | 100% — mesmo stack |
| shadcn/ui (button, badge, card, tabs, skeleton) | ✅ | Adaptação parcial (~50%) |
| next-themes (dark mode toggle) | ✅ | Manter, adaptar tokens |
| Recharts 3 | ✅ | Manter para gráficos principais; sparklines viram SVG |
| Lucide React (ícones) | ⚠️ | Design usa só unicode — pode manter para ações |
| Lógica de fetch / hooks de API | ✅ | 100% — só muda a camada visual |
| Estrutura de rotas (app/) | ✅ | Mantém `/`, `/indicadores`, `/rv`, `/rf`, `/fundos`, `/copilot`, `/status` |

---

## Componentes novos a criar

| Componente | Complexidade | Esforço |
|---|---|---|
| `<Sparkline />` — SVG inline 120×40px com área e dot | Baixa | 2h |
| `<LineChart />` — SVG com eixos, gridlines, área | Média | 3h |
| `<OverlayChart />` — 3 séries sobrepostas (Renda Fixa) | Média | 2h |
| `<KPICard />` — label + valor Newsreader + chip + sparkline + fonte | Média | 2h |
| `<Chip />` — up/down/flat com cor semântica | Baixa | 1h |
| `<GaugeMeta />` — barra de meta de inflação com marcador | Média | 2h |
| `<ModuleCard />` — card de módulo com tag + hover | Baixa | 1h |
| `<EventCard />` — data box + label urgência âmbar | Baixa | 1h |
| `<SourceTag />` — BCB/B3/CVM/TD badge accent | Baixa | 0.5h |
| `<MobileTabBar />` — tab bar inferior (4 itens) | Baixa | 2h |
| `<TerminalLog />` — fundo #0a0e14, IBM Plex Mono, cores por tipo | Média | 2h |
| `<SkeletonShimmer />` — shimmer animado para estados de loading | Baixa | 1.5h |
| `<ErrorState />` + `<EmptyState />` — estados de dado | Baixa | 1.5h |
| Header redesenhado — logo M + nav + LIVE badge + CTA | Média | 3h |
| **Total componentes** | | **~24h** |

---

## Páginas a reescrever

### 1. Home / Dashboard — 10h
**Atual:** 415 linhas, cards básicos sem hero  
**Novo:** Hero editorial + 4 KPI cards + grid de módulos + Juro Real + Gauge + Próximos Eventos

Subtarefas:
- [ ] Hero: eyebrow + H1 Newsreader 52px + parágrafo + trust badges (BCB, CVM, B3, IBGE, TD)
- [ ] Seção "Indicadores-chave": grid 4 colunas com KPICard
- [ ] Grid módulos 2×2: Macro, B3, Tesouro Direto, CVM
- [ ] Painel Macro: Juro Real + GaugeMeta lado a lado
- [ ] Card "Próximos Eventos": datas + urgência âmbar
- [ ] Responsivo mobile: hero empilhado, KPIs 2×2

### 2. Indicadores — 6h
**Atual:** 317 linhas, exibe valores sem sidebar interativa  
**Novo:** Sidebar 240px com 4 indicadores clicáveis + área de gráfico + seletor de range + tabela

Subtarefas:
- [ ] Sidebar: lista clicável, item ativo com accent-soft
- [ ] Cabeçalho: número grande Newsreader + chip + referência
- [ ] LineChart com seletor 3M/6M/12M (re-corta a série)
- [ ] Tabela: thead uppercase, td tabular-nums, cor semântica na variação
- [ ] Card de fonte (BCB/IBGE) na sidebar

### 3. Renda Variável — 8h
**Atual:** /rv/ (tamanho desconhecido, provavelmente básico)  
**Novo:** Sidebar 300px com lista de ativos + tabs Todas/Ibovespa/FIIs + área principal com gráfico + stats

Subtarefas:
- [ ] Sidebar: lista com ticker, nome, preço, chip, sparkline 70×28px
- [ ] Item ativo: border-left 3px accent + fundo accent-soft
- [ ] Área principal: tag ticker + preço Newsreader grande + timestamp
- [ ] LineChart com seletor 5D/1M/3M/6M/1A
- [ ] Grid 4 cards: Abertura, Máxima, Mínima, Volume
- [ ] Mobile: layout empilhado, scroll na lista

### 4. Renda Fixa — 6h
**Atual:** /rf/ (básico)  
**Novo:** OverlayChart 3 séries + 3 cards indexador + tabela unificada

Subtarefas:
- [ ] OverlayChart: 3 polylines sobrepostas (IPCA+, Pré, Selic) com cores semânticas
- [ ] Legenda: traço colorido + label + taxa atual
- [ ] 3 cards indexador (IPCA+ verde, Pré azul, Selic âmbar)
- [ ] Tabela: Título · Indexador · Taxa · PU · Vencimento · Risco · CTA "Simular"

### 5. Fundos — 5h
**Atual:** 257 linhas, lista básica  
**Novo:** Heading "40 mil fundos" + busca + filtros de tipo (chips) + grid 4 colunas de cards

Subtarefas:
- [ ] Filtros: chips clicáveis por tipo (RF, Multimercado, Ações, Previdência, Crédito Privado)
- [ ] Card de fundo: tipo badge colorido + chip 1D + nome + CNPJ + cota + retorno 12M + PL + sparkline
- [ ] Grid 4 colunas desktop, 1 coluna mobile
- [ ] Cores por tipo de fundo (mapeamento definido no README)

### 6. Chat Finance — 8h
**Atual:** /copilot/ com 151 linhas, chat simples sem painel de dados  
**Novo:** Split 50/50 — painel de dados (gráfico + cards contexto) + painel de chat

Subtarefas:
- [ ] Layout split grid 1fr 1fr, altura 780px
- [ ] Painel esquerdo: LineChart do juro real + 2×2 cards contexto (SELIC, IPCA, Juro Real)
- [ ] Painel direito: área de mensagens (scroll) + input + sugestões de prompt
- [ ] Bolhas: IA (card borda) vs Usuário (navy)
- [ ] Badges de fonte referenciada nas respostas da IA
- [ ] Botão envio 44×44px navy com ↑

### 7. Status / ETL — 4h
**Atual:** /status/ (básico)  
**Novo:** 4 cards de métricas + grid 3 colunas por fonte + terminal log stream

Subtarefas:
- [ ] 4 KPI cards topo: uptime, requests, erros, latência
- [ ] Grid 3 colunas: 6 cards de fonte (BCB, IBGE, CVM, B3, TD, ANBIMA)
- [ ] Cada card: status badge (Online/Parcial/Erro) + endpoint monospace + métricas 2×2 + log preview
- [ ] TerminalLog: IBM Plex Mono, cores ✓/⚠/ℹ/padrão

---

## Design system (globals.css)

**Esforço: 3h**

- [ ] Substituir palette OKLch atual pelos tokens Clarity:
  ```css
  --color-bg: #f5f7fb    (light) / #0c1118 (dark)
  --color-card: #ffffff  (light) / #121a26 (dark)
  --color-navy: #13315c
  --color-accent: #1f6feb
  --color-up: #0f9d58
  --color-down: #d93838
  --color-amber: #b9770a
  ```
- [ ] Adicionar Google Fonts: Inter 400/500/600/700 + Newsreader opsz 6..72 400/500/600
- [ ] Variável `--font-display: 'Newsreader'` para títulos e KPIs
- [ ] Escala de sombras: `--shadow` e `--shadow-hover`
- [ ] Border-radius: `--radius: 14px`, `--radius-sm: 9px`, `--radius-xs: 6px`
- [ ] Sistema de espaçamento: `--gap: 16px`, `--card-pad: 22px`, `--page-x: 40px`
- [ ] Animação shimmer do skeleton

---

## Mobile (todas as páginas) — 8h

- [ ] Header 56px, logo 26px, sem nav — substituída por MobileTabBar
- [ ] MobileTabBar: 4 itens (Início, Ações, Fixa/Fundos, Chat), ativo = navy
- [ ] KPIs: grid 2×2 com Newsreader 26px
- [ ] Cards de fundos/ativos: 1 coluna
- [ ] Filtros de tipo: scroll horizontal (`overflow-x: auto`)
- [ ] Chat: bolhas max-width 80%, input full-width
- [ ] Eventos: máx 3 itens, badge "Xd" abreviado

---

## Estados de dado (todas as páginas) — 3h

Todo componente de API deve ter 4 estados:

| Estado | Implementação |
|---|---|
| Loading | SkeletonShimmer no espaço exato do dado |
| Erro | Ícone ! + "Não foi possível carregar" + data da última leitura + botão "↻ Tentar novamente" |
| Vazio | Ícone — + "Sem dados no período" + próxima divulgação |
| Carregado | UI normal |

---

## Riscos e decisões técnicas

| Risco | Decisão recomendada |
|---|---|
| Recharts vs SVG inline | **Manter Recharts** para gráficos complexos (Indicadores, RV, RF) e adaptar o estilo; SVG inline só para sparklines (simples, sem lib) |
| Newsreader não é padrão Next.js | Carregar via `next/font/google` (não `<link>`) para evitar flash de fonte |
| Tailwind 4 `@theme inline` | Os tokens Clarity vão como CSS variables em `globals.css` dentro de `@theme` — compatível |
| Dark mode default | Screenshots mostram dark como padrão — configurar `defaultTheme: "dark"` no ThemeProvider |
| Split layout Chat Finance 50/50 | Grid CSS nativo com `height: calc(100vh - 68px)` — sem lib adicional |

---

## Sequência de implementação

```
Sprint 1 (1 semana):
  Design system (globals.css, fontes, tokens)    3h
  Componentes base (Sparkline, Chip, KPICard,    8h
    SourceTag, SkeletonShimmer, Header)
  Home/Dashboard completo                        10h
  ─────────────────────────────────────────────  21h

Sprint 2 (1 semana):
  Indicadores                                    6h
  Renda Variável                                 8h
  Renda Fixa                                     6h
  ─────────────────────────────────────────────  20h

Sprint 3 (1 semana):
  Fundos                                         5h
  Chat Finance                                   8h
  Status/ETL                                     4h
  Mobile (todas as páginas)                      8h
  Estados de dado (erro/vazio/loading)           3h
  QA + polish + Vercel deploy                    5h
  ─────────────────────────────────────────────  33h
```

**Total: 74h | 3 semanas**

---

## Checklist de aceitação (DoD por tela)

- [ ] Pixel-match com o handoff nos 5 breakpoints (375, 768, 1024, 1280, 1440)
- [ ] Todos os 4 estados de dado implementados
- [ ] Dark mode como padrão, toggle funciona
- [ ] Dados reais da API (não mocks estáticos)
- [ ] Lighthouse performance > 80 no mobile
- [ ] TypeScript sem erros (`next build` limpo)
