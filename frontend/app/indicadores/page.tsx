'use client'

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { getIndicadores, type Indicador } from '@/lib/api'
import { SkeletonShimmer, ErrorState, EmptyState } from '@/components/DataStates'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const SERIES = ['selic', 'ipca', 'cdi', 'pib'] as const
type Serie = typeof SERIES[number]
type Range = '3m' | '6m' | '12m' | 'all'

const META: Record<Serie, { label: string; desc: string; source: string; unit: string }> = {
  selic: { label: 'SELIC',  desc: 'Taxa básica de juros',    source: 'BCB · COPOM', unit: '% a.a.' },
  ipca:  { label: 'IPCA',   desc: 'Inflação acumulada 12M',  source: 'IBGE',        unit: '%'      },
  cdi:   { label: 'CDI',    desc: 'Taxa interbancária',      source: 'CETIP',       unit: '% a.a.' },
  pib:   { label: 'PIB',    desc: 'Variação % anual',        source: 'IBGE',        unit: '%'      },
}

const RANGE_N: Record<Range, number | null> = { '3m': 3, '6m': 6, '12m': 12, 'all': null }

function Sparkline({ data, dir }: { data: number[]; dir: 'up' | 'down' | 'flat' }) {
  if (data.length < 2) return <div style={{ width: 80, height: 24 }} />
  const w = 80, h = 24, pad = 2
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / rng) * (h - pad * 2),
  ])
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')
  const col  = dir === 'up' ? 'var(--cl-up)' : dir === 'down' ? 'var(--cl-down)' : 'var(--cl-ink3)'
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={col} />
    </svg>
  )
}

function IndicadoresInner() {
  const [dados, setDados] = useState<Record<Serie, Indicador[]>>({ selic: [], ipca: [], cdi: [], pib: [] })
  const [serie, setSerie] = useState<Serie>('selic')
  const [range, setRange] = useState<Range>('12m')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const carregar = useCallback(() => {
    setLoading(true); setError(null)
    Promise.all(SERIES.map(s => getIndicadores(s, 120))).then(results => {
      const next = { selic: [], ipca: [], cdi: [], pib: [] } as Record<Serie, Indicador[]>
      SERIES.forEach((s, i) => { next[s] = results[i].data })
      setDados(next)
    }).catch(e => setError(e instanceof Error ? e.message : 'Erro ao conectar na API'))
    .finally(() => setLoading(false))
  }, [])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const m = META[serie]
  const reversed = useMemo(() => [...(dados[serie] ?? [])].reverse(), [dados, serie])
  const sliced   = useMemo(() => {
    const n = RANGE_N[range]
    return n ? reversed.slice(-n) : reversed
  }, [reversed, range])

  const chartData = useMemo(() => sliced.map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    valor: d.valor,
  })), [sliced])

  const ultimoValor = dados[serie][0]?.valor ?? null
  const prevValor   = dados[serie][1]?.valor ?? null
  const delta       = ultimoValor != null && prevValor != null ? ultimoValor - prevValor : null
  const dir: 'up' | 'down' | 'flat' = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const dataRef     = dados[serie][0]?.data
    ? new Date(dados[serie][0].data + 'T00:00:00').toLocaleDateString('pt-BR')
    : null

  const tableRows = useMemo(() => [...sliced].reverse(), [sliced])

  if (error) return (
    <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
      <ErrorState msg={error} onRetry={carregar} />
    </div>
  )

  return (
    <div className="cl-panel">

      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SERIES.map(s => {
          const sm  = META[s]
          const sv  = dados[s][0]?.valor ?? null
          const sp  = dados[s][1]?.valor ?? null
          const sd  = sv != null && sp != null ? sv - sp : null
          const sdr: 'up' | 'down' | 'flat' = sd == null ? 'flat' : sd > 0 ? 'up' : sd < 0 ? 'down' : 'flat'
          const spark = [...dados[s]].reverse().slice(-12).map(d => d.valor)
          const active = serie === s
          return (
            <button key={s} onClick={() => setSerie(s)} style={{
              textAlign: 'left', cursor: 'pointer',
              padding: '14px 16px',
              borderRadius: 'var(--cl-radius-sm)',
              background: active ? 'var(--cl-accent-soft)' : 'var(--cl-card)',
              border: `1px solid ${active ? 'var(--cl-accent)' : 'var(--cl-line)'}`,
              borderLeft: `3px solid ${active ? 'var(--cl-accent)' : 'var(--cl-line)'}`,
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: active ? 'var(--cl-accent)' : 'var(--cl-ink3)', marginBottom: 4, textTransform: 'uppercase' }}>{sm.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--cl-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {sv != null ? sv.toFixed(2) : '—'}
                    <small style={{ fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'var(--cl-ink3)', marginLeft: 3 }}>%</small>
                  </div>
                </div>
                {spark.length >= 2 && <Sparkline data={spark} dir={sdr} />}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{sm.desc}</span>
                {sd != null && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: sdr === 'up' ? 'var(--cl-up)' : sdr === 'down' ? 'var(--cl-down)' : 'var(--cl-ink3)' }}>
                    {sd >= 0 ? '+' : ''}{sd.toFixed(2)} p.p.
                  </span>
                )}
              </div>
            </button>
          )
        })}

        <div style={{
          marginTop: 8, padding: '12px 14px',
          background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
          borderRadius: 'var(--cl-radius-sm)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cl-ink)', marginBottom: 4 }}>{m.source}</div>
          <div style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>Série histórica via BCB-SGS</div>
          {dataRef && <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginTop: 4 }}>Última leitura: {dataRef}</div>}
        </div>
      </div>

      {/* ── RIGHT AREA ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--cl-ink3)', fontWeight: 500, marginBottom: 8 }}>{m.label} · {m.desc}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              {loading ? (
                <div style={{ height: 52, width: 140, background: 'var(--cl-line)', borderRadius: 8 }} />
              ) : (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 500, color: 'var(--cl-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {ultimoValor != null ? ultimoValor.toFixed(2) : '—'}
                  <small style={{ fontSize: 22, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'var(--cl-ink3)', marginLeft: 6 }}>{m.unit}</small>
                </span>
              )}
              {!loading && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: dir === 'up' ? 'var(--cl-up-soft)' : dir === 'down' ? 'var(--cl-down-soft)' : 'var(--cl-line2)',
                  color: dir === 'up' ? 'var(--cl-up)' : dir === 'down' ? 'var(--cl-down)' : 'var(--cl-ink3)',
                  borderRadius: 'var(--cl-radius-xs)', padding: '4px 10px',
                  fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                }}>
                  {dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}
                  {delta != null ? ` ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} p.p.` : ' —'}
                </span>
              )}
            </div>
            {dataRef && <div style={{ fontSize: 12, color: 'var(--cl-ink3)', marginTop: 6 }}>Referência: {dataRef}</div>}
          </div>

          {/* Range selector */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {(['3m', '6m', '12m', 'all'] as Range[]).map(r => (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: '6px 13px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
                background: range === r ? 'var(--cl-navy)' : 'var(--cl-card)',
                color: range === r ? '#fff' : 'var(--cl-ink3)',
                border: `1px solid ${range === r ? 'var(--cl-navy)' : 'var(--cl-line)'}`,
                cursor: 'pointer', fontWeight: range === r ? 600 : 400, transition: 'all 0.15s',
              }}>
                {r === 'all' ? 'Tudo' : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{
          background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
          borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
          padding: '16px 0 8px', overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '12px 20px' }}><SkeletonShimmer h={280} /></div>
          ) : chartData.length === 0 ? (
            <EmptyState hint="Verifique se o backend retornou dados para esta série" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-ind-${serie}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--cl-accent)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--cl-accent)" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-line)" vertical={false} />
                <XAxis dataKey="data" tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickLine={false} height={28} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickFormatter={v => `${v.toFixed(1)}%`} domain={['auto', 'auto']} width={52} tickLine={false} />
                <Tooltip
                  formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)}%` : '—', m.label]}
                  contentStyle={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius-sm)', fontSize: 12 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="valor" stroke="var(--cl-accent)" strokeWidth={2} fill={`url(#grad-ind-${serie})`} dot={false} activeDot={{ r: 4, fill: 'var(--cl-accent)', stroke: 'var(--cl-card)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Historical table */}
        {!loading && tableRows.length > 0 && (
          <div style={{
            background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
            borderRadius: 'var(--cl-radius)', overflow: 'hidden', boxShadow: 'var(--cl-shadow)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--cl-line)', background: 'var(--cl-line2)' }}>
                  {['Data', 'Valor', 'Variação', 'Fonte'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 16px', fontSize: 10, fontWeight: 700,
                      color: 'var(--cl-ink3)', letterSpacing: '0.08em', textTransform: 'uppercase',
                      textAlign: i === 0 || i === 3 ? 'left' : 'right',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((d, i) => {
                  const prev = tableRows[i + 1]?.valor ?? null
                  const dlt  = prev != null ? d.valor - prev : null
                  const ddr: 'up' | 'down' | 'flat' = dlt == null ? 'flat' : dlt > 0 ? 'up' : dlt < 0 ? 'down' : 'flat'
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--cl-line2)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--cl-ink3)' }}>
                        {new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--cl-ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {d.valor.toFixed(2)} {m.unit}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {dlt != null ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: ddr === 'up' ? 'var(--cl-up)' : ddr === 'down' ? 'var(--cl-down)' : 'var(--cl-ink3)',
                          }}>
                            {dlt >= 0 ? '+' : ''}{dlt.toFixed(2)} p.p.
                          </span>
                        ) : <span style={{ color: 'var(--cl-ink3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--cl-ink3)' }}>{d.fonte}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function IndicadoresPage() {
  return (
    <Suspense>
      <IndicadoresInner />
    </Suspense>
  )
}
