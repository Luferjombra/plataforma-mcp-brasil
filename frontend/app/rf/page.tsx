'use client'

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { getTitulosRF, getHistoricoRF, type TituloRF, type HistoricoRF } from '@/lib/api'
import { SkeletonShimmer, ErrorState, EmptyState } from '@/components/DataStates'
import { formatBRL, formatPct } from '@/lib/format'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

const INDEXADORES = [
  { key: 'IPCA', label: 'IPCA+',       color: 'var(--cl-up)',     bg: 'var(--cl-up-soft)'     },
  { key: 'PRE',  label: 'Pré-fixado',  color: 'var(--cl-accent)', bg: 'var(--cl-accent-soft)' },
  { key: 'SELIC',label: 'Selic',       color: 'var(--cl-amber)',  bg: 'var(--cl-amber-soft)'  },
]

const RISCO: Record<string, string> = {
  SELIC: 'Baixo', IPCA: 'Baixo', PRE: 'Médio', IGPM: 'Médio', USD: 'Alto',
}

interface OverlayPoint {
  date: string
  IPCA: number | null
  PRE:  number | null
  SELIC: number | null
}

function buildOverlay(series: { key: string; data: HistoricoRF[] }[]): OverlayPoint[] {
  const map = new Map<string, Partial<Record<string, number | null>>>()
  for (const { key, data } of series) {
    for (const h of data) {
      if (!map.has(h.data)) map.set(h.data, {})
      map.get(h.data)![key] = h.taxa_mercado
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      IPCA:  vals['IPCA']  ?? null,
      PRE:   vals['PRE']   ?? null,
      SELIC: vals['SELIC'] ?? null,
    }))
}

function RFInner() {
  const [titulos, setTitulos]           = useState<TituloRF[]>([])
  const [overlaySeries, setOverlay]     = useState<OverlayPoint[]>([])
  const [loadingTitulos, setLoadingT]   = useState(true)
  const [loadingOverlay, setLoadingO]   = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const carregar = useCallback(() => {
    setLoadingT(true); setLoadingO(true); setError(null)
    getTitulosRF().then(r => {
      setTitulos(r.data)

      const picks: { key: string; codigo: string }[] = []
      for (const idx of ['IPCA', 'PRE', 'SELIC']) {
        const found = r.data.find(t => t.indexador === idx && t.ativo)
        if (found) picks.push({ key: idx, codigo: found.codigo })
      }

      if (picks.length === 0) { setLoadingO(false); return }

      Promise.all(picks.map(p => getHistoricoRF(p.codigo, 252).then(h => ({ key: p.key, data: h.data }))))
        .then(series => setOverlay(buildOverlay(series)))
        .catch(() => setOverlay([]))
        .finally(() => setLoadingO(false))

    }).catch(e => { setError(e instanceof Error ? e.message : 'Erro ao conectar na API'); setLoadingO(false) })
    .finally(() => setLoadingT(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const overlayFormatted = useMemo(() => overlaySeries.map(p => ({
    ...p,
    dateLabel: new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
  })), [overlaySeries])

  // Current rates for each indexador (latest taxa from titulos)
  const currentRates = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const idx of INDEXADORES) {
      const t = titulos.find(t => t.indexador === idx.key && t.ativo && t.taxa_atual != null)
      out[idx.key] = t?.taxa_atual ?? null
    }
    return out
  }, [titulos])

  const loading = loadingTitulos || loadingOverlay

  if (error) return (
    <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
      <ErrorState msg={error} onRetry={carregar} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── OVERLAY CHART ─────────────────────────────── */}
      <div style={{
        background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
        borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--cl-line)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--cl-ink)', marginBottom: 4 }}>
            Histórico de taxas — Tesouro Direto
          </h2>
          <p style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>3 indexadores principais · 252 dias úteis</p>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
            {INDEXADORES.map(idx => (
              <div key={idx.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="24" height="2" style={{ overflow: 'visible' }}>
                  <line x1="0" y1="1" x2="24" y2="1" stroke={idx.color} strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: 12, color: 'var(--cl-ink)', fontWeight: 500 }}>{idx.label}</span>
                {currentRates[idx.key] != null && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: idx.color, background: idx.bg, borderRadius: 'var(--cl-radius-xs)',
                    padding: '1px 7px',
                  }}>
                    {formatPct(currentRates[idx.key])}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '8px 0 8px' }}>
          {loading ? (
            <div style={{ padding: '8px 20px' }}><SkeletonShimmer h={260} /></div>
          ) : overlayFormatted.length === 0 ? (
            <EmptyState hint="Nenhum título ativo encontrado para os indexadores IPCA / PRE / SELIC" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={overlayFormatted} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-line)" vertical={false} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickLine={false} height={28} interval={Math.max(1, Math.floor(overlayFormatted.length / 8))} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 'auto']} width={48} tickLine={false} />
                <Tooltip
                  formatter={(v, name) => [typeof v === 'number' ? `${v.toFixed(2)}% a.a.` : '—', INDEXADORES.find(i => i.key === name)?.label ?? name]}
                  contentStyle={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius-sm)', fontSize: 12 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Line type="monotone" dataKey="IPCA"  stroke="var(--cl-up)"     strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: 'var(--cl-card)', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="PRE"   stroke="var(--cl-accent)" strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: 'var(--cl-card)', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="SELIC" stroke="var(--cl-amber)"  strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: 'var(--cl-card)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── INDEXER CARDS ─────────────────────────────── */}
      <div className="cl-rf3">
        {INDEXADORES.map(idx => {
          const titleForIdx = titulos.find(t => t.indexador === idx.key && t.ativo)
          const count       = titulos.filter(t => t.indexador === idx.key).length
          return (
            <div key={idx.key} style={{
              background: 'var(--cl-card)', border: `1px solid var(--cl-line)`,
              borderTop: `3px solid ${idx.color}`,
              borderRadius: 'var(--cl-radius)', padding: 'var(--cl-card-pad)',
              boxShadow: 'var(--cl-shadow)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: idx.color, background: idx.bg, borderRadius: 'var(--cl-radius-xs)', padding: '2px 8px' }}>{idx.label}</span>
                <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{count} título{count !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: idx.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 6 }}>
                {formatPct(currentRates[idx.key])}
              </div>
              <div style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>
                {titleForIdx?.nome_display ?? 'Taxa representativa'} · taxa atual
              </div>
            </div>
          )
        })}
      </div>

      {/* ── UNIFIED TABLE ─────────────────────────────── */}
      <div style={{
        background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
        borderRadius: 'var(--cl-radius)', overflow: 'hidden', boxShadow: 'var(--cl-shadow)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--cl-line)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--cl-ink)' }}>
            Todos os títulos · {titulos.filter(t => t.ativo).length} ativos
          </h2>
        </div>

        {loadingTitulos ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 44, background: 'var(--cl-line2)', borderRadius: 6 }} />
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--cl-line2)', borderBottom: '1px solid var(--cl-line)' }}>
                {['Título', 'Indexador', 'Taxa', 'PU', 'Vencimento', 'Risco', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    textAlign: i >= 2 && i <= 5 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {titulos.filter(t => t.ativo).map(t => {
                const idxCfg = INDEXADORES.find(i => i.key === t.indexador)
                const risco  = RISCO[t.indexador] ?? 'Médio'
                const riscoColor = risco === 'Baixo' ? 'var(--cl-up)' : risco === 'Alto' ? 'var(--cl-down)' : 'var(--cl-amber)'
                return (
                  <tr key={t.codigo} style={{ borderBottom: '1px solid var(--cl-line2)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--cl-line2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cl-ink)' }}>{t.nome_display}</div>
                      <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 2 }}>{t.tipo_curto}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {idxCfg ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: idxCfg.color,
                          background: idxCfg.bg, borderRadius: 'var(--cl-radius-xs)', padding: '2px 8px',
                        }}>{idxCfg.label}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{t.indexador}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: idxCfg?.color ?? 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatPct(t.taxa_atual)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatBRL(t.pu_atual)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--cl-ink3)' }}>
                      {t.data_vencimento
                        ? new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: riscoColor }}>{risco}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--cl-accent)',
                        background: 'var(--cl-accent-soft)', border: '1px solid var(--cl-accent)',
                        borderRadius: 'var(--cl-radius-xs)', padding: '4px 12px', cursor: 'pointer',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'var(--cl-accent)'; el.style.color = '#fff' }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'var(--cl-accent-soft)'; el.style.color = 'var(--cl-accent)' }}
                      >
                        Simular →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function RFPage() {
  return (
    <Suspense>
      <RFInner />
    </Suspense>
  )
}
