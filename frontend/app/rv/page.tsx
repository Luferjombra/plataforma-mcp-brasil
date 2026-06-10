'use client'

import { useEffect, useState, Suspense } from 'react'
import { useTheme } from 'next-themes'
import { useSearchParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchBar } from '@/components/SearchBar'
import { getAtivos, getHistoricoRV, type Ativo, type Historico } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, Building2, Landmark, Minus } from 'lucide-react'
import { formatBRL as brl, formatCap as cap } from '@/lib/format'

const SETOR_COLORS: Record<string, string> = {
  'Petróleo e Gás': '#f97316',
  'Mineração': '#84cc16',
  'Financeiro': '#3b82f6',
  'Indústria': '#8b5cf6',
  'Serviços': '#06b6d4',
  'Varejo': '#ec4899',
  'Consumo': '#f59e0b',
  'Papel e Celulose': '#22c55e',
  'Saúde': '#ef4444',
  'Energia': '#eab308',
  'Telecomunicações': '#6366f1',
  'Fundos Imobiliários': '#14b8a6',
}

function VarBadge({ v, size = 'md' }: { v: number | null; size?: 'sm' | 'md' }) {
  if (v == null) return <span className="text-xs text-muted-foreground tabular-nums">—</span>
  const pos = v >= 0
  const cls = size === 'sm'
    ? `inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1 py-0.5 rounded ${pos ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/60' : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950/60'}`
    : `inline-flex items-center gap-1 text-sm font-bold tabular-nums px-2 py-0.5 rounded-md ${pos ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/60' : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950/60'}`
  return (
    <span className={cls}>
      {pos ? <TrendingUp className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} /> : <TrendingDown className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />}
      {pos ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

/* ── stat card ───────────────────────────────────────────── */
function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums tracking-tight ${accent ?? ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

/* ── main ────────────────────────────────────────────────── */
function RVPageInner() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#6b7280' : '#9ca3af'
  const searchParams = useSearchParams()
  const tickerParam = searchParams.get('ticker')

  const [ativos, setAtivos] = useState<Ativo[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [historico, setHistorico] = useState<Historico[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'acao' | 'fii'>('todos')

  useEffect(() => {
    getAtivos()
      .then(r => {
        setAtivos(r.data)
        const initial = tickerParam
          ? r.data.find(a => a.ticker === tickerParam.toUpperCase())?.ticker ?? r.data[0]?.ticker
          : r.data[0]?.ticker
        if (initial) setSelecionado(initial)
      })
      .finally(() => setLoadingAtivos(false))
  }, [tickerParam])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoRV(selecionado, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  /* sorted list: top gainers → top losers → no data */
  const ativosFiltrados = ativos
    .filter(a => {
      if (filtro === 'fii') return a.tipo === 'FII'
      if (filtro === 'acao') return a.tipo !== 'FII'
      return true
    })
    .sort((a, b) => {
      const av = a.var_dia_pct
      const bv = b.var_dia_pct
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })

  const ativoSelecionado = ativos.find(a => a.ticker === selecionado)
  const isFII = ativoSelecionado?.tipo === 'FII'

  /* chart data */
  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    fechamento: d.fechamento,
  }))

  const primFech = historico.length > 1 ? historico[historico.length - 1].fechamento : null
  const ultFech  = historico.length > 0 ? historico[0].fechamento : null
  const ret12m   = primFech && ultFech ? ((ultFech - primFech) / primFech * 100) : null
  const chartColor = (ativoSelecionado?.var_dia_pct ?? 0) >= 0 ? '#22c55e' : '#ef4444'

  const totalAcoes = ativos.filter(a => a.tipo !== 'FII').length
  const totalFIIs  = ativos.filter(a => a.tipo === 'FII').length

  return (
    <div className="space-y-5">

      {/* ── header ────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Renda Variável</h1>
          <p className="text-sm text-muted-foreground mt-0.5">B3 via brapi.dev · últimos 252 pregões</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <SearchBar placeholder="Buscar ticker ou fundo..." />
          <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
            {totalAcoes} ações · {totalFIIs} FIIs
          </span>
        </div>
      </div>

      {/* ── stat cards ────────────────────────────────────── */}
      {ativoSelecionado ? (
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Último preço"
            value={brl(ativoSelecionado.preco_atual ?? ultFech)}
            sub={ativoSelecionado.data_preco
              ? new Date(ativoSelecionado.data_preco + 'T00:00:00').toLocaleDateString('pt-BR')
              : 'fechamento'}
          />
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Variação hoje</p>
            <div className="mt-1"><VarBadge v={ativoSelecionado.var_dia_pct} /></div>
            <p className="text-[11px] text-muted-foreground mt-1">último pregão</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Retorno 12m</p>
            <div className="mt-1"><VarBadge v={ret12m} /></div>
            <p className="text-[11px] text-muted-foreground mt-1">vs. início do período</p>
          </div>
          <StatCard
            label="Market cap"
            value={cap(ativoSelecionado.market_cap) ?? '—'}
            sub={ativoSelecionado.setor}
          />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)}
        </div>
      )}

      {/* ── main grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* lista */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          <div className="flex gap-1.5">
            {(['todos', 'acao', 'fii'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filtro === f
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {f === 'acao' && <Building2 className="h-3 w-3" />}
                {f === 'fii' && <Landmark className="h-3 w-3" />}
                {f === 'todos' ? 'Todos' : f === 'acao' ? 'Ações' : 'FIIs'}
              </button>
            ))}
          </div>

          {/* separator: gainers / losers */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* column header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 border-b border-border bg-muted/40">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ativo</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Preço</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Var</span>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              {loadingAtivos ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {ativosFiltrados.map((a, idx) => {
                    const cor = SETOR_COLORS[a.setor] ?? '#6b7280'
                    const active = selecionado === a.ticker
                    const isFirstLoser = idx > 0
                      && (ativosFiltrados[idx - 1].var_dia_pct ?? -999) > 0
                      && (a.var_dia_pct ?? 0) <= 0

                    return (
                      <div key={a.ticker}>
                        {isFirstLoser && (
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30">
                            <TrendingDown className="h-3 w-3 text-red-500" />
                            <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">Maiores baixas</span>
                          </div>
                        )}
                        {idx === 0 && (a.var_dia_pct ?? 0) > 0 && (
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30">
                            <TrendingUp className="h-3 w-3 text-emerald-500" />
                            <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">Maiores altas</span>
                          </div>
                        )}
                        <button
                          onClick={() => setSelecionado(a.ticker)}
                          className={`w-full grid grid-cols-[1fr_auto_auto] gap-2 items-center px-4 py-2.5 text-left transition-colors ${
                            active ? 'bg-primary/8 dark:bg-primary/10 border-l-2 border-primary' : 'hover:bg-accent/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cor }} />
                            <div className="min-w-0">
                              <p className={`font-bold text-sm leading-tight ${active ? 'text-primary' : ''}`}>{a.ticker}</p>
                              <p className="text-[10px] text-muted-foreground truncate leading-tight">{a.setor}</p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {a.preco_atual != null ? brl(a.preco_atual) : '—'}
                          </span>
                          <VarBadge v={a.var_dia_pct} size="sm" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* chart */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card h-full">
            <div className="flex items-start justify-between px-5 pt-5 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg tracking-tight">{selecionado ?? '—'}</h2>
                  {ativoSelecionado && (
                    <span className="text-xs text-muted-foreground font-normal">{ativoSelecionado.nome}</span>
                  )}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isFII ? 'border-teal-500/40 text-teal-600 dark:text-teal-400' : 'border-border text-muted-foreground'}`}>
                    {isFII ? 'FII' : ativoSelecionado?.tipo ?? 'AÇÃO'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Histórico de fechamento ajustado · 252 pregões</p>
              </div>
              {ret12m != null && <VarBadge v={ret12m} />}
            </div>

            <div className="px-2 pb-4">
              {loadingChart ? (
                <Skeleton className="h-[300px] w-full" />
              ) : dadosGrafico.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <Minus className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Sem dados históricos</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dadosGrafico} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad-rv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 10, fill: tickColor }}
                      interval={30}
                      stroke="transparent"
                      tickLine={false}
                      height={28}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: tickColor }}
                      stroke="transparent"
                      tickFormatter={v => `R$${v.toFixed(0)}`}
                      domain={['auto', 'auto']}
                      width={60}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => [typeof v === 'number' ? brl(v) : '—', 'Fechamento']}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ fontWeight: 600, marginBottom: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="fechamento"
                      stroke={chartColor}
                      strokeWidth={2}
                      fill="url(#grad-rv)"
                      dot={false}
                      activeDot={{ r: 4, fill: chartColor, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RVPage() {
  return (
    <Suspense>
      <RVPageInner />
    </Suspense>
  )
}
