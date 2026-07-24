'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  getAtivos, getHistoricoRV, getTitulosRF, getHistoricoRF,
  getFundos, getHistoricoFundo, getIndicadores,
  type Historico, type HistoricoRF, type HistoricoFundo, type Indicador,
} from '@/lib/api'
import { formatBRL, formatCota } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'todos' | 'rv' | 'rf' | 'indicadores' | 'fundos'

interface Ponto {
  data: string
  rv?: number
  rf?: number
  indicador?: number
  fundo?: number
}

interface UltimoValor {
  familia: string
  ativo: string
  valor: string
  variacao: number | null
  data: string
  cor: string
}

// ─── Config ──────────────────────────────────────────────────────────────────

const CORES = {
  rv:         '#3b82f6',
  rf:         '#10b981',
  indicador:  '#f59e0b',
  fundo:      '#8b5cf6',
}

const INDICADORES_SERIES = ['selic', 'ipca', 'cdi', 'pib']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizarData(iso: string) {
  return iso.slice(0, 10)
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => {
        const name = p.name
        let formatted = ''
        if (name === 'rv')        formatted = formatBRL(p.value)
        else if (name === 'fundo') formatted = formatCota(p.value)
        else                      formatted = p.value.toFixed(2) + '%'
        return (
          <div key={name} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground capitalize">{name}:</span>
            <span className="font-mono font-medium">{formatted}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tabela de últimos valores ────────────────────────────────────────────────

function TabelaUltimos({ itens }: { itens: UltimoValor[] }) {
  if (!itens.length) return null
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">Últimos valores</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {itens.map(item => {
            const VarIcon = item.variacao == null ? Minus : item.variacao > 0 ? TrendingUp : TrendingDown
            const varColor = item.variacao == null
              ? 'text-muted-foreground'
              : item.variacao > 0 ? 'text-[var(--cl-up)]' : 'text-[var(--cl-down)]'
            return (
              <div key={item.familia} className="rounded-lg border border-border p-3"
                style={{ borderLeftColor: item.cor, borderLeftWidth: 3 }}>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{item.familia.toUpperCase()}</Badge>
                  <span className="text-[10px] text-muted-foreground">{item.data}</span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{item.ativo}</p>
                <p className="font-mono font-bold text-base mt-1">{item.valor}</p>
                {item.variacao != null && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${varColor}`}>
                    <VarIcon className="h-3 w-3" />
                    <span>{item.variacao > 0 ? '+' : ''}{item.variacao.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardV1() {
  const [tab, setTab] = useState<Tab>('todos')

  // Selections
  const [rvTicker, setRvTicker]   = useState('PETR4')
  const [rfCodigo, setRfCodigo]   = useState('')
  const [indicSerie, setIndicSerie] = useState('selic')
  const [fundoCnpj, setFundoCnpj] = useState('')

  // Raw data arrays (sorted ascending by date)
  const [rvData,    setRvData]    = useState<Historico[]>([])
  const [rfData,    setRfData]    = useState<HistoricoRF[]>([])
  const [indicData, setIndicData] = useState<Indicador[]>([])
  const [fundoData, setFundoData] = useState<HistoricoFundo[]>([])

  // Available assets
  const [rvTickers,  setRvTickers]  = useState<string[]>([])
  const [rfCodigos,  setRfCodigos]  = useState<string[]>([])
  const [fundoCnpjs, setFundoCnpjs] = useState<{ cnpj: string; nome: string }[]>([])

  const [loading, setLoading] = useState(true)

  // Load asset lists once
  useEffect(() => {
    Promise.all([getAtivos(), getTitulosRF(), getFundos()]).then(([rv, rf, fundos]) => {
      const tickers = rv.data.filter(a => a.ativo).map(a => a.ticker)
      const codigos = rf.data.filter(t => t.ativo).map(t => t.codigo)
      const cnpjs   = fundos.data.slice(0, 20)
      setRvTickers(tickers)
      setRfCodigos(codigos)
      setFundoCnpjs(cnpjs.map(f => ({ cnpj: f.cnpj, nome: f.nome_abreviado ?? f.nome })))
      if (codigos.length) setRfCodigo(codigos[0])
      if (cnpjs.length)   setFundoCnpj(cnpjs[0].cnpj)
    }).catch(() => {})
  }, [])

  // Load historico when selections change
  useEffect(() => {
    if (!rvTicker && !rfCodigo && !fundoCnpj) return
    setLoading(true)
    const promises = [
      rvTicker  ? getHistoricoRV(rvTicker, 504)            : Promise.resolve(null),
      rfCodigo  ? getHistoricoRF(rfCodigo, 504)            : Promise.resolve(null),
      getIndicadores(indicSerie, 504),
      fundoCnpj ? getHistoricoFundo(fundoCnpj, 504)        : Promise.resolve(null),
    ] as const

    Promise.all(promises).then(([rv, rf, ind, fundo]) => {
      setRvData(rv?.data ?? [])
      setRfData(rf?.data ?? [])
      setIndicData(ind.data ?? [])
      setFundoData(fundo?.data ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rvTicker, rfCodigo, indicSerie, fundoCnpj])

  // Merge all series onto a unified date index
  const pontos = useMemo<Ponto[]>(() => {
    const map = new Map<string, Ponto>()
    const add = (data: string, key: keyof Omit<Ponto, 'data'>, val: number) => {
      const d = normalizarData(data)
      if (!map.has(d)) map.set(d, { data: d })
      const p = map.get(d)!
      if ((tab === 'todos' || tab === key as string) || key === 'rv' && tab === 'rv' || key === 'rf' && tab === 'rf') {
        p[key] = val
      }
    }

    if (tab === 'todos' || tab === 'rv')         rvData.forEach(h => { if (h.fechamento) add(h.data, 'rv', h.fechamento) })
    if (tab === 'todos' || tab === 'rf')         rfData.forEach(h => { if (h.taxa_compra != null) add(h.data, 'rf', h.taxa_compra) })
    if (tab === 'todos' || tab === 'indicadores') indicData.forEach(h => add(h.data, 'indicador', h.valor))
    if (tab === 'todos' || tab === 'fundos')      fundoData.forEach(h => add(h.data, 'fundo', h.valor_cota))

    return Array.from(map.values()).sort((a, b) => a.data.localeCompare(b.data))
  }, [rvData, rfData, indicData, fundoData, tab])

  // Últimos valores para cada família
  const ultimosValores = useMemo<UltimoValor[]>(() => {
    const result: UltimoValor[] = []

    if (rvData.length) {
      const last  = rvData[rvData.length - 1]
      const prev  = rvData.length > 1 ? rvData[rvData.length - 2] : null
      const var_  = prev ? ((last.fechamento - prev.fechamento) / prev.fechamento) * 100 : null
      result.push({ familia: 'rv', ativo: rvTicker, valor: formatBRL(last.fechamento), variacao: var_, data: last.data.slice(0, 10), cor: CORES.rv })
    }
    if (rfData.length) {
      const last = rfData[rfData.length - 1]
      const prev = rfData.length > 1 ? rfData[rfData.length - 2] : null
      const tc   = last.taxa_compra ?? 0
      const ptc  = prev?.taxa_compra ?? null
      const var_ = ptc != null ? ((tc - ptc) / Math.abs(ptc)) * 100 : null
      result.push({ familia: 'rf', ativo: rfCodigo, valor: tc.toFixed(2) + '%', variacao: var_, data: last.data.slice(0, 10), cor: CORES.rf })
    }
    if (indicData.length) {
      const last = indicData[indicData.length - 1]
      const prev = indicData.length > 1 ? indicData[indicData.length - 2] : null
      const var_ = prev ? ((last.valor - prev.valor) / Math.abs(prev.valor)) * 100 : null
      result.push({ familia: 'indicadores', ativo: indicSerie.toUpperCase(), valor: last.valor.toFixed(2) + '%', variacao: var_, data: last.data.slice(0, 10), cor: CORES.indicador })
    }
    if (fundoData.length) {
      const last = fundoData[fundoData.length - 1]
      const prev = fundoData.length > 1 ? fundoData[fundoData.length - 2] : null
      const var_ = prev ? ((last.valor_cota - prev.valor_cota) / prev.valor_cota) * 100 : null
      const nome = fundoCnpjs.find(f => f.cnpj === fundoCnpj)?.nome ?? fundoCnpj
      result.push({ familia: 'fundos', ativo: nome, valor: formatCota(last.valor_cota), variacao: var_, data: last.data.slice(0, 10), cor: CORES.fundo })
    }

    return result
  }, [rvData, rfData, indicData, fundoData, rvTicker, rfCodigo, indicSerie, fundoCnpj, fundoCnpjs])

  // Lines to show
  const showRv    = tab === 'todos' || tab === 'rv'
  const showRf    = tab === 'todos' || tab === 'rf'
  const showIndic = tab === 'todos' || tab === 'indicadores'
  const showFundo = tab === 'todos' || tab === 'fundos'

  // Selector rendering
  function Selector({ label, value, onChange, options }: {
    label: string
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
  }) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Painel Unificado — Timeline</h2>
          <p className="text-xs text-muted-foreground">Séries sobrepostas em escala dupla (R$ | %)</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {(tab === 'todos' || tab === 'rv') && rvTickers.length > 0 && (
            <Selector label="RV" value={rvTicker} onChange={setRvTicker}
              options={rvTickers.map(t => ({ value: t, label: t }))} />
          )}
          {(tab === 'todos' || tab === 'rf') && rfCodigos.length > 0 && (
            <Selector label="RF" value={rfCodigo} onChange={setRfCodigo}
              options={rfCodigos.map(c => ({ value: c, label: c }))} />
          )}
          {(tab === 'todos' || tab === 'indicadores') && (
            <Selector label="Indicador" value={indicSerie} onChange={setIndicSerie}
              options={INDICADORES_SERIES.map(s => ({ value: s, label: s.toUpperCase() }))} />
          )}
          {(tab === 'todos' || tab === 'fundos') && fundoCnpjs.length > 0 && (
            <Selector label="Fundo" value={fundoCnpj} onChange={setFundoCnpj}
              options={fundoCnpjs.map(f => ({ value: f.cnpj, label: f.nome.slice(0, 30) }))} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="rv">Renda Variável</TabsTrigger>
          <TabsTrigger value="rf">Renda Fixa</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="fundos">Fundos</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Chart */}
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="h-[380px] flex items-center justify-center text-sm text-muted-foreground">
              Carregando séries...
            </div>
          ) : pontos.length === 0 ? (
            <div className="h-[380px] flex items-center justify-center text-sm text-muted-foreground">
              Sem dados disponíveis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={pontos} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="data"
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v.slice(5)}
                  minTickGap={48}
                />
                {/* Left Y-axis: prices in BRL (RV and Fundos) */}
                <YAxis
                  yAxisId="preco"
                  orientation="left"
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => formatBRL(v)}
                  width={72}
                  hide={!showRv && !showFundo}
                />
                {/* Right Y-axis: rates in % (RF and Indicadores) */}
                <YAxis
                  yAxisId="taxa"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v.toFixed(2) + '%'}
                  width={56}
                  hide={!showRf && !showIndic}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      rv: rvTicker, rf: rfCodigo, indicador: indicSerie.toUpperCase(), fundo: 'Fundo',
                    }
                    return labels[value] ?? value
                  }}
                />
                {showRv && (
                  <Line
                    yAxisId="preco"
                    type="monotone"
                    dataKey="rv"
                    stroke={CORES.rv}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="rv"
                  />
                )}
                {showFundo && (
                  <Line
                    yAxisId="preco"
                    type="monotone"
                    dataKey="fundo"
                    stroke={CORES.fundo}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="fundo"
                  />
                )}
                {showRf && (
                  <Line
                    yAxisId="taxa"
                    type="monotone"
                    dataKey="rf"
                    stroke={CORES.rf}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="rf"
                  />
                )}
                {showIndic && (
                  <Line
                    yAxisId="taxa"
                    type="monotone"
                    dataKey="indicador"
                    stroke={CORES.indicador}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="indicador"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <TabelaUltimos itens={ultimosValores} />
    </div>
  )
}
