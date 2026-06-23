'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getAtivos, getHistoricoRV, type Ativo, type Historico } from '@/lib/api'
import { SkeletonShimmer, ErrorState, EmptyState } from '@/components/DataStates'
import { formatBRL, formatCap } from '@/lib/format'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type Filtro = 'todos' | 'acao' | 'fii'
type Range  = '5d' | '1m' | '3m' | '6m' | '1a'

const RANGE_N: Record<Range, number> = { '5d': 5, '1m': 21, '3m': 63, '6m': 126, '1a': 252 }

function RVInner() {
  const searchParams  = useSearchParams()
  const tickerParam   = searchParams.get('ticker')

  const [ativos, setAtivos]             = useState<Ativo[]>([])
  const [selecionado, setSelecionado]   = useState<string | null>(null)
  const [historico, setHistorico]       = useState<Historico[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingChart, setLoadingChart]   = useState(false)
  const [filtro, setFiltro]             = useState<Filtro>('todos')
  const [range, setRange]               = useState<Range>('1a')
  const [error, setError]               = useState<string | null>(null)

  const recarregar = () => {
    setLoadingAtivos(true); setError(null)
    getAtivos().then(r => {
      setAtivos(r.data)
      const init = tickerParam
        ? r.data.find(a => a.ticker === tickerParam.toUpperCase())?.ticker ?? r.data[0]?.ticker
        : r.data[0]?.ticker
      if (init) setSelecionado(init)
    }).catch(e => setError(e instanceof Error ? e.message : 'Erro ao conectar na API'))
    .finally(() => setLoadingAtivos(false))
  }

  useEffect(() => { recarregar() }, [tickerParam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoRV(selecionado, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  const ativosFiltrados = useMemo(() => ativos
    .filter(a => filtro === 'fii' ? a.tipo === 'FII' : filtro === 'acao' ? a.tipo !== 'FII' : true)
    .sort((a, b) => {
      if (a.var_dia_pct == null && b.var_dia_pct == null) return 0
      if (a.var_dia_pct == null) return 1
      if (b.var_dia_pct == null) return -1
      return b.var_dia_pct - a.var_dia_pct
    }), [ativos, filtro])

  const ativoSel = ativos.find(a => a.ticker === selecionado)
  const isFII    = ativoSel?.tipo === 'FII'

  const histReversed = useMemo(() => [...historico].reverse(), [historico])
  const sliced       = useMemo(() => histReversed.slice(-RANGE_N[range]), [histReversed, range])

  const chartData = useMemo(() => sliced.map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    fechamento: d.fechamento,
  })), [sliced])

  const ultHist   = historico[0]
  const primHist  = historico.length > 1 ? historico[historico.length - 1] : null
  const ret12m    = primHist && ultHist ? ((ultHist.fechamento - primHist.fechamento) / primHist.fechamento * 100) : null
  const varDay    = ativoSel?.var_dia_pct ?? 0
  const chartColor = varDay >= 0 ? 'var(--cl-up)' : 'var(--cl-down)'

  const totalAcoes = ativos.filter(a => a.tipo !== 'FII').length
  const totalFIIs  = ativos.filter(a => a.tipo === 'FII').length

  if (error) return (
    <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
      <ErrorState msg={error} onRetry={recarregar} />
    </div>
  )

  return (
    <div className="cl-panel-rv">

      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['todos', 'acao', 'fii'] as Filtro[]).map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{
              flex: 1, padding: '6px 0', fontSize: 12, fontWeight: filtro === f ? 600 : 400,
              borderRadius: 'var(--cl-radius-xs)', cursor: 'pointer', transition: 'all 0.15s',
              background: filtro === f ? 'var(--cl-navy)' : 'var(--cl-card)',
              color: filtro === f ? '#fff' : 'var(--cl-ink3)',
              border: `1px solid ${filtro === f ? 'var(--cl-navy)' : 'var(--cl-line)'}`,
            }}>
              {f === 'todos' ? 'Todas' : f === 'acao' ? 'Ações' : 'FIIs'}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--cl-ink3)', paddingLeft: 2 }}>
          {totalAcoes} ações · {totalFIIs} FIIs
        </div>

        {/* Asset list */}
        <div style={{
          background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
          borderRadius: 'var(--cl-radius)', overflow: 'hidden', boxShadow: 'var(--cl-shadow)',
          flex: 1,
        }}>
          {/* Column header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto',
            padding: '8px 14px', borderBottom: '1px solid var(--cl-line)',
            background: 'var(--cl-line2)',
          }}>
            {['Ativo', 'Preço', 'Var'].map((h, i) => (
              <span key={h} style={{
                fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                textAlign: i === 0 ? 'left' : 'right',
              }}>{h}</span>
            ))}
          </div>

          <div className="cl-rv-list" style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {loadingAtivos ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, i) => <SkeletonShimmer key={i} h={44} />)}
              </div>
            ) : ativosFiltrados.length === 0 ? (
              <EmptyState msg="Nenhum ativo encontrado" />
            ) : (
              <div>
                {ativosFiltrados.map(a => {
                  const active = selecionado === a.ticker
                  const pos    = (a.var_dia_pct ?? 0) >= 0
                  return (
                    <button key={a.ticker} onClick={() => setSelecionado(a.ticker)} style={{
                      width: '100%', display: 'grid', gridTemplateColumns: '1fr auto auto',
                      gap: 8, alignItems: 'center', padding: '10px 14px', textAlign: 'left',
                      background: active ? 'var(--cl-accent-soft)' : 'transparent',
                      borderLeft: active ? '3px solid var(--cl-accent)' : '3px solid transparent',
                      borderBottom: '1px solid var(--cl-line2)',
                      cursor: 'pointer', transition: 'all 0.1s',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--cl-accent)' : 'var(--cl-ink)', lineHeight: 1.2 }}>{a.ticker}</div>
                        <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                          {a.setor || (isFII ? 'FII' : 'Ação')}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {a.preco_atual != null ? formatBRL(a.preco_atual) : '—'}
                      </span>
                      {a.var_dia_pct != null ? (
                        <span style={{
                          fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                          padding: '2px 6px', borderRadius: 4,
                          background: pos ? 'var(--cl-up-soft)' : 'var(--cl-down-soft)',
                          color: pos ? 'var(--cl-up)' : 'var(--cl-down)',
                        }}>
                          {pos ? '+' : ''}{a.var_dia_pct.toFixed(2)}%
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--cl-ink3)' }}>—</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT AREA ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

        {/* Ticker header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: isFII ? 'var(--cl-up)' : 'var(--cl-accent)',
                background: isFII ? 'var(--cl-up-soft)' : 'var(--cl-accent-soft)',
                borderRadius: 'var(--cl-radius-xs)', padding: '3px 8px',
              }}>{isFII ? 'FII' : 'AÇÃO'}</span>
              <span style={{ fontSize: 13, color: 'var(--cl-ink3)' }}>{ativoSel?.nome ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 500, color: 'var(--cl-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {selecionado ?? '—'}
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, color: 'var(--cl-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {ativoSel?.preco_atual != null ? formatBRL(ativoSel.preco_atual) : (ultHist ? formatBRL(ultHist.fechamento) : '—')}
              </span>
              {ativoSel?.var_dia_pct != null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: varDay >= 0 ? 'var(--cl-up-soft)' : 'var(--cl-down-soft)',
                  color: varDay >= 0 ? 'var(--cl-up)' : 'var(--cl-down)',
                  borderRadius: 'var(--cl-radius-xs)', padding: '4px 10px',
                  fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                }}>
                  {varDay >= 0 ? '↑' : '↓'} {varDay >= 0 ? '+' : ''}{varDay.toFixed(2)}%
                </span>
              )}
            </div>
            {ativoSel?.data_preco && (
              <div style={{ fontSize: 12, color: 'var(--cl-ink3)', marginTop: 6 }}>
                {new Date(ativoSel.data_preco + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* Range selector */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {(['5d', '1m', '3m', '6m', '1a'] as Range[]).map(r => (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: '6px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
                background: range === r ? 'var(--cl-navy)' : 'var(--cl-card)',
                color: range === r ? '#fff' : 'var(--cl-ink3)',
                border: `1px solid ${range === r ? 'var(--cl-navy)' : 'var(--cl-line)'}`,
                cursor: 'pointer', fontWeight: range === r ? 600 : 400, transition: 'all 0.15s',
              }}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{
          background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
          borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
          padding: '16px 0 8px',
        }}>
          {loadingChart ? (
            <div style={{ padding: '8px 20px' }}><SkeletonShimmer h={280} /></div>
          ) : chartData.length === 0 ? (
            <EmptyState hint="Selecione um ativo com histórico disponível" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-rv-cl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={varDay >= 0 ? '#0f9d58' : '#d93838'} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={varDay >= 0 ? '#0f9d58' : '#d93838'} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-line)" vertical={false} />
                <XAxis dataKey="data" tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickLine={false} height={28} interval={Math.max(1, Math.floor(chartData.length / 6))} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickFormatter={v => `R$${v.toFixed(0)}`} domain={['auto', 'auto']} width={60} tickLine={false} />
                <Tooltip
                  formatter={(v) => [typeof v === 'number' ? formatBRL(v) : '—', 'Fechamento']}
                  contentStyle={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius-sm)', fontSize: 12 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="fechamento" stroke={chartColor} strokeWidth={2} fill="url(#grad-rv-cl)" dot={false} activeDot={{ r: 4, fill: chartColor, stroke: 'var(--cl-card)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stat cards */}
        <div className="cl-kpi4" style={{ gap: 12 }}>
          {[
            { label: 'Abertura',    value: ultHist?.abertura  != null ? formatBRL(ultHist.abertura)  : '—' },
            { label: 'Máxima',      value: ultHist?.maxima    != null ? formatBRL(ultHist.maxima)    : '—' },
            { label: 'Mínima',      value: ultHist?.minima    != null ? formatBRL(ultHist.minima)    : '—' },
            { label: 'Retorno 12M', value: ret12m != null ? `${ret12m >= 0 ? '+' : ''}${ret12m.toFixed(2)}%` : '—', accent: ret12m != null ? (ret12m >= 0 ? 'var(--cl-up)' : 'var(--cl-down)') : undefined },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
              borderRadius: 'var(--cl-radius)', padding: 'var(--cl-card-pad)', boxShadow: 'var(--cl-shadow)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: s.accent ?? 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              {s.label === 'Retorno 12M' && <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 4 }}>vs. início do período</div>}
              {s.label === 'Abertura' && ativoSel?.data_preco && <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 4 }}>{new Date(ativoSel.data_preco + 'T00:00:00').toLocaleDateString('pt-BR')}</div>}
              {s.label === 'Máxima' && <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 4 }}>pregão atual</div>}
              {s.label === 'Mínima' && <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 4 }}>pregão atual</div>}
            </div>
          ))}
        </div>

        {/* Market cap / setor info */}
        {ativoSel && (formatCap(ativoSel.market_cap) || ativoSel.setor) && (
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--cl-ink3)', paddingLeft: 2 }}>
            {ativoSel.setor && <span>Setor: <strong style={{ color: 'var(--cl-ink)' }}>{ativoSel.setor}</strong></span>}
            {formatCap(ativoSel.market_cap) && <span>Market cap: <strong style={{ color: 'var(--cl-ink)' }}>{formatCap(ativoSel.market_cap)}</strong></span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RVPage() {
  return (
    <Suspense>
      <RVInner />
    </Suspense>
  )
}
