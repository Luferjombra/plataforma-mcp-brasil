---
name: ui-ux-pro-max
description: >
  Design system e UX para a Plataforma MCP Brasil (Next.js + Tailwind + shadcn/ui).
  Use este skill quando o usuário pedir para criar ou revisar uma página, componente,
  layout, paleta de cores, tipografia, ou chart. Também dispare quando mencionar
  "design", "aparência", "layout", "componente", "página", "como vai ficar",
  "estilo", "dark mode", "responsivo", "dashboard", "gráfico" no contexto do projeto.
---

# UI/UX Pro Max — Plataforma MCP Brasil

Você é um designer de produto sênior especializado em dashboards financeiros.
O projeto usa **Next.js 15 + Tailwind CSS + shadcn/ui** com dark mode padrão.
Toda decisão de design deve equilibrar **densidade de informação** (dados financeiros
são densos) com **clareza** (usuário precisa tomar decisões rápidas).

---

## 1 — Design System do Projeto

### Paleta de cores (já estabelecida)

| Categoria | Cor | Classe Tailwind | Uso |
|---|---|---|---|
| Macro / Economia | Emerald | `text-emerald-600 dark:text-emerald-400` | indicadores macroeconômicos |
| Renda Variável | Blue | `text-blue-600 dark:text-blue-400` | ações, B3, histórico |
| Renda Fixa | Violet | `text-violet-600 dark:text-violet-400` | Tesouro, CDB, RF |
| Fundos | Amber | `text-amber-500 dark:text-amber-400` | fundos CVM, FIIs |
| Outros / Neutro | Gray | `text-gray-500 dark:text-gray-400` | sem categoria |
| Positivo / Alta | Green | `text-green-500` | ganho, valorização |
| Negativo / Queda | Red | `text-red-500` | perda, queda |
| Primário | (theme) | `text-primary` | ação principal, links |

**Background de badge por categoria:**
```tsx
// Padrão já usado no projeto — manter consistência
'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'  // Macro
'bg-blue-500/15 text-blue-600 dark:text-blue-400'           // Renda Variável
'bg-violet-500/15 text-violet-600 dark:text-violet-400'     // Renda Fixa
'bg-amber-500/15 text-amber-600 dark:text-amber-400'        // Fundos
'bg-gray-500/15 text-gray-500 dark:text-gray-400'           // Outros
```

### Tipografia

| Uso | Classes |
|---|---|
| Título de página | `text-2xl font-bold tracking-tight` |
| Subtítulo / label | `text-sm text-muted-foreground` |
| Valor numérico grande | `text-3xl font-bold tabular-nums` |
| Valor numérico inline | `text-sm font-mono tabular-nums` |
| Badge / tag | `text-[10px] font-bold uppercase tracking-wider` |
| Corpo de texto | `text-sm leading-relaxed` |

**Sempre usar `tabular-nums`** em valores financeiros — evita layout shift
quando os dígitos mudam (ex: -1.23% → +12.34%).

### Espaçamento e bordas

```tsx
// Card padrão do projeto
'p-4 rounded-lg border border-border bg-card'

// Card com hover (links, itens clicáveis)
'p-4 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all'

// Separação entre seções
'space-y-6'   // entre blocos maiores
'space-y-3'   // dentro de um bloco
'gap-3'       // grid de cards
```

---

## 2 — Layouts para Dashboards Financeiros

### Layout 3 painéis (padrão para páginas de dados)

```
┌─────────────────────────────────────────────────┐
│  Header: título + subtitle + ação principal      │
├─────────────────┬───────────────────────────────┤
│  Painel A       │  Painel B                      │
│  (formulário /  │  (tabela / lista)              │
│   filtros)      │                                │
│  col-span-1     │  col-span-2                    │
├─────────────────┴───────────────────────────────┤
│  Painel C — Resumo / Chart                       │
│  (métricas, gráfico, comparativo)               │
└─────────────────────────────────────────────────┘
```

```tsx
<div className="space-y-6">
  {/* Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <IconeRelevante className="h-6 w-6" /> Título da Página
      </h1>
      <p className="text-sm text-muted-foreground mt-0.5">Descrição curta</p>
    </div>
    <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-accent transition">
      Ação Principal
    </button>
  </div>

  {/* Grid 3 colunas */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div className="lg:col-span-1">{/* Painel A */}</div>
    <div className="lg:col-span-2">{/* Painel B */}</div>
  </div>

  {/* Painel C — largura total */}
  <div>{/* Resumo / Chart */}</div>
</div>
```

### Layout de KPI cards (métricas de topo)

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {metricas.map(m => (
    <div key={m.label} className="p-4 rounded-lg border border-border bg-card">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${m.positivo ? 'text-green-500' : 'text-red-500'}`}>
        {m.valor}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{m.subtexto}</p>
    </div>
  ))}
</div>
```

---

## 3 — Componentes de Chart para Dados Financeiros

O projeto usa **Recharts** (já disponível via shadcn/ui). Use conforme o tipo de dado:

### 3.1 — Série histórica de preços (LineChart)

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

<ResponsiveContainer width="100%" height={240}>
  <LineChart data={historico}>
    <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} />
    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
           tickFormatter={v => `R$${v.toFixed(0)}`} />
    <Tooltip
      formatter={(v: number) => [`R$ ${v.toFixed(2)}`, 'Fechamento']}
      labelFormatter={l => `Data: ${l}`}
      contentStyle={{ fontSize: 12, borderRadius: 8 }}
    />
    <Line type="monotone" dataKey="fechamento"
          stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

### 3.2 — Comparativo de rentabilidade (AreaChart com múltiplas séries)

```tsx
// Carteira vs CDI vs IBOV
<AreaChart data={comparativo}>
  <Area dataKey="carteira" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
  <Area dataKey="cdi"      stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
  <Area dataKey="ibov"     stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
</AreaChart>
```

### 3.3 — Distribuição de portfólio (PieChart / Donut)

```tsx
// Alocação por ativo ou classe
<PieChart>
  <Pie data={alocacao} dataKey="valor" nameKey="ticker"
       innerRadius={60} outerRadius={90} paddingAngle={2}>
    {alocacao.map((_, i) => (
      <Cell key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
    ))}
  </Pie>
  <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} />
</PieChart>

const CORES_GRAFICO = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280']
```

### 3.4 — Barras de indicadores macroeconômicos (BarChart)

```tsx
// SELIC histórica mensal
<BarChart data={indicadores}>
  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
  <XAxis dataKey="data" tick={{ fontSize: 10 }} />
  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
</BarChart>
```

---

## 4 — Página `/carteira` — Especificação (Épico A.4)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  💼 Minha Carteira              [+ Adicionar Posição]         │
│  Rastreamento de performance com métricas profissionais       │
├──────────────────┬───────────────────────────────────────────┤
│  FORM            │  TABELA DE POSIÇÕES                        │
│  Ticker          │  Ticker | Qtd | Preço Médio | Atual | P&L │
│  Quantidade      │  PETR4  | 100 | R$38,00    | R$41  | +7.8%│
│  Preço médio     │  VALE3  |  50 | R$62,00    | R$58  | -6.5%│
│  Tipo (ação/FII) │  ...                                       │
│  [Adicionar]     │                           Total: R$ 9.850  │
├──────────────────┴───────────────────────────────────────────┤
│  RESUMO DE PERFORMANCE                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ P&L Total│ │ Rent.    │ │ vs CDI   │ │ vs IBOV  │        │
│  │ +R$1.250 │ │ +8,3%    │ │ +2,1pp   │ │ +3,5pp   │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                               │
│  [LineChart — valor carteira vs CDI vs IBOV no período]      │
│                                                               │
│  Métricas de Risco                                            │
│  Sharpe: 1.42 | Sortino: 1.87 | Calmar: 0.94 | Drawdown: -8.2%│
└──────────────────────────────────────────────────────────────┘
```

### Componentes necessários

```tsx
// Estrutura de arquivos
frontend/app/carteira/
  page.tsx           // página principal (3 painéis)
  
frontend/lib/
  carteira.ts        // tipos + helpers

// Tipos
interface Posicao {
  id: string
  ticker: string
  tipo: 'acao' | 'fii' | 'etf'
  quantidade: number
  preco_medio: number
  data_entrada: string
}

interface MetricasCarteira {
  pl_total: number
  rentabilidade_pct: number
  vs_cdi_pp: number        // diferença em pontos percentuais
  vs_ibov_pp: number
  sharpe: number | null
  sortino: number | null
  calmar: number | null
  drawdown_max: number | null
  win_rate: number | null
}
```

### Formatação de valores financeiros (helpers)

```tsx
// frontend/lib/carteira.ts
export const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtPct = (v: number, casas = 2) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(casas)}%`

export const fmtPP = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`

export const corPL = (v: number) =>
  v >= 0 ? 'text-green-500' : 'text-red-500'
```

---

## 5 — Estados de UI obrigatórios

Todo componente de dados deve implementar os 4 estados:

```tsx
// 1. Loading skeleton
{loading && (
  <div className="h-32 rounded-lg border border-border bg-card animate-pulse" />
)}

// 2. Erro
{erro && (
  <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
    {erro}
  </div>
)}

// 3. Vazio (sem dados)
{!loading && dados.length === 0 && (
  <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
    Nenhum dado encontrado. {/* mensagem contextual */}
  </div>
)}

// 4. Dados carregados
{dados.length > 0 && (/* renderizar dados */)}
```

---

## 6 — Checklist de qualidade de UI

Antes de considerar um componente/página pronto:

```
[ ] Dark mode funciona? (testar com prefers-color-scheme: dark)
[ ] Mobile responsivo? (grid colapsa corretamente em < 768px)
[ ] Valores numéricos usam tabular-nums?
[ ] Moeda formatada como R$ X.XXX,XX (locale pt-BR)?
[ ] Porcentagem com sinal explícito (+X% / -X%)?
[ ] P&L positivo = verde, negativo = vermelho?
[ ] Estados loading/erro/vazio implementados?
[ ] Ação destrutiva (deletar posição) pede confirmação?
[ ] Chart tem tooltip com valores formatados?
[ ] Acessibilidade: botões têm texto descritivo (não só ícone)?
```
