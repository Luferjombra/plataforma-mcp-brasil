'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchBar } from '@/components/SearchBar'
import { getFundos, getHistoricoFundo, type Fundo, type HistoricoFundo } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const NOME_CURTO: Record<string, string> = {
  "04.222.368/0001-55": "Verde PVT Multimercado",
  "04.311.271/0001-19": "PS Verde D1",
  "01.221.890/0001-24": "CSHG Verde FIC FIM",
  "03.536.908/0001-02": "CSHG Verde AM Star",
  "26.324.289/0001-98": "Kinea Infra I FIF",
  "26.324.298/0001-89": "Kinea Infra FIC",
  "00.947.958/0001-94": "Opportunity Market",
  "05.775.774/0001-08": "Alaska Poland",
}

function getNome(f: Fundo): string {
  return NOME_CURTO[f.cnpj] ?? f.nome_abreviado ?? f.nome
}

function formatBRL(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 6 }).format(v)
}

function formatMilhoes(v: number | null) {
  if (v == null) return '—'
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`
  return `R$ ${(v / 1e6).toFixed(1)}M`
}

export default function FundosPage() {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#6b7280' : '#9ca3af'
  const searchParams = useSearchParams()
  const cnpjParam = searchParams.get('cnpj')

  const [fundos, setFundos] = useState<Fundo[]>([])
  const [selecionado, setSelecionado] = useState<Fundo | null>(null)
  const [historico, setHistorico] = useState<HistoricoFundo[]>([])
  const [loadingFundos, setLoadingFundos] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)

  useEffect(() => {
    getFundos()
      .then(r => {
        setFundos(r.data)
        const initial = cnpjParam
          ? r.data.find(f => f.cnpj === cnpjParam) ?? r.data[0]
          : r.data[0]
        if (initial) setSelecionado(initial)
      })
      .finally(() => setLoadingFundos(false))
  }, [cnpjParam])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoFundo(selecionado.cnpj, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short',
    }),
    cota: d.valor_cota,
    pl: d.patrimonio_liq,
  }))

  const ultimaCota = historico[0]
  const primeiraCota = historico[historico.length - 1]
  const retorno = primeiraCota && ultimaCota
    ? ((ultimaCota.valor_cota - primeiraCota.valor_cota) / primeiraCota.valor_cota * 100).toFixed(2)
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fundos de Investimento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            CVM · Instrução Normativa Diária
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <SearchBar placeholder="Buscar fundo ou gestor..." />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {fundos.length} fundos
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Lista */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="max-h-[580px] overflow-y-auto">
              {loadingFundos ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {fundos.map(f => {
                    const active = selecionado?.cnpj === f.cnpj
                    return (
                      <button
                        key={f.cnpj}
                        onClick={() => setSelecionado(f)}
                        className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                          active ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent/50'
                        }`}
                      >
                        <p className={`font-medium text-xs leading-tight ${active ? 'text-primary' : ''}`}>
                          {getNome(f)}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {f.classe_anbima && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {f.classe_anbima}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground truncate">
                            {f.gestor ?? '—'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detalhe */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {selecionado && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Valor da Cota</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatBRL(ultimaCota?.valor_cota ?? null)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">última disponível</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Patrimônio Líquido</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatMilhoes(ultimaCota?.patrimonio_liq ?? null)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">consolidado</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Retorno período</p>
                <p className={`text-lg font-bold tabular-nums mt-1 ${
                  Number(retorno) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {retorno ? `${Number(retorno) >= 0 ? '+' : ''}${retorno}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">252 dias úteis</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card flex-1">
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold text-base">
                {selecionado ? getNome(selecionado) : '—'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Evolução da cota · Fonte CVM
                {selecionado?.classe_anbima && ` · ${selecionado.classe_anbima}`}
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
                      <linearGradient id="grad-fundos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                      tickFormatter={v => v.toFixed(2)}
                      domain={['auto', 'auto']}
                      width={60}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => [
                        typeof v === 'number' ? v.toFixed(6) : '—',
                        'Cota',
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
                      dataKey="cota"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#grad-fundos)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#8b5cf6', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
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
