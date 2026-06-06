'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getAtivos, getHistoricoRV, type Ativo, type Historico } from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatBilhoes(v: number | null) {
  if (v == null) return '—'
  return `R$ ${(v / 1e9).toFixed(1)}B`
}

export default function RVPage() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#9ca3af' : '#6b7280'
  const [ativos, setAtivos] = useState<Ativo[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [historico, setHistorico] = useState<Historico[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)

  useEffect(() => {
    getAtivos()
      .then(r => {
        setAtivos(r.data)
        if (r.data.length > 0) setSelecionado(r.data[0].ticker)
      })
      .finally(() => setLoadingAtivos(false))
  }, [])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoRV(selecionado, 252)
      .then(r => setHistorico(r.data))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    fechamento: d.fechamento,
  }))

  const primeiroFechamento = historico.length > 1 ? historico[historico.length - 1].fechamento : null
  const ultimoFechamento = historico.length > 0 ? historico[0].fechamento : null
  const retornoAno = primeiroFechamento && ultimoFechamento
    ? ((ultimoFechamento - primeiroFechamento) / primeiroFechamento * 100).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Renda Variável — B3</h1>
        <p className="text-sm text-muted-foreground mt-1">Fonte: Yahoo Finance · últimos 252 pregões</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tabela de ativos */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ativos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingAtivos ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {ativos.map(a => (
                  <button
                    key={a.ticker}
                    onClick={() => setSelecionado(a.ticker)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-accent ${selecionado === a.ticker ? 'bg-accent' : ''}`}
                  >
                    <div>
                      <span className="font-medium">{a.ticker}</span>
                      {a.status === 'delisted' && (
                        <Badge variant="secondary" className="ml-2 text-xs">delisted</Badge>
                      )}
                      <p className="text-xs text-muted-foreground">{a.setor}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatBilhoes(a.market_cap)}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selecionado ?? '—'}</CardTitle>
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">Último: <strong>{formatBRL(ultimoFechamento)}</strong></span>
                {retornoAno && (
                  <Badge variant={Number(retornoAno) >= 0 ? 'default' : 'destructive'}>
                    {Number(retornoAno) >= 0 ? '+' : ''}{retornoAno}% (ano)
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingChart ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dadosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="data" tick={{ fontSize: 10, fill: tickColor }} interval={30} stroke="hsl(var(--border))" tickLine={false} height={32} />
                  <YAxis tick={{ fontSize: 10, fill: tickColor }} stroke="hsl(var(--border))"
                    tickFormatter={v => `R$${v.toFixed(0)}`} domain={['auto', 'auto']} width={56} tickLine={false} />
                  <Tooltip
                    formatter={(v) => [typeof v === 'number' ? formatBRL(v) : '—', 'Fechamento']}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="fechamento" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
