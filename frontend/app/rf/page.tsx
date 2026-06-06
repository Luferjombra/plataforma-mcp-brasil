'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getTitulosRF, getHistoricoRF, type TituloRF, type HistoricoRF } from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
} from 'recharts'

// Grupo por indexador para exibição organizada
const GRUPOS: Record<string, { label: string; ordem: number }> = {
  SELIC: { label: 'Tesouro Selic', ordem: 1 },
  IPCA:  { label: 'Tesouro IPCA+',  ordem: 2 },
  PRE:   { label: 'Prefixado',      ordem: 3 },
  IGPM:  { label: 'IGP-M',          ordem: 4 },
  OTHER: { label: 'Outros',         ordem: 5 },
}

function formatPct(v: number | null) {
  if (v == null) return '—'
  return `${v.toFixed(2)}% a.a.`
}

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(v)
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function RendaFixaPage() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#9ca3af' : '#6b7280'

  const [titulos, setTitulos] = useState<TituloRF[]>([])
  const [selecionado, setSelecionado] = useState<TituloRF | null>(null)
  const [historico, setHistorico] = useState<HistoricoRF[]>([])
  const [loadingTitulos, setLoadingTitulos] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [dataRef, setDataRef] = useState<string | null>(null)

  useEffect(() => {
    getTitulosRF()
      .then(r => {
        setTitulos(r.data)
        setDataRef(r.data_referencia)
        if (r.data.length > 0) setSelecionado(r.data[0])
      })
      .finally(() => setLoadingTitulos(false))
  }, [])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoRF(selecionado.codigo, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  // Dados para o gráfico — invertidos (mais antigo primeiro)
  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      month: 'short',
      year: '2-digit',
    }),
    taxa: d.taxa_mercado,
    pu: d.pu_mercado,
  }))

  // Calcular variação da taxa no período
  const taxaAtual = historico[0]?.taxa_mercado ?? null
  const taxaInicio = historico[historico.length - 1]?.taxa_mercado ?? null
  const variacao = taxaAtual != null && taxaInicio != null
    ? (taxaAtual - taxaInicio).toFixed(2)
    : null

  // Agrupar títulos por indexador
  const grupos = titulos.reduce<Record<string, TituloRF[]>>((acc, t) => {
    const idx = t.indexador || 'OTHER'
    if (!acc[idx]) acc[idx] = []
    acc[idx].push(t)
    return acc
  }, {})

  const indexadoresOrdenados = Object.keys(grupos).sort(
    (a, b) => (GRUPOS[a]?.ordem ?? 9) - (GRUPOS[b]?.ordem ?? 9)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Renda Fixa — Tesouro Direto</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fonte: Tesouro Transparente · Taxas de{' '}
          {dataRef ? formatDate(dataRef) : '—'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lista de títulos */}
        <Card className="lg:col-span-1 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Títulos disponíveis</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[520px]">
            {loadingTitulos ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : titulos.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum título encontrado.
                <br />
                <span className="text-xs mt-1 block">
                  Execute <code>python etl/rf_tesouro.py</code> para carregar os dados.
                </span>
              </div>
            ) : (
              <div>
                {indexadoresOrdenados.map(idx => (
                  <div key={idx}>
                    {/* Cabeçalho do grupo */}
                    <div className="px-4 py-1.5 bg-muted/40 border-y border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {GRUPOS[idx]?.label ?? idx}
                      </p>
                    </div>

                    {/* Títulos do grupo */}
                    {grupos[idx].map(t => (
                      <button
                        key={t.codigo}
                        onClick={() => setSelecionado(t)}
                        className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-accent border-b border-border/50 last:border-0 ${
                          selecionado?.codigo === t.codigo ? 'bg-accent' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium leading-tight truncate">
                              {t.nome_display}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Venc. {formatDate(t.data_vencimento)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className="text-sm font-semibold tabular-nums"
                              style={{ color: t.cor }}
                            >
                              {t.taxa_atual != null ? `${t.taxa_atual.toFixed(2)}%` : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">a.a.</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Painel direito — métricas + gráfico */}
        <div className="lg:col-span-2 space-y-4">
          {/* Métricas */}
          {selecionado && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Taxa Atual</p>
                  <p
                    className="text-2xl font-semibold mt-1 tabular-nums"
                    style={{ color: selecionado.cor }}
                  >
                    {selecionado.taxa_atual != null
                      ? `${selecionado.taxa_atual.toFixed(2)}%`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">ao ano</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatDate(selecionado.data_vencimento)}
                  </p>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {selecionado.indexador}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Variação (período)</p>
                  <p
                    className={`text-lg font-semibold mt-1 tabular-nums ${
                      Number(variacao) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {variacao
                      ? `${Number(variacao) >= 0 ? '+' : ''}${variacao} p.p.`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">252 dias úteis</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Gráfico de histórico da taxa */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selecionado
                  ? `${selecionado.nome_display} — Taxa histórica`
                  : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingChart ? (
                <Skeleton className="h-64 w-full" />
              ) : dadosGrafico.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados históricos
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={dadosGrafico}
                    margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 10, fill: tickColor }}
                      interval="preserveStartEnd"
                      stroke="hsl(var(--border))"
                      tickLine={false}
                      height={32}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: tickColor }}
                      stroke="hsl(var(--border))"
                      tickFormatter={v => `${v.toFixed(1)}%`}
                      domain={['auto', 'auto']}
                      width={56}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => [
                        typeof v === 'number' ? formatPct(v) : '—',
                        'Taxa venda',
                      ]}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="taxa"
                      stroke={selecionado?.cor ?? '#3b82f6'}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
