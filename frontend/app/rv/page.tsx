'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchBar } from '@/components/SearchBar'
import { getAtivos, getHistoricoRV, type Ativo, type Historico } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, Building2, Landmark } from 'lucide-react'

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatBilhoes(v: number | null) {
  if (v == null) return null
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(0)}M`
  return null
}

function ReturnBadge({ pct }: { pct: string | null }) {
  if (!pct) return null
  const n = Number(pct)
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${
      n >= 0
        ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/60'
        : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950/60'
    }`}>
      {n >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {n >= 0 ? '+' : ''}{pct}%
    </span>
  )
}

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

export default function RVPage() {
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

  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short',
    }),
    fechamento: d.fechamento,
  }))

  const primeiroFechamento = historico.length > 1 ? historico[historico.length - 1].fechamento : null
  const ultimoFechamento = historico.length > 0 ? historico[0].fechamento : null
  const retorno12m = primeiroFechamento && ultimoFechamento
    ? ((ultimoFechamento - primeiroFechamento) / primeiroFechamento * 100).toFixed(1)
    : null

  const ativoSelecionado = ativos.find(a => a.ticker === selecionado)
  const isFII = ativoSelecionado?.tipo === 'FII'

  const ativosFiltrados = ativos.filter(a => {
    if (filtro === 'fii') return a.tipo === 'FII'
    if (filtro === 'acao') return a.tipo !== 'FII'
    return true
  })

  const totalAcoes = ativos.filter(a => a.tipo !== 'FII').length
  const totalFIIs = ativos.filter(a => a.tipo === 'FII').length

  return (
    <div className="space-y-6">
      {/* Header com busca */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Renda Variável</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            B3 via brapi.dev · últimos 252 pregões
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <SearchBar placeholder="Buscar ticker ou fundo..." />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {totalAcoes} ações · {totalFIIs} FIIs
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
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

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="max-h-[540px] overflow-y-auto">
              {loadingAtivos ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {ativosFiltrados.map(a => {
                    const cor = SETOR_COLORS[a.setor] ?? '#6b7280'
                    const active = selecionado === a.ticker
                    return (
                      <button
                        key={a.ticker}
                        onClick={() => setSelecionado(a.ticker)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                          active ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: cor }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold text-sm ${active ? 'text-primary' : ''}`}>
                                {a.ticker}
                              </span>
                              {a.status === 'delisted' && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                  off
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">{a.setor}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {formatBilhoes(a.market_cap) && (
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatBilhoes(a.market_cap)}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          {ativoSelecionado && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Último preço</p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatBRL(ultimoFechamento)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">fechamento</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Retorno 12m</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <ReturnBadge pct={retorno12m} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">vs. início do período</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Setor</p>
                <p className="text-sm font-semibold mt-1 leading-tight">
                  {ativoSelecionado.setor}
                </p>
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {isFII ? 'FII' : ativoSelecionado.tipo}
                </Badge>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card flex-1">
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div>
                <h2 className="font-semibold text-base">
                  {selecionado ?? '—'}
                  {ativoSelecionado && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      {ativoSelecionado.nome}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Histórico de fechamento ajustado
                </p>
              </div>
              {retorno12m && <ReturnBadge pct={retorno12m} />}
            </div>
            <div className="px-2 pb-4">
              {loadingChart ? (
                <Skeleton className="h-64 w-full" />
              ) : dadosGrafico.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados históricos
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dadosGrafico} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad-rv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                      formatter={(v) => [
                        typeof v === 'number' ? formatBRL(v) : '—',
                        'Fechamento',
                      ]}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      labelStyle={{ fontWeight: 600, marginBottom: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="fechamento"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#grad-rv)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#3b82f6', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
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
