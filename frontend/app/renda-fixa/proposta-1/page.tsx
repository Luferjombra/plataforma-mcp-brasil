'use client'

/**
 * PROPOSTA 1 — "Trader View"
 * Estilo Bloomberg: tabela densa, KPIs no topo, filtros inline.
 * Ideal para usuários power-user que precisam varrer muitos ativos rápido.
 */

import { useEffect, useState } from 'react'
import { getDebentures, getCRI, getCRA, type AnbimaDebenture, type AnbimaCRI, type AnbimaCRA } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonShimmer, ErrorState } from '@/components/DataStates'

type Tab = 'deb' | 'cri' | 'cra'
type AnyAsset = AnbimaDebenture | AnbimaCRI | AnbimaCRA

const INDEXADOR_COLORS: Record<string, { bg: string; color: string }> = {
  'CDI':  { bg: 'var(--cl-up-soft)',     color: 'var(--cl-up)'     },
  'IPCA': { bg: 'var(--cl-accent-soft)', color: 'var(--cl-accent)' },
  'PRE':  { bg: 'var(--cl-amber-soft)',  color: 'var(--cl-amber)'  },
  'IGPM': { bg: '#f3e8ff',               color: '#7c3aed'           },
  'TR':   { bg: 'var(--cl-line2)',       color: 'var(--cl-ink3)'   },
}

const RATING_COLOR: Record<string, string> = {
  'AAA': 'var(--cl-up)', 'AA+': 'var(--cl-up)', 'AA': 'var(--cl-up)', 'AA-': 'var(--cl-up)',
  'A+':  'var(--cl-accent)', 'A': 'var(--cl-accent)', 'A-': 'var(--cl-accent)',
  'BBB': 'var(--cl-amber)', 'BB': 'var(--cl-down)',
}

function fmtVol(v: number | null) {
  if (v == null) return '—'
  if (v >= 1e9) return `R$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`
  return `R$${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

function fmtTaxa(v: number | null) {
  if (v == null) return '—'
  return `${v.toFixed(2)}%`
}

function IndexTag({ v }: { v: string | null | undefined }) {
  if (!v) return <span style={{ color: 'var(--cl-ink3)' }}>—</span>
  const c = INDEXADOR_COLORS[v] ?? { bg: 'var(--cl-line2)', color: 'var(--cl-ink3)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: c.bg, color: c.color, letterSpacing: '0.04em',
    }}>{v}</span>
  )
}

interface Row {
  codigo: string
  emissor: string | null
  indexador: string | null
  vencimento: string | null
  taxa: number | null
  spread: number | null
  duration: number | null
  volume: number | null
  rating: string | null
}

function toRows(tab: Tab, deb: AnbimaDebenture[], cri: AnbimaCRI[], cra: AnbimaCRA[]): Row[] {
  if (tab === 'deb') return deb.map(d => ({
    codigo: d.codigo,
    emissor: d.anbima_debentures_cadastro?.nome_emissor ?? null,
    indexador: d.anbima_debentures_cadastro?.indexador ?? null,
    vencimento: d.anbima_debentures_cadastro?.data_vencimento ?? null,
    taxa: d.taxa_indicativa,
    spread: d.anbima_debentures_cadastro?.indexador?.includes('CDI') ? d.spread_cdi : d.spread_ipca,
    duration: d.duration,
    volume: d.volume_negociado,
    rating: d.anbima_debentures_cadastro?.rating_nota ?? null,
  }))
  if (tab === 'cri') return cri.map(c => ({
    codigo: c.codigo,
    emissor: c.anbima_cri_cadastro?.cedente ?? null,
    indexador: c.anbima_cri_cadastro?.indexador ?? null,
    vencimento: c.anbima_cri_cadastro?.data_vencimento ?? null,
    taxa: c.taxa_indicativa,
    spread: c.spread_ipca ?? c.spread_cdi,
    duration: c.duration,
    volume: c.volume_negociado,
    rating: c.anbima_cri_cadastro?.rating_nota ?? null,
  }))
  return cra.map(c => ({
    codigo: c.codigo,
    emissor: c.anbima_cra_cadastro?.cedente ?? null,
    indexador: c.anbima_cra_cadastro?.indexador ?? null,
    vencimento: c.anbima_cra_cadastro?.data_vencimento ?? null,
    taxa: c.taxa_indicativa,
    spread: c.spread_ipca ?? c.spread_cdi,
    duration: c.duration,
    volume: c.volume_negociado,
    rating: c.anbima_cra_cadastro?.rating_nota ?? null,
  }))
}

export default function RendaFixaP1() {
  const [tab, setTab] = useState<Tab>('deb')
  const [deb, setDeb] = useState<AnbimaDebenture[]>([])
  const [cri, setCri] = useState<AnbimaCRI[]>([])
  const [cra, setCra] = useState<AnbimaCRA[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroIdx, setFiltroIdx] = useState<string | null>(null)
  const [dataRef, setDataRef] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([getDebentures(100), getCRI(100), getCRA(100)])
      .then(([d, c, cr]) => {
        setDeb(d.data); setCri(c.data); setCra(cr.data)
        setDataRef(d.data_referencia)
        setLoading(false)
      })
      .catch(() => { setError('Falha ao carregar dados ANBIMA'); setLoading(false) })
  }, [])

  const rows = toRows(tab, deb, cri, cra)
  const indexadores = [...new Set(rows.map(r => r.indexador).filter(Boolean) as string[])]
  const filtered = filtroIdx ? rows.filter(r => r.indexador === filtroIdx) : rows

  const totalVol = rows.reduce((s, r) => s + (r.volume ?? 0), 0)
  const mediaSpread = (() => {
    const valid = rows.filter(r => r.spread != null)
    return valid.length ? (valid.reduce((s, r) => s + r.spread!, 0) / valid.length) : null
  })()
  const mediaDur = (() => {
    const valid = rows.filter(r => r.duration != null)
    return valid.length ? (valid.reduce((s, r) => s + r.duration!, 0) / valid.length) : null
  })()

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'deb', label: 'Debêntures', count: deb.length },
    { key: 'cri', label: 'CRI', count: cri.length },
    { key: 'cra', label: 'CRA', count: cra.length },
  ]

  const COL = 'var(--cl-line)'
  const TH: React.CSSProperties = {
    padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)',
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
    borderBottom: `1px solid ${COL}`, whiteSpace: 'nowrap', background: 'var(--cl-line2)',
  }
  const TD: React.CSSProperties = {
    padding: '9px 12px', fontSize: 12, color: 'var(--cl-ink)',
    borderBottom: `1px solid ${COL}`, whiteSpace: 'nowrap',
  }

  return (
    <div style={{ padding: 'var(--cl-page-y) var(--cl-page-x)', maxWidth: 1200, margin: '0 auto' }}>

      {/* BADGE PROPOSTA */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
          background: 'var(--cl-navy)', color: '#fff', letterSpacing: '0.06em' }}>
          PROPOSTA 1 — TRADER VIEW
        </span>
      </div>

      <PageHeader
        title="Renda Fixa"
        description="Preços indicativos ANBIMA · mercado secundário"
        sourceBadge="ANBIMA"
      />

      {/* KPI BAR */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1,
        border: '1px solid var(--cl-line)', borderRadius: 8, overflow: 'hidden',
        background: 'var(--cl-line)', marginBottom: 20,
      }}>
        {[
          { label: 'Debêntures', value: deb.length || '—', sub: 'papéis disponíveis' },
          { label: 'Volume Total', value: fmtVol(totalVol), sub: tab.toUpperCase() + ' · último dia' },
          { label: 'Spread Médio', value: mediaSpread != null ? `${mediaSpread.toFixed(0)} bps` : '—', sub: 'sobre referência' },
          { label: 'Duration Média', value: mediaDur != null ? `${mediaDur.toFixed(1)} anos` : '—', sub: 'carteira ANBIMA' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--cl-card)', padding: '14px 18px' }}>
            <p style={{ fontSize: 10, color: 'var(--cl-ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 3 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* TABS + FILTROS */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--cl-line)', borderRadius: 8, overflow: 'hidden' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setFiltroIdx(null) }} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              background: tab === t.key ? 'var(--cl-navy)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--cl-ink)', border: 'none', cursor: 'pointer',
            }}>
              {t.label}
              <span style={{
                marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 3,
                background: tab === t.key ? 'rgba(255,255,255,.2)' : 'var(--cl-line2)',
                color: tab === t.key ? '#fff' : 'var(--cl-ink3)',
              }}>{t.count || '—'}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setFiltroIdx(null)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
            border: '1px solid var(--cl-line)', cursor: 'pointer',
            background: filtroIdx == null ? 'var(--cl-ink)' : 'transparent',
            color: filtroIdx == null ? '#fff' : 'var(--cl-ink3)',
          }}>Todos</button>
          {indexadores.map(idx => {
            const c = INDEXADOR_COLORS[idx] ?? { bg: 'var(--cl-line2)', color: 'var(--cl-ink3)' }
            return (
              <button key={idx} onClick={() => setFiltroIdx(filtroIdx === idx ? null : idx)} style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                border: `1px solid ${filtroIdx === idx ? c.color : 'var(--cl-line)'}`,
                cursor: 'pointer',
                background: filtroIdx === idx ? c.bg : 'transparent',
                color: filtroIdx === idx ? c.color : 'var(--cl-ink3)',
              }}>{idx}</button>
            )
          })}
        </div>
      </div>

      {/* TABELA */}
      {loading ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{Array.from({length: 8}).map((_, i) => <SkeletonShimmer key={i} h={38} />)}</div> : error ? <ErrorState msg={error} onRetry={() => window.location.reload()} /> : (
        <div style={{ border: '1px solid var(--cl-line)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Código', 'Emissor / Cedente', 'Indexador', 'Taxa % a.a.', 'Spread (bps)', 'Duration', 'Vencimento', 'Volume', 'Rating'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.codigo} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--cl-line2)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--cl-accent-soft)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : 'var(--cl-line2)'}
                  >
                    <td style={{ ...TD, fontWeight: 700, fontFamily: 'monospace', color: 'var(--cl-navy)' }}>{r.codigo}</td>
                    <td style={{ ...TD, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.emissor ?? '—'}</td>
                    <td style={TD}><IndexTag v={r.indexador} /></td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtTaxa(r.taxa)}</td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{r.spread != null ? r.spread.toFixed(0) : '—'}</td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{r.duration != null ? `${r.duration.toFixed(1)}a` : '—'}</td>
                    <td style={{ ...TD, color: 'var(--cl-ink3)' }}>{r.vencimento ? r.vencimento.slice(0, 10) : '—'}</td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{fmtVol(r.volume)}</td>
                    <td style={{ ...TD, color: RATING_COLOR[r.rating ?? ''] ?? 'var(--cl-ink3)', fontWeight: 600 }}>{r.rating ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--cl-line)', fontSize: 11, color: 'var(--cl-ink3)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{filtered.length} ativos · fonte ANBIMA preços indicativos</span>
            {dataRef && <span>Referência: {dataRef}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
