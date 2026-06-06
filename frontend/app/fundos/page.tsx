'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getFundos, getHistoricoFundo, type Fundo, type HistoricoFundo } from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

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
  const [fundos, setFundos] = useState<Fundo[]>([])
  const [selecionado, setSelecionado] = useState<Fundo | null>(null)
  const [historico, setHistorico] = useState<HistoricoFundo[]>([])
  const [loadingFundos, setLoadingFundos] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)

  useEffect(() => {
    getFundos()
      .then(r => {
        setFundos(r.data)
        if (r.data.length > 0) setSelecionado(r.data[0])
      })
      .finally(() => setLoadingFundos(false))
  }, [])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoFundo(selecionado.cnpj, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  const dadosGrafico = [...historico].reverse().map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
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
      <div>
        <h1 className="text-2xl font-semibold">Fundos de Investimento</h1>
        <p className="text-sm text-muted-foreground mt-1">Fonte: CVM — Instrução Normativa Diária</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lista de fundos */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fundos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingFundos ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {fundos.map(f => (
                  <button
                    key={f.cnpj}
                    onClick={() => setSelecionado(f)}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-accent ${selecionado?.cnpj === f.cnpj ? 'bg-accent' : ''}`}
                  >
                    <p className="font-medium leading-tight">{f.nome_abreviado ?? f.nome.slice(0, 40)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {f.classe_anbima && (
                        <Badge variant="secondary" className="text-xs">{f.classe_anbima}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{f.gestor ?? '—'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalhes + gráfico */}
        <div className="lg:col-span-2 space-y-4">
          {selecionado && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Valor da Cota</p>
                  <p className="text-lg font-semibold mt-1">{formatBRL(ultimaCota?.valor_cota ?? null)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Patrimônio Líquido</p>
                  <p className="text-lg font-semibold mt-1">{formatMilhoes(ultimaCota?.patrimonio_liq ?? null)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Retorno (período)</p>
                  <p className={`text-lg font-semibold mt-1 ${Number(retorno) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {retorno ? `${Number(retorno) >= 0 ? '+' : ''}${retorno}%` : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selecionado?.nome_abreviado ?? selecionado?.nome ?? '—'} — Evolução da cota
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
                  <LineChart data={dadosGrafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="data" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={v => v.toFixed(2)} domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(v: number) => [v.toFixed(6), 'Cota']}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="cota" stroke="#8b5cf6" strokeWidth={2} dot={false} />
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
