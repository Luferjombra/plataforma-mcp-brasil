'use client'

import { useEffect, useState, Suspense } from 'react'
import { useTheme } from 'next-themes'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchBar } from '@/components/SearchBar'
import { getIndicadores, type Indicador } from '@/lib/api'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const SERIES = ['ipca', 'selic', 'cdi', 'pib'] as const
type Serie = typeof SERIES[number]

const META: Record<Serie, { label: string; desc: string; color: string }> = {
  ipca:  { label: 'IPCA',  desc: 'Inflação oficial',       color: '#f59e0b' },
  selic: { label: 'SELIC', desc: 'Taxa básica de juros',   color: '#10b981' },
  cdi:   { label: 'CDI',   desc: 'Taxa interbancária',     color: '#8b5cf6' },
  pib:   { label: 'PIB',   desc: 'Variação % trimestral',  color: '#3b82f6' },
}

function TrendIcon({ value }: { value: number | null }) {
  if (value == null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
  if (value > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
  if (value < 0) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

function HeroCard({
  serie, data, active, onClick
}: {
  serie: Serie; data: Indicador[]; active: boolean; onClick: () => void
}) {
  const m = META[serie]
  const ultimo = data[0]
  const penultimo = data[1]
  const variacao = ultimo && penultimo ? ultimo.valor - penultimo.valor : null
  const varStr = variacao != null
    ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(2)} p.p.`
    : null

  const sparkData = [...data].reverse().slice(-12).map(d => ({ v: d.valor }))

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all duration-200 ${
        active
          ? 'border-primary shadow-md shadow-primary/10 bg-card'
          : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: m.color }}
              />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {m.label}
              </p>
            </div>
            {ultimo ? (
              <p className="text-3xl font-bold tabular-nums">
                {ultimo.valor.toFixed(2)}
                <span className="text-base font-normal text-muted-foreground ml-1">%</span>
              </p>
            ) : (
              <Skeleton className="h-9 w-24 mt-1" />
            )}
            <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
          </div>
          <div className="flex flex-col items-end gap-1 pt-0.5">
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              variacao == null ? 'text-muted-foreground bg-muted' :
              variacao >= 0 ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/60' :
              'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950/60'
            }`}>
              <TrendIcon value={variacao} />
              <span className="tabular-nums">{varStr ?? '—'}</span>
            </div>
          </div>
        </div>
        {sparkData.length > 2 && (
          <div className="mt-3 -mx-1 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={m.color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </button>
  )
}

function IndicadoresPageInner() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#6b7280' : '#9ca3af'
  const [dados, setDados] = useState<Record<Serie, Indicador[]>>({
    ipca: [], selic: [], cdi: [], pib: [],
  })
  const [serie, setSerie] = useState<Serie>('selic')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const results = await Promise.all(SERIES.map(s => getIndicadores(s, 120)))
        const next: Record<Serie, Indicador[]> = { ipca: [], selic: [], cdi: [], pib: [] }
        SERIES.forEach((s, i) => { next[s] = results[i].data })
        setDados(next)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const m = META[serie]
  const chartData = [...(dados[serie] || [])].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      month: 'short', year: '2-digit',
    }),
    valor: d.valor,
  }))

  const ultimoValor = dados[serie][0]?.valor
  const dataRef = dados[serie][0]?.data
    ? new Date(dados[serie][0].data + 'T00:00:00').toLocaleDateString('pt-BR')
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indicadores Macro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Banco Central do Brasil · BCB-SGS
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <SearchBar placeholder="Buscar ativo, título ou fundo..." />
          {dataRef && (
            <div className="text-right whitespace-nowrap">
              <p className="text-xs text-muted-foreground">Atualizado</p>
              <p className="text-sm font-medium">{dataRef}</p>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SERIES.map(s => <Skeleton key={s} className="h-36 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SERIES.map(s => (
            <HeroCard
              key={s}
              serie={s}
              data={dados[s]}
              active={serie === s}
              onClick={() => setSerie(s)}
            />
          ))}
        </div>
      )}

      {!loading && dados.selic[0] && dados.ipca[0] && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Juro Real (SELIC − IPCA)
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  SELIC {dados.selic[0].valor.toFixed(2)}%
                </span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  IPCA {dados.ipca[0].valor.toFixed(2)}%
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min((dados.selic[0].valor / 20) * 100, 100)}%` }}
                />
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-amber-500 opacity-60"
                  style={{ width: `${Math.min((dados.ipca[0].valor / 20) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xl font-bold tabular-nums ${
                dados.selic[0].valor - dados.ipca[0].valor >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {(dados.selic[0].valor - dados.ipca[0].valor).toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground">juro real</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-semibold">
              Histórico — <span style={{ color: m.color }}>{m.label}</span>
            </h2>
            {ultimoValor != null && (
              <p className="text-2xl font-bold tabular-nums mt-0.5">
                {ultimoValor.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground ml-1">% a.a.</span>
              </p>
            )}
          </div>
          <Tabs value={serie} onValueChange={v => setSerie(v as Serie)}>
            <TabsList className="h-8">
              {SERIES.map(s => (
                <TabsTrigger key={s} value={s} className="text-xs px-3 h-7">
                  {META[s].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="px-2 pb-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${serie}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={m.color} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="data"
                  tick={{ fontSize: 10, fill: tickColor }}
                  interval={Math.floor(chartData.length / 6)}
                  stroke="transparent"
                  tickLine={false}
                  height={28}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: tickColor }}
                  stroke="transparent"
                  tickFormatter={v => `${v.toFixed(1)}%`}
                  domain={['auto', 'auto']}
                  width={52}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [
                    typeof v === 'number' ? `${v.toFixed(2)}%` : '—',
                    m.label,
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
                  dataKey="valor"
                  stroke={m.color}
                  strokeWidth={2}
                  fill={`url(#grad-${serie})`}
                  dot={false}
                  activeDot={{ r: 4, fill: m.color, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

export default function IndicadoresPage() {
  return (
    <Suspense>
      <IndicadoresPageInner />
    </Suspense>
  )
}
