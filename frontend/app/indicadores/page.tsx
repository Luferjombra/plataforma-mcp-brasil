'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getIndicadores, type Indicador } from '@/lib/api'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const SERIES = ['ipca', 'selic', 'cdi', 'pib'] as const
type Serie = typeof SERIES[number]

const LABELS: Record<Serie, string> = {
  ipca: 'IPCA',
  selic: 'SELIC',
  cdi: 'CDI',
  pib: 'PIB',
}

const COLORS: Record<Serie, string> = {
  ipca: '#3b82f6',
  selic: '#10b981',
  cdi: '#8b5cf6',
  pib: '#f59e0b',
}

const DESCRICOES: Record<Serie, string> = {
  ipca: 'Inflação oficial do Brasil',
  selic: 'Taxa básica de juros',
  cdi: 'Certificado de depósito interbancário',
  pib: 'Variação % trimestral',
}

function MetricCard({ serie, data }: { serie: Serie; data: Indicador[] }) {
  const ultimo = data[0]
  const penultimo = data[1]
  const variacao = ultimo && penultimo ? (ultimo.valor - penultimo.valor).toFixed(2) : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {LABELS[serie]}
          </CardTitle>
          {variacao !== null && (
            <Badge variant={Number(variacao) >= 0 ? 'default' : 'destructive'} className="text-xs">
              {Number(variacao) >= 0 ? '+' : ''}{variacao}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {ultimo ? (
          <>
            <p className="text-2xl font-semibold">
              {ultimo.valor.toFixed(2)}
              <span className="text-sm font-normal text-muted-foreground ml-1">%</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(ultimo.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {DESCRICOES[serie]}
            </p>
          </>
        ) : (
          <Skeleton className="h-8 w-24" />
        )}
      </CardContent>
    </Card>
  )
}

export default function IndicadoresPage() {
  const [dados, setDados] = useState<Record<Serie, Indicador[]>>({ ipca: [], selic: [], cdi: [], pib: [] })
  const [serieSelecionada, setSerieSelecionada] = useState<Serie>('ipca')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      try {
        const resultados = await Promise.all(
          SERIES.map(s => getIndicadores(s, 120))
        )
        const novo: Record<Serie, Indicador[]> = { ipca: [], selic: [], cdi: [], pib: [] }
        SERIES.forEach((s, i) => { novo[s] = resultados[i].data })
        setDados(novo)
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [])

  const dadosGrafico = [...(dados[serieSelecionada] || [])].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    valor: d.valor,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Indicadores Econômicos</h1>
        <p className="text-sm text-muted-foreground mt-1">Fonte: Banco Central do Brasil (BCB-SGS)</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SERIES.map(s => (
          <MetricCard key={s} serie={s} data={dados[s]} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Histórico</CardTitle>
            <Tabs value={serieSelecionada} onValueChange={v => setSerieSelecionada(v as Serie)}>
              <TabsList>
                {SERIES.map(s => (
                  <TabsTrigger key={s} value={s} className="text-xs">
                    {LABELS[s]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="data"
                  tick={{ fontSize: 10 }}
                  interval={Math.floor(dadosGrafico.length / 6)}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={v => `${v.toFixed(1)}%`}
                  domain={['auto', 'auto']}
                  width={48}
                />
                <Tooltip
                  formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)}%` : '—', LABELS[serieSelecionada]]}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke={COLORS[serieSelecionada]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
