# Backlog — Redesign Frontend (Clarity)

_Análise realizada em 2026-06-23. Design: Handoff "Clarity" (fundo escuro, Newsreader + Inter, tokens semânticos)._
_Atualizado em 2026-06-24 — Sprints 1, 2, 3 concluídos._

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

### Status geral dos Sprints

| Sprint | Escopo | Status |
|--------|--------|--------|
| Sprint 1 | Design system + Componentes base + Home/Dashboard | ✅ Concluído |
| Sprint 2 | Indicadores + Renda Variável + Renda Fixa | ✅ Concluído |
| Sprint 3 | Fundos + Chat Finance + Status + Mobile + Estados de dado | ✅ Concluído |
| Polish | PageHeader component + refinamentos | 🔲 Pendente |

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

| Componente | Complexidade | Esforço | Status |
|---|---|---|---|
| `<Sparkline />` — SVG inline 120×40px com área e dot | Baixa | 2h | ✅ |
| `<LineChart />` — SVG com eixos, gridlines, área | Média | 3h | ✅ (Recharts integrado) |
| `<OverlayChart />` — 3 séries sobrepostas (Renda Fixa) | Média | 2h | ✅ |
| `<KPICard />` — label + valor Newsreader + chip + sparkline + fonte | Média | 2h | ✅ |
| `<Chip />` — up/down/flat com cor semântica | Baixa | 1h | ✅ (inline em page.tsx) |
| `<GaugeMeta />` — barra de meta de inflação com marcador | Média | 2h | ✅ (inline em page.tsx) |
| `<ModuleCard />` — card de módulo com tag + hover | Baixa | 1h | ✅ (inline em page.tsx) |
| `<EventCard />` — data box + label urgência âmbar | Baixa | 1h | ✅ (inline em page.tsx) |
| `<SourceTag />` — BCB/B3/CVM/TD badge accent | Baixa | 0.5h | ✅ (inline em pages) |
| `<MobileTabBar />` — tab bar inferior (4 itens) | Baixa | 2h | ✅ |
| `<TerminalLog />` — fundo #0a0e14, IBM Plex Mono, cores por tipo | Média | 2h | ✅ (inline em status/page.tsx) |
| `<SkeletonShimmer />` — shimmer animado para estados de loading | Baixa | 1.5h | ✅ (DataStates.tsx) |
| `<ErrorState />` + `<EmptyState />` — estados de dado | Baixa | 1.5h | ✅ (DataStates.tsx) |
| Header redesenhado — logo M + nav + LIVE badge + CTA | Média | 3h | ✅ (inline em page.tsx) |
| `<PageHeader />` — header reutilizável para páginas internas | Baixa | 1h | 🔲 Pendente |
| **Total componentes** | | **~25h** | |

---

## Páginas a reescrever

### 1. Home / Dashboard — 10h ✅ CONCLUÍDO

**Atual:** 415 linhas, cards básicos sem hero  
**Novo:** Hero editorial + 4 KPI cards + grid de módulos + Juro Real + Gauge + Próximos Eventos

Subtarefas:
- [x] Hero: eyebrow + H1 Newsreader 52px + parágrafo + trust badges (BCB, CVM, B3, IBGE, TD)
- [x] Seção "Indicadores-chave": grid 4 colunas com KPICard
- [x] Grid módulos 2×2: Macro, B3, Tesouro Direto, CVM
- [x] Painel Macro: Juro Real + GaugeMeta lado a lado
- [x] Card "Próximos Eventos": datas + urgência âmbar
- [x] Responsivo mobile: hero empilhado, KPIs 2×2

### 2. Indicadores — 6h ✅ CONCLUÍDO

**Atual:** 317 linhas, exibe valores sem sidebar interativa  
**Novo:** Sidebar 240px com 4 indicadores clicáveis + área de gráfico + seletor de range + tabela

Subtarefas:
- [x] Sidebar: lista clicável, item ativo com accent-soft
- [x] Cabeçalho: número grande Newsreader + chip + referência
- [x] LineChart com seletor 3M/6M/12M (re-corta a série)
- [x] Tabela: thead uppercase, td tabular-nums, cor semântica na variação
- [x] Card de fonte (BCB/IBGE) na sidebar

### 3. Renda Variável — 8h ✅ CONCLUÍDO

**Anterior:** básico  
**Novo:** Sidebar 300px com lista de ativos + tabs Todas/Ibovespa/FIIs + área principal com gráfico + stats

Subtarefas:
- [x] Sidebar: lista com ticker, nome, preço, chip, sparkline 70×28px
- [x] Item ativo: border-left 3px accent + fundo accent-soft
- [x] Área principal: tag ticker + preço Newsreader grande + timestamp
- [x] LineChart com seletor 5D/1M/3M/6M/1A
- [x] Grid 4 cards: Abertura, Máxima, Mínima, Volume
- [x] Mobile: layout empilhado, scroll na lista

### 4. Renda Fixa — 6h ✅ CONCLUÍDO

**Anterior:** básico  
**Novo:** OverlayChart 3 séries + 3 cards indexador + tabela unificada

Subtarefas:
- [x] OverlayChart: 3 polylines sobrepostas (IPCA+, Pré, Selic) com cores semânticas
- [x] Legenda: traço colorido + label + taxa atual
- [x] 3 cards indexador (IPCA+ verde, Pré azul, Selic âmbar)
- [x] Tabela: Título · Indexador · Taxa · PU · Vencimento · Risco · CTA "Simular"

### 5. Fundos — 5h ✅ CONCLUÍDO

**Anterior:** 257 linhas, lista básica  
**Novo:** Heading "40 mil fundos" + busca + filtros de tipo (chips) + grid 4 colunas de cards

Subtarefas:
- [x] Filtros: chips clicáveis por tipo (RF, Multimercado, Ações, Previdência, Crédito Privado)
- [x] Card de fundo: tipo badge colorido + chip 1D + nome + CNPJ + cota + retorno 12M + PL + sparkline
- [x] Grid 4 colunas desktop, 1 coluna mobile
- [x] Cores por tipo de fundo (mapeamento definido no README)

### 6. Chat Finance — 8h ✅ CONCLUÍDO

**Anterior:** /copilot/ com 151 linhas, chat simples sem painel de dados  
**Novo:** Split 50/50 — painel de dados (gráfico + cards contexto) + painel de chat

Subtarefas:
- [x] Layout split grid 1fr 1fr, altura 780px
- [x] Painel esquerdo: LineChart do juro real + 2×2 cards contexto (SELIC, IPCA, Juro Real)
- [x] Painel direito: área de mensagens (scroll) + input + sugestões de prompt
- [x] Bolhas: IA (card borda) vs Usuário (navy)
- [x] Badges de fonte referenciada nas respostas da IA
- [x] Botão envio 44×44px navy com ↑

### 7. Status / ETL — 4h ✅ CONCLUÍDO

**Anterior:** básico  
**Novo:** 4 cards de métricas + grid 3 colunas por fonte + terminal log stream

Subtarefas:
- [x] 4 KPI cards topo: uptime, requests, erros, latência
- [x] Grid 3 colunas: 6 cards de fonte (BCB, IBGE, CVM, B3, TD, ANBIMA)
- [x] Cada card: status badge (Online/Parcial/Erro) + endpoint monospace + métricas 2×2 + log preview
- [x] TerminalLog: IBM Plex Mono, cores ✓/⚠/ℹ/padrão

---

## Design system (globals.css) — 3h ✅ CONCLUÍDO

- [x] Substituir palette OKLch atual pelos tokens Clarity
- [x] Adicionar Google Fonts: Inter 400/500/600/700 + Newsreader opsz 6..72 400/500/600
- [x] Variável `--font-display: 'Newsreader'` para títulos e KPIs
- [x] Escala de sombras: `--cl-shadow` e hover
- [x] Border-radius: `--cl-radius: 14px`, `--cl-radius-sm: 9px`, `--cl-radius-xs: 6px`
- [x] Sistema de espaçamento: `--cl-gap: 16px`, `--cl-card-pad: 22px`, `--cl-page-x: 40px`
- [x] Animação shimmer do skeleton

---

## Mobile (todas as páginas) — 8h ✅ CONCLUÍDO

- [x] Header 56px, logo 26px, sem nav — substituída por MobileTabBar
- [x] MobileTabBar: 4 itens (Início, Ações, Fixa/Fundos, Chat), ativo = navy
- [x] KPIs: grid 2×2 com Newsreader 26px
- [x] Cards de fundos/ativos: 1 coluna
- [x] Filtros de tipo: scroll horizontal (`overflow-x: auto`)
- [x] Chat: bolhas max-width 80%, input full-width
- [x] Eventos: máx 3 itens, badge "Xd" abreviado

---

## Estados de dado (todas as páginas) — 3h ✅ CONCLUÍDO

Todo componente de API tem 4 estados implementados em `DataStates.tsx`:

| Estado | Implementação |
|---|---|
| Loading | SkeletonShimmer no espaço exato do dado ✅ |
| Erro | Ícone ! + "Não foi possível carregar" + data da última leitura + botão "↻ Tentar novamente" ✅ |
| Vazio | Ícone — + "Sem dados no período" + próxima divulgação ✅ |
| Carregado | UI normal ✅ |

---

## Polish — Pendente

### PageHeader component (1h) ✅ CONCLUÍDO
- [x] Criar `frontend/components/PageHeader.tsx` — header reutilizável para páginas internas
  - Props: `title`, `description`, `sourceBadge`, `action`
  - Estilo: título Newsreader 28px + descrição ink3 + badge accent-soft
- [x] Adicionar PageHeader em `/indicadores`, `/rv`, `/rf`, `/fundos`

---

## Riscos e decisões técnicas

| Risco | Decisão tomada |
|---|---|
| Recharts vs SVG inline | **Mantido Recharts** para gráficos complexos; SVG inline para sparklines ✅ |
| Newsreader não é padrão Next.js | Carregado via `next/font/google` ✅ |
| Tailwind 4 `@theme inline` | Tokens Clarity como CSS variables em `globals.css` ✅ |
| Dark mode default | `defaultTheme: "dark"` configurado no ThemeProvider ✅ |
| Split layout Chat Finance 50/50 | Grid CSS nativo com `height: calc(100vh - 68px)` ✅ |

---

## Sequência de implementação

```
Sprint 1 (1 semana):                                     ✅ CONCLUÍDO
  Design system (globals.css, fontes, tokens)    3h
  Componentes base (Sparkline, Chip, KPICard,    8h
    SourceTag, SkeletonShimmer, Header)
  Home/Dashboard completo                        10h
  ─────────────────────────────────────────────  21h

Sprint 2 (1 semana):                                     ✅ CONCLUÍDO
  Indicadores                                    6h
  Renda Variável                                 8h
  Renda Fixa                                     6h
  ─────────────────────────────────────────────  20h

Sprint 3 (1 semana):                                     ✅ CONCLUÍDO
  Fundos                                         5h
  Chat Finance                                   8h
  Status/ETL                                     4h
  Mobile (todas as páginas)                      8h
  Estados de dado (erro/vazio/loading)           3h
  QA + polish + Vercel deploy                    5h
  ─────────────────────────────────────────────  33h

Polish:                                                  🔲 PENDENTE
  PageHeader component                           1h
  Adicionar PageHeader às páginas internas       1h
  ─────────────────────────────────────────────  2h
```

**Total: 76h | 3 sprints completos + polish**

---

## Checklist de aceitação (DoD por tela)

- [x] Design system Clarity implementado (tokens, fontes, dark mode)
- [x] Todos os 4 estados de dado implementados (DataStates.tsx)
- [x] Dark mode como padrão, toggle funciona
- [x] Dados reais da API (não mocks estáticos)
- [x] PageHeader em todas as páginas internas (/indicadores, /rv, /rf, /fundos)
- [x] Lighthouse performance > 80 no mobile (home 93, /indicadores 95, /renda-fixa 89, /rv 83, /fundos 83)
- [x] TypeScript sem erros (`next build` limpo)
