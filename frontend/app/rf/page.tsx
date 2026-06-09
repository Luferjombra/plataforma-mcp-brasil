'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getTitulosRF, getHistoricoRF, type TituloRF, type HistoricoRF } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

const GRUPOS: Record<string, { label: string; ordem: number; color: string }> = {
  SELIC: { label: 'Tesouro Selic',               ordem: 1, color: '#10b981' },
  IPCA:  { label: 'Tesouro IPCA+',               ordem: 2, color: '#3b82f6' },
  IPCAS: { label: 'IPCA+ Juros Semestrais',       ordem: 3, color: '#6366f1' },
  PRE:   { label: 'Prefixado',                    ordem: 4, color: '#f59e0b' },
  PRES:  { label: 'Prefixado Juros Semestrais',   ordem: 5, color: '#f97316' },
  EDUCA: { label: 'Tesouro Educa+',               ordem: 6, color: '#8b5cf6' },
  OTHER: { label: 'Outros',                       ordem: 7, color: '#6b7280' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

function formatPct(v: number | null, decimals = 2) {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}% a.a.`
}

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(v)
}

export default function RendaFixaPage() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#6b7280' : '#9ca3af'

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

  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      month: 'short', year: '2-digit',
    }),
    taxa: d.taxa_mercado,
    pu: d.pu_mercado,
  }))

  const taxaAtual = historico[0]?.taxa_mercado ?? null
  const taxaInicio = historico[historico.length - 1]?.taxa_mercado ?? null
  const variacao = taxaAtual != null && taxaInicio != null
    ? Number((taxaAtual - taxaInicio).toFixed(2))
    : null
  const puAtual = historico[0]?.pu_mercado ?? null

  const grupos = titulos.reduce<Record<string, TituloRF[]>>((acc, t) => {
    const idx = t.indexador || 'OTHER'
    if (!acc[idx]) acc[idx] = []
    acc[idx].push(t)
    return acc
  }, {})

  const indexadoresOrdenados = Object.keys(grupos).sort(
    (a, b) => (GRUPOS[a]?.ordem ?? 9) - (GRUPOS[b]?.ordem ?? 9)
  )

  const cor = GRUPOS[selecionado?.indexador ?? 'OTHER']?.color ?? '#3b82f6'

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Renda Fixa — Tesouro Direto</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tesouro Transparente · taxas de {dataRef ? formatDate(dataRef) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {titulos.filter(t => t.ativo).length} títulos ativos
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1 rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Títulos disponíveis
            </p>
          </div>
          <div className="overflow-y-auto max-h-[560px]">
            {loadingTitulos ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div>
                {indexadoresOrdenados.map(idx => {
                  const g = GRUPOS[idx] ?? { label: idx, color: '#6b7280' }
                  return (
                    <div key={idx}>
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-y border-border/50">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: g.color }}
                        />
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {g.label}
                        </p>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {grupos[idx].length}
                        </span>
                      </div>
                      {grupos[idx].map(t => {
                        const active = selecionado?.codigo === t.codigo
                        return (
                          <button
                            key={t.codigo}
                            onClick={() => setSelecionado(t)}
                            className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-border/40 last:border-0 ${
                              active ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className={`font-semibold leading-tight truncate text-sm ${active ? 'text-primary' : ''}`}>
                                  {t.nome_display}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Venc. {formatDate(t.data_vencimento)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p
                                  className="text-sm font-bold tabular-nums"
                                  style={{ color: t.cor }}
                                >
                                  {t.taxa_atual != null ? `${t.taxa_atual.toFixed(2)}%` : '—'}
                                </p>
                                <p className="text-[10px] text-muted-foreground">a.a.</p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          {selecionado && (
            <div className="grid grid-cols-4 gap-3">
              <div
                className="col-span-2 rounded-xl border-2 p-4"
                style={{ borderColor: `${cor}40`, background: `${cor}08` }}
              >
                <p className="text-xs text-muted-foreground mb-1">Taxa de Venda</p>
                <p
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: cor }}
                >
                  {selecionado.taxa_atual != null
                    ? `${selecionado.taxa_atual.toFixed(2)}%`
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ao ano · {selecionado.indexador}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Vencimento</p>
                <p className="text-base font-bold leading-tight">
                  {formatDate(selecionado.data_vencimento)}
                </p>
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {selecionado.indexador}
                </Badge>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Var. 252d</p>
                {variacao != null ? (
                  <div className={`flex items-center gap-1 text-lg font-bold tabular-nums mt-1 ${
                    variacao >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {variacao >= 0
                      ? <TrendingUp className="h-4 w-4" />
                      : <TrendingDown className="h-4 w-4" />}
                    {variacao >= 0 ? '+' : ''}{variacao}
                  </div>
                ) : (
                  <p className="text-lg font-bold text-muted-foreground mt-1">—</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">p.p. no período</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card flex-1">
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div>
                <h2 className="font-semibold text-base">
                  {selecionado
                    ? `${selecionado.nome_display} — Taxa histórica`
                    : 'Selecione um título'}
                </h2>
                {taxaAtual != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Atual: <strong>{formatPct(taxaAtual)}</strong>
                    {puAtual != null && (
                      <span className="ml-2">· PU: <strong>{formatBRL(puAtual)}</strong></span>
                    )}
                  </p>
                )}
              </div>
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
                        <stop offset="5%" stopColor={cor} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={cor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 10, fill: tickColor }}
                      interval="preserveStartEnd"
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
                      formatter={(v, name) => [
                        name === 'taxa'
                          ? (typeof v === 'number' ? formatPct(v) : '—')
                          : (typeof v === 'number' ? formatBRL(v) : '—'),
                        name === 'taxa' ? 'Taxa venda' : 'PU venda',
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
                    {taxaInicio != null && (
                      <ReferenceLine
                        y={taxaInicio}
                        stroke={cor}
                        strokeDasharray="4 4"
                        strokeOpacity={0.4}
                      />
                    )}
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
