'use client'

import { useEffect, useState, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer'
import { SparklineCard } from '@/components/SparklineCard'
import { TrendingUp, Landmark, Activity, Briefcase } from 'lucide-react'
import {
  getAtivos, getHistoricoRV, getTitulosRF, getHistoricoRF,
  getFundos, getHistoricoFundo, getIndicadores,
  type Historico, type HistoricoRF, type HistoricoFundo, type Indicador,
} from '@/lib/api'
import { formatBRL, formatCota } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

type Familia = 'rv' | 'rf' | 'indicadores' | 'fundos'
type Periodo = '3m' | '6m' | '1a' | 'MAX'

interface DrawerState {
  aberto: boolean
  familia: Familia | null
}

interface PontoChart {
  data: string
  valor: number
}

// ─── Config ──────────────────────────────────────────────────────────────────

const CORES: Record<Familia, string> = {
  rv:         '#3b82f6',
  rf:         '#10b981',
  indicadores: '#f59e0b',
  fundos:     '#8b5cf6',
}

const PERIODOS: { label: string; value: Periodo }[] = [
  { label: '3m', value: '3m' },
  { label: '6m', value: '6m' },
  { label: '1a', value: '1a' },
  { label: 'MAX', value: 'MAX' },
]

const INDICADORES_SERIES = ['selic', 'ipca', 'cdi', 'pib']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function filtrarPeriodo(pontos: PontoChart[], periodo: Periodo): PontoChart[] {
  if (periodo === 'MAX' || !pontos.length) return pontos
  const dias = { '3m': 90, '6m': 180, '1a': 365 }[periodo]
  const limite = new Date()
  limite.setDate(limite.getDate() - dias)
  const limiteStr = limite.toISOString().slice(0, 10)
  return pontos.filter(p => p.data >= limiteStr)
}

function calcVariacao(pontos: PontoChart[]): number | null {
  if (pontos.length < 2) return null
  const ini = pontos[0].valor
  const fim = pontos[pontos.length - 1].valor
  return ((fim - ini) / Math.abs(ini)) * 100
}

// ─── Drawer Chart ─────────────────────────────────────────────────────────────

function DrawerChart({
  familia, ativo, pontos, formatter, cor,
}: {
  familia: Familia
  ativo: string
  pontos: PontoChart[]
  formatter: (v: number) => string
  cor: string
}) {
  const [periodo, setPeriodo] = useState<Periodo>('1a')
  const visiveis = filtrarPeriodo(pontos, periodo)
  const ultimo = visiveis[visiveis.length - 1]?.valor
  const variacao = calcVariacao(visiveis)

  return (
    <div className="space-y-4 pb-6">
      {/* Ativo selecionado e valor */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{familia.toUpperCase()}</p>
          <p className="text-sm font-semibold">{ativo}</p>
        </div>
        <div className="text-right">
          {ultimo != null && <p className="font-mono font-bold text-xl">{formatter(ultimo)}</p>}
          {variacao != null && (
            <p className={`text-xs ${variacao >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {variacao >= 0 ? '+' : ''}{variacao.toFixed(2)}% no período
            </p>
          )}
        </div>
      </div>

      {/* Period buttons */}
      <div className="flex gap-1.5">
        {PERIODOS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              periodo === p.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {visiveis.length > 1 ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={visiveis} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id={`grad-${familia}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={cor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="data" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} minTickGap={40} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={formatter} width={64} />
            <Tooltip
              formatter={(v) => [formatter(Number(v)), ativo]}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Area
              type="monotone"
              dataKey="valor"
              stroke={cor}
              strokeWidth={2}
              fill={`url(#grad-${familia})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
          Sem dados suficientes para o período
        </div>
      )}

      {/* Metrics table */}
      {visiveis.length > 0 && (() => {
        const valores = visiveis.map(p => p.valor)
        const max = Math.max(...valores)
        const min = Math.min(...valores)
        const media = valores.reduce((a, b) => a + b, 0) / valores.length
        return (
          <div className="grid grid-cols-3 gap-2 text-center border border-border rounded-lg p-3">
            {[['Máximo', formatter(max)], ['Mínimo', formatter(min)], ['Média', formatter(media)]].map(([label, val]) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-sm font-mono font-semibold">{val}</p>
              </div>
            ))}
            <div>
              <p className="text-[10px] text-muted-foreground">Início</p>
              <p className="text-sm font-mono">{visiveis[0].data.slice(5)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Fim</p>
              <p className="text-sm font-mono">{visiveis[visiveis.length - 1].data.slice(5)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Pontos</p>
              <p className="text-sm font-mono">{visiveis.length}</p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardV2() {
  const [drawer, setDrawer] = useState<DrawerState>({ aberto: false, familia: null })

  // Selections
  const [rvTicker,   setRvTicker]   = useState('PETR4')
  const [rfCodigo,   setRfCodigo]   = useState('')
  const [indicSerie, setIndicSerie] = useState('selic')
  const [fundoCnpj,  setFundoCnpj]  = useState('')

  // Raw data
  const [rvData,    setRvData]    = useState<Historico[]>([])
  const [rfData,    setRfData]    = useState<HistoricoRF[]>([])
  const [indicData, setIndicData] = useState<Indicador[]>([])
  const [fundoData, setFundoData] = useState<HistoricoFundo[]>([])

  // Available assets
  const [rvTickers,  setRvTickers]  = useState<string[]>([])
  const [rfCodigos,  setRfCodigos]  = useState<string[]>([])
  const [fundoCnpjs, setFundoCnpjs] = useState<{ cnpj: string; nome: string }[]>([])

  const [loading, setLoading] = useState(true)

  // Load asset lists
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

  // Reload data when selections change
  useEffect(() => {
    if (!rfCodigo && !fundoCnpj) return
    setLoading(true)
    Promise.all([
      rvTicker  ? getHistoricoRV(rvTicker, 504)       : Promise.resolve(null),
      rfCodigo  ? getHistoricoRF(rfCodigo, 504)        : Promise.resolve(null),
      getIndicadores(indicSerie, 504),
      fundoCnpj ? getHistoricoFundo(fundoCnpj, 504)   : Promise.resolve(null),
    ]).then(([rv, rf, ind, fundo]) => {
      setRvData(rv?.data ?? [])
      setRfData(rf?.data ?? [])
      setIndicData(ind.data ?? [])
      setFundoData(fundo?.data ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rvTicker, rfCodigo, indicSerie, fundoCnpj])

  const openDrawer = useCallback((familia: Familia) => {
    setDrawer({ aberto: true, familia })
  }, [])

  // Helpers to derive sparkline data and last value/variation per family
  const rvPontos: PontoChart[]    = rvData.map(h => ({ data: h.data.slice(0, 10), valor: h.fechamento }))
  const rfPontos: PontoChart[]    = rfData.map(h => ({ data: h.data.slice(0, 10), valor: h.taxa_compra ?? 0 }))
  const indicPontos: PontoChart[] = indicData.map(h => ({ data: h.data.slice(0, 10), valor: h.valor }))
  const fundoPontos: PontoChart[] = fundoData.map(h => ({ data: h.data.slice(0, 10), valor: h.valor_cota }))

  function lastVal(pontos: PontoChart[]) { return pontos[pontos.length - 1]?.valor ?? 0 }
  function lastVar(pontos: PontoChart[]) {
    if (pontos.length < 2) return null
    const a = pontos[pontos.length - 2].valor
    const b = pontos[pontos.length - 1].valor
    return ((b - a) / Math.abs(a)) * 100
  }

  // Drawer content config
  const drawerConfig: Record<Familia, {
    ativo: string
    pontos: PontoChart[]
    formatter: (v: number) => string
    selectorLabel: string
    options: { value: string; label: string }[]
    onSelect: (v: string) => void
    selected: string
  }> = {
    rv: {
      ativo: rvTicker,
      pontos: rvPontos,
      formatter: formatBRL,
      selectorLabel: 'Ticker',
      options: rvTickers.map(t => ({ value: t, label: t })),
      onSelect: setRvTicker,
      selected: rvTicker,
    },
    rf: {
      ativo: rfCodigo,
      pontos: rfPontos,
      formatter: (v: number) => v.toFixed(2) + '%',
      selectorLabel: 'Título',
      options: rfCodigos.map(c => ({ value: c, label: c })),
      onSelect: setRfCodigo,
      selected: rfCodigo,
    },
    indicadores: {
      ativo: indicSerie.toUpperCase(),
      pontos: indicPontos,
      formatter: (v: number) => v.toFixed(2) + '%',
      selectorLabel: 'Série',
      options: INDICADORES_SERIES.map(s => ({ value: s, label: s.toUpperCase() })),
      onSelect: setIndicSerie,
      selected: indicSerie,
    },
    fundos: {
      ativo: fundoCnpjs.find(f => f.cnpj === fundoCnpj)?.nome ?? fundoCnpj,
      pontos: fundoPontos,
      formatter: formatCota,
      selectorLabel: 'Fundo',
      options: fundoCnpjs.map(f => ({ value: f.cnpj, label: f.nome.slice(0, 40) })),
      onSelect: setFundoCnpj,
      selected: fundoCnpj,
    },
  }

  const familia = drawer.familia
  const cfg = familia ? drawerConfig[familia] : null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Grid + Drawer</h2>
        <p className="text-xs text-muted-foreground">Cards por família — clique para abrir análise detalhada</p>
      </div>

      {/* 4 SparklineCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SparklineCard
          titulo="Renda Variável"
          valor={loading ? '...' : formatBRL(lastVal(rvPontos))}
          variacao={loading ? null : lastVar(rvPontos)}
          sparkData={rvPontos.slice(-60).map(p => p.valor)}
          cor={CORES.rv}
          icone={<TrendingUp className="h-4 w-4" />}
          tag={rvTicker}
          onClick={() => openDrawer('rv')}
        />
        <SparklineCard
          titulo="Renda Fixa"
          valor={loading ? '...' : (lastVal(rfPontos).toFixed(2) + '%')}
          variacao={loading ? null : lastVar(rfPontos)}
          sparkData={rfPontos.slice(-60).map(p => p.valor)}
          cor={CORES.rf}
          icone={<Landmark className="h-4 w-4" />}
          tag={rfCodigo}
          onClick={() => openDrawer('rf')}
        />
        <SparklineCard
          titulo="Indicadores"
          valor={loading ? '...' : (lastVal(indicPontos).toFixed(2) + '%')}
          variacao={loading ? null : lastVar(indicPontos)}
          sparkData={indicPontos.slice(-60).map(p => p.valor)}
          cor={CORES.indicadores}
          icone={<Activity className="h-4 w-4" />}
          tag={indicSerie.toUpperCase()}
          onClick={() => openDrawer('indicadores')}
        />
        <SparklineCard
          titulo="Fundos"
          valor={loading ? '...' : formatCota(lastVal(fundoPontos))}
          variacao={loading ? null : lastVar(fundoPontos)}
          sparkData={fundoPontos.slice(-60).map(p => p.valor)}
          cor={CORES.fundos}
          icone={<Briefcase className="h-4 w-4" />}
          tag="CVM"
          onClick={() => openDrawer('fundos')}
        />
      </div>

      {/* Drawer */}
      <Drawer open={drawer.aberto} onOpenChange={open => setDrawer(s => ({ ...s, aberto: open }))}>
        <DrawerContent className="max-h-[85vh]">
          <div className="mx-auto w-full max-w-xl px-6 overflow-y-auto">
            <DrawerHeader className="px-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <DrawerTitle>
                    {familia ? familia.charAt(0).toUpperCase() + familia.slice(1) : ''}
                  </DrawerTitle>
                  <DrawerDescription>Histórico detalhado</DrawerDescription>
                </div>
                {cfg && cfg.options.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{cfg.selectorLabel}:</span>
                    <select
                      value={cfg.selected}
                      onChange={e => cfg.onSelect(e.target.value)}
                      className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {cfg.options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </DrawerHeader>

            {familia && cfg && (
              <DrawerChart
                familia={familia}
                ativo={cfg.ativo}
                pontos={cfg.pontos}
                formatter={cfg.formatter}
                cor={CORES[familia]}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
