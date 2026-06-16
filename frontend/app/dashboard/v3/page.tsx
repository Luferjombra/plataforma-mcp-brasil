'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { DashboardVersionNav } from '@/components/DashboardVersionNav'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  getAtivos, getHistoricoRV, getTitulosRF, getHistoricoRF,
  getFundos, getHistoricoFundo, getIndicadores,
  type Ativo, type TituloRF, type Fundo,
} from '@/lib/api'
import { formatBRL, formatCota, formatPct, formatMilhoes } from '@/lib/format'
import { useTheme } from 'next-themes'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ─── tipos de família ────────────────────────────────────────────────────────
type Familia = 'rv' | 'rf' | 'indicadores' | 'fundos'

interface PontoHistorico {
  data: string
  valor: number
}

const FAMILIA_COR: Record<Familia, string> = {
  rv:          '#22c55e',
  rf:          '#3b82f6',
  indicadores: '#f59e0b',
  fundos:      '#8b5cf6',
}

const PERIODOS = [
  { label: '1m',  dias: 21  },
  { label: '3m',  dias: 63  },
  { label: '6m',  dias: 126 },
  { label: '1a',  dias: 252 },
  { label: '2a',  dias: 504 },
  { label: 'MAX', dias: 9999 },
]

const SERIES_INDICADORES = [
  { id: 'selic', label: 'SELIC',   tag: 'BCB', nota: 'meta a.a.' },
  { id: 'ipca',  label: 'IPCA',    tag: 'BCB', nota: 'mensal %' },
  { id: 'cdi',   label: 'CDI',     tag: 'BCB', nota: 'diário %' },
  { id: 'pib',   label: 'PIB',     tag: 'BCB', nota: 'trimestral %' },
]

// ─── Métricas ────────────────────────────────────────────────────────────────
function calcularMetricas(dados: PontoHistorico[]) {
  if (!dados.length) return null
  const valores = dados.map(d => d.valor)
  const ultimo  = valores[0]
  const primeiro = valores[valores.length - 1]
  const maximo  = Math.max(...valores)
  const minimo  = Math.min(...valores)
  const media   = valores.reduce((a, b) => a + b, 0) / valores.length
  const varPct  = primeiro !== 0 ? ((ultimo - primeiro) / Math.abs(primeiro)) * 100 : null
  return { ultimo, primeiro, maximo, minimo, media, varPct,
           dataInicio: dados[dados.length - 1]?.data, dataFim: dados[0]?.data }
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function MetricaItem({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono font-semibold">{valor}</span>
    </div>
  )
}

interface MetricasPanelProps {
  dados: PontoHistorico[]
  familia: Familia
  nome: string
}

function MetricasPanel({ dados, familia, nome }: MetricasPanelProps) {
  const m = useMemo(() => calcularMetricas(dados), [dados])

  function fmt(v: number | null): string {
    if (v == null) return '—'
    if (familia === 'rv')    return formatBRL(v)
    if (familia === 'fundos') return formatCota(v)
    return `${v.toFixed(2)}%`
  }

  if (!m) return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )

  const VarIcon = m.varPct == null ? Minus : m.varPct > 0 ? TrendingUp : TrendingDown
  const varColor = m.varPct == null ? '' : m.varPct > 0 ? 'text-green-500' : 'text-red-500'

  return (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 truncate"
         title={nome}>{nome}</p>

      <MetricaItem label="Último"  valor={fmt(m.ultimo)} />
      <MetricaItem label="Máximo"  valor={fmt(m.maximo)} />
      <MetricaItem label="Mínimo"  valor={fmt(m.minimo)} />
      <MetricaItem label="Média"   valor={fmt(m.media)} />

      {m.varPct != null && (
        <div className="flex flex-col gap-0.5 py-2 border-b border-border">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Variação período</span>
          <span className={`text-sm font-mono font-semibold flex items-center gap-1 ${varColor}`}>
            <VarIcon className="h-3 w-3" />
            {m.varPct > 0 ? '+' : ''}{m.varPct.toFixed(2)}%
          </span>
        </div>
      )}

      <div className="flex flex-col gap-0.5 py-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Período</span>
        <span className="text-xs text-muted-foreground">
          {m.dataInicio ? new Date(m.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
          {' → '}
          {m.dataFim   ? new Date(m.dataFim   + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── GraficoPrincipal ────────────────────────────────────────────────────────
interface GraficoProps {
  dados: PontoHistorico[]
  cor: string
  familia: Familia
  periodo: number
  onPeriodoChange: (dias: number) => void
  carregando: boolean
}

function GraficoPrincipal({ dados, cor, familia, periodo, onPeriodoChange, carregando }: GraficoProps) {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#6b7280' : '#9ca3af'

  const dadosFiltrados = useMemo(() => {
    if (periodo >= 9999) return [...dados].reverse()
    return [...dados].slice(0, periodo).reverse()
  }, [dados, periodo])

  function yFormat(v: number): string {
    if (familia === 'rv')     return `R$ ${v.toFixed(0)}`
    if (familia === 'fundos') return v.toFixed(2)
    return `${v.toFixed(2)}%`
  }

  function tooltipFormat(v: number): string {
    if (familia === 'rv')     return formatBRL(v)
    if (familia === 'fundos') return formatCota(v)
    return `${v.toFixed(2)}%`
  }

  function xLabel(data: string): string {
    try {
      const d = new Date(data + 'T00:00:00')
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    } catch { return data }
  }

  const gradId = `grad-v3-${familia}`

  if (carregando) {
    return <Skeleton className="h-[320px] w-full rounded-lg" />
  }

  if (!dadosFiltrados.length) {
    return (
      <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
        Sem dados para o período selecionado.
      </div>
    )
  }

  return (
    <div>
      {/* Seletor de período */}
      <div className="flex gap-1 mb-4">
        {PERIODOS.map(p => (
          <button
            key={p.label}
            onClick={() => onPeriodoChange(p.dias)}
            className={[
              'px-2.5 py-1 text-xs rounded font-medium transition-all',
              periodo === p.dias
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={dadosFiltrados} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={cor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={cor} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={tickColor} opacity={0.3} />
          <XAxis
            dataKey="data"
            tickFormatter={xLabel}
            tick={{ fontSize: 10, fill: tickColor }}
            interval={Math.max(0, Math.floor(dadosFiltrados.length / 6) - 1)}
          />
          <YAxis
            tickFormatter={yFormat}
            tick={{ fontSize: 10, fill: tickColor }}
            width={70}
          />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(l) => xLabel(String(l))}
            formatter={(v) => [tooltipFormat(Number(v)), '']}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={cor}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── SeletorAtivo ────────────────────────────────────────────────────────────
interface SeletorAtivoProps {
  itens: Array<{ id: string; label: string; subtitulo?: string; tag?: string }>
  selecionado: string
  onSelect: (id: string) => void
  cor: string
}

function SeletorAtivo({ itens, selecionado, onSelect, cor }: SeletorAtivoProps) {
  const [filtro, setFiltro] = useState('')
  const filtrados = useMemo(
    () => itens.filter(i =>
      i.label.toLowerCase().includes(filtro.toLowerCase()) ||
      i.id.toLowerCase().includes(filtro.toLowerCase())
    ),
    [itens, filtro]
  )

  return (
    <div className="flex flex-col h-full">
      <input
        type="text"
        placeholder="Filtrar..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
        className="mx-3 mb-2 px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filtrados.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={[
              'w-full text-left px-2 py-2 rounded text-xs transition-all',
              selecionado === item.id
                ? 'text-white font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            ].join(' ')}
            style={selecionado === item.id ? { background: cor } : undefined}
          >
            <div className="font-medium truncate">{item.label}</div>
            {item.subtitulo && (
              <div className="text-[10px] opacity-70 truncate mt-0.5">{item.subtitulo}</div>
            )}
          </button>
        ))}
        {filtrados.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">Nenhum resultado.</p>
        )}
      </div>
      <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
        {filtrados.length} item(s)
      </p>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function DashboardV3() {
  const [familia, setFamilia]       = useState<Familia>('rv')
  const [periodo, setPeriodo]       = useState(252)
  const [historico, setHistorico]   = useState<PontoHistorico[]>([])
  const [carregando, setCarregando] = useState(false)
  const [nomeSel, setNomeSel]       = useState('')

  // Listas de itens por família
  const [ativos,   setAtivos]   = useState<Ativo[]>([])
  const [titulos,  setTitulos]  = useState<TituloRF[]>([])
  const [fundos,   setFundos]   = useState<Fundo[]>([])

  // Item selecionado por família
  const [selRV,   setSelRV]   = useState('')
  const [selRF,   setSelRF]   = useState('')
  const [selFund, setSelFund] = useState('')
  const [selInd,  setSelInd]  = useState('selic')

  // Carga das listas na montagem
  useEffect(() => {
    getAtivos().then(r => {
      const lista = r.data.filter(a => a.ativo)
      setAtivos(lista)
      if (!selRV && lista[0]) setSelRV(lista[0].ticker)
    }).catch(() => {})

    getTitulosRF().then(r => {
      const lista = r.data.filter(t => t.ativo)
      setTitulos(lista)
      if (!selRF && lista[0]) setSelRF(lista[0].codigo)
    }).catch(() => {})

    getFundos().then(r => {
      setFundos(r.data)
      if (!selFund && r.data[0]) setSelFund(r.data[0].cnpj)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Carga do histórico quando muda família ou seleção
  const carregarHistorico = useCallback(async () => {
    setCarregando(true)
    setHistorico([])
    try {
      if (familia === 'rv' && selRV) {
        const r = await getHistoricoRV(selRV, 504)
        setHistorico(r.data.map(d => ({ data: d.data, valor: d.fechamento })))
        setNomeSel(selRV)
      } else if (familia === 'rf' && selRF) {
        const r = await getHistoricoRF(selRF, 504)
        setHistorico(r.data.map(d => ({ data: d.data, valor: d.taxa_compra ?? d.taxa_mercado ?? 0 })))
        const titulo = titulos.find(t => t.codigo === selRF)
        setNomeSel(titulo?.nome_display ?? selRF)
      } else if (familia === 'indicadores') {
        const r = await getIndicadores(selInd, 504)
        setHistorico(r.data.map(d => ({ data: d.data, valor: d.valor })))
        const s = SERIES_INDICADORES.find(x => x.id === selInd)
        setNomeSel(`${s?.label ?? selInd} (${s?.nota ?? ''})`)
      } else if (familia === 'fundos' && selFund) {
        const r = await getHistoricoFundo(selFund, 504)
        setHistorico(r.data.map(d => ({ data: d.data, valor: d.valor_cota })))
        const fundo = fundos.find(f => f.cnpj === selFund)
        setNomeSel(fundo?.nome_abreviado ?? fundo?.nome ?? selFund)
      }
    } catch {
      setHistorico([])
    } finally {
      setCarregando(false)
    }
  }, [familia, selRV, selRF, selInd, selFund, titulos, fundos])

  useEffect(() => {
    carregarHistorico()
  }, [carregarHistorico])

  // Itens da sidebar por família
  const itensSidebar = useMemo(() => {
    if (familia === 'rv') return ativos.map(a => ({
      id: a.ticker,
      label: a.ticker,
      subtitulo: a.nome,
      tag: a.tipo,
    }))
    if (familia === 'rf') return titulos.map(t => ({
      id: t.codigo,
      label: t.nome_display,
      subtitulo: t.codigo,
      tag: t.indexador,
    }))
    if (familia === 'indicadores') return SERIES_INDICADORES.map(s => ({
      id: s.id,
      label: s.label,
      subtitulo: s.nota,
      tag: s.tag,
    }))
    return fundos.map(f => ({
      id: f.cnpj,
      label: f.nome_abreviado ?? f.nome,
      subtitulo: f.gestor ?? undefined,
      tag: f.classe_anbima?.split(' ')[0] ?? undefined,
    }))
  }, [familia, ativos, titulos, fundos])

  const selAtual =
    familia === 'rv'          ? selRV
    : familia === 'rf'        ? selRF
    : familia === 'indicadores' ? selInd
    : selFund

  function onSelect(id: string) {
    if (familia === 'rv')           setSelRV(id)
    else if (familia === 'rf')      setSelRF(id)
    else if (familia === 'indicadores') setSelInd(id)
    else                            setSelFund(id)
  }

  const cor = FAMILIA_COR[familia]

  return (
    <div className="p-6 space-y-4">
      <DashboardVersionNav />

      {/* Tabs de família */}
      <Tabs value={familia} onValueChange={v => setFamilia(v as Familia)}>
        <TabsList>
          <TabsTrigger value="rv">Renda Variável</TabsTrigger>
          <TabsTrigger value="rf">Renda Fixa</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="fundos">Fundos</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Layout 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_200px] gap-4 min-h-[480px]">

        {/* Sidebar — seletor de ativo */}
        <Card className="overflow-hidden">
          <CardHeader className="px-3 py-2.5 border-b border-border">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Selecionar
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[420px]">
            {itensSidebar.length === 0
              ? <div className="flex items-center justify-center h-full"><Skeleton className="h-4 w-24" /></div>
              : <SeletorAtivo
                  itens={itensSidebar}
                  selecionado={selAtual}
                  onSelect={onSelect}
                  cor={cor}
                />
            }
          </CardContent>
        </Card>

        {/* Gráfico principal */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{nomeSel || '—'}</CardTitle>
              <Badge
                variant="outline"
                className="text-[10px]"
                style={{ borderColor: cor, color: cor }}
              >
                {familia.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <GraficoPrincipal
              dados={historico}
              cor={cor}
              familia={familia}
              periodo={periodo}
              onPeriodoChange={setPeriodo}
              carregando={carregando}
            />
          </CardContent>
        </Card>

        {/* Painel de métricas */}
        <Card className="overflow-hidden">
          <CardHeader className="px-4 py-2.5 border-b border-border">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Métricas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <MetricasPanel
              dados={historico.slice(0, periodo >= 9999 ? historico.length : periodo)}
              familia={familia}
              nome={nomeSel}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
