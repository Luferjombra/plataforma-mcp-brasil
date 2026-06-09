'use client'

import { useEffect, useState, Suspense } from 'react'
import { useTheme } from 'next-themes'
import { useSearchParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/SearchBar'
import { getTitulosRF, getHistoricoRF, type TituloRF, type HistoricoRF } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

const GRUPOS: Record<string, { cor: string; label: string }> = {
  SELIC: { cor: '#10b981', label: 'SELIC' },
  IPCA:  { cor: '#3b82f6', label: 'IPCA+' },
  PRE:   { cor: '#f59e0b', label: 'Pré-fixado' },
  IGPM:  { cor: '#8b5cf6', label: 'IGP-M+' },
  USD:   { cor: '#ec4899', label: 'Dólar+' },
}

function formatPct(v: number | null) {
  if (v == null) return '—'
  return `${v.toFixed(2)}% a.a.`
}

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function TaxaBadge({ indexador, taxa }: { indexador: string; taxa: number | null }) {
  const g = GRUPOS[indexador] ?? { cor: '#6b7280', label: indexador }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: `${g.cor}18`, color: g.cor }}
    >
      {formatPct(taxa)}
    </span>
  )
}

function RFPageInner() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#6b7280' : '#9ca3af'
  const searchParams = useSearchParams()
  const codigoParam = searchParams.get('codigo')

  const [titulos, setTitulos] = useState<TituloRF[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [historico, setHistorico] = useState<HistoricoRF[]>([])
  const [loadingTitulos, setLoadingTitulos] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)

  useEffect(() => {
    getTitulosRF()
      .then(r => {
        setTitulos(r.data)
        const initial = codigoParam
          ? r.data.find((t: TituloRF) => t.codigo === codigoParam)?.codigo ?? r.data[0]?.codigo
          : r.data[0]?.codigo
        if (initial) setSelecionado(initial)
      })
      .finally(() => setLoadingTitulos(false))
  }, [codigoParam])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoRF(selecionado, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  const dadosGrafico = [...historico].reverse().map((d: HistoricoRF) => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short',
    }),
    taxa: d.taxa_mercado,
    pu: d.pu_mercado,
  }))

  const tituloSel = titulos.find(t => t.codigo === selecionado)
  const cor = tituloSel ? (GRUPOS[tituloSel.indexador]?.cor ?? '#6b7280') : '#6b7280'
  const taxaInicio = historico.length > 1 ? historico[historico.length - 1].taxa_mercado : null

  const grupos = Object.keys(GRUPOS)
  const totalPorGrupo = grupos.reduce<Record<string, TituloRF[]>>((acc, g) => {
    acc[g] = titulos.filter(t => t.indexador === g)
    return acc
  }, {})
  const outros = titulos.filter(t => !grupos.includes(t.indexador))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Renda Fixa</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tesouro Direto · CDB · LCI · LCA
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <SearchBar placeholder="Buscar título ou indexador..." />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {titulos.length} títulos ativos
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Lista */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="max-h-[580px] overflow-y-auto">
              {loadingTitulos ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div>
                  {grupos.map(g => {
                    const lista = totalPorGrupo[g]
                    if (!lista?.length) return null
                    const cfg = GRUPOS[g]
                    return (
                      <div key={g}>
                        <div
                          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold sticky top-0 z-10"
                          style={{
                            background: `${cfg.cor}12`,
                            color: cfg.cor,
                            borderBottom: `1px solid ${cfg.cor}25`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: cfg.cor }}
                          />
                          {cfg.label}
                          <span className="ml-auto opacity-60 font-normal">{lista.length}</span>
                        </div>
                        <div className="divide-y divide-border/50">
                          {lista.map(t => {
                            const active = selecionado === t.codigo
                            return (
                              <button
                                key={t.codigo}
                                onClick={() => setSelecionado(t.codigo)}
                                className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                                  active ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent/50'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className={`font-medium text-xs leading-tight ${active ? 'text-primary' : ''}`}>
                                    {t.nome_display}
                                  </p>
                                  {t.data_vencimento && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      venc. {new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                                    </p>
                                  )}
                                </div>
                                <TaxaBadge indexador={t.indexador} taxa={t.taxa_atual} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {outros.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/40 border-b border-border/50">
                        Outros · {outros.length}
                      </div>
                      <div className="divide-y divide-border/50">
                        {outros.map(t => {
                          const active = selecionado === t.codigo
                          return (
                            <button
                              key={t.codigo}
                              onClick={() => setSelecionado(t.codigo)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                                active ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent/50'
                              }`}
                            >
                              <p className={`text-xs font-medium ${active ? 'text-primary' : ''}`}>
                                {t.nome_display}
                              </p>
                              <TaxaBadge indexador={t.indexador} taxa={t.taxa_atual} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detalhe */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {tituloSel && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Taxa atual</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: cor }}>
                  {formatPct(tituloSel.taxa_atual)}
                </p>
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {GRUPOS[tituloSel.indexador]?.label ?? tituloSel.indexador}
                </Badge>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">PU mercado</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatBRL(tituloSel.pu_atual)}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">por unidade</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Vencimento</p>
                <p className="text-sm font-semibold mt-1">
                  {tituloSel.data_vencimento
                    ? new Date(tituloSel.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{tituloSel.tipo_curto}</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card flex-1">
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold text-base">
                {tituloSel?.nome_display ?? '—'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Histórico de taxa · 252 dias úteis
                {tituloSel?.pu_atual != null && ` · PU atual ${formatBRL(tituloSel.pu_atual)}`}
              </p>
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
                      <linearGradient id="grad-rf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={cor} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={cor} stopOpacity={0} />
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
                      tickFormatter={v => `${v.toFixed(2)}%`}
                      domain={['auto', 'auto']}
                      width={56}
                      tickLine={false}
                    />
                    {taxaInicio != null && (
                      <ReferenceLine
                        y={taxaInicio}
                        stroke={cor}
                        strokeDasharray="4 4"
                        strokeOpacity={0.4}
                        label={{
                          value: `Início ${taxaInicio.toFixed(2)}%`,
                          position: 'insideTopRight',
                          fontSize: 10,
                          fill: cor,
                          fillOpacity: 0.7,
                        }}
                      />
                    )}
                    <Tooltip
                      formatter={(v) => [
                        typeof v === 'number' ? `${v.toFixed(2)}% a.a.` : '—',
                        'Taxa',
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
                      dataKey="taxa"
                      stroke={cor}
                      strokeWidth={2}
                      fill="url(#grad-rf)"
                      dot={false}
                      activeDot={{ r: 4, fill: cor, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
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

export default function RFPage() {
  return (
    <Suspense>
      <RFPageInner />
    </Suspense>
  )
}
