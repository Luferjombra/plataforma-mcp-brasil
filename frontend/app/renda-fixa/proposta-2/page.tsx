'use client'

/**
 * PROPOSTA 2 — "Card Mosaic"
 * Visual moderno com grid de cards coloridos por indexador.
 * Cada ativo é um cartão com taxa em destaque e barra de duration.
 * Ideal para visualização rápida e comparação visual entre ativos.
 */

import { useEffect, useState } from 'react'
import { getDebentures, getCRI, getCRA, type AnbimaDebenture, type AnbimaCRI, type AnbimaCRA } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonShimmer, ErrorState } from '@/components/DataStates'

type Tab = 'deb' | 'cri' | 'cra'

const IDX_THEME: Record<string, { accent: string; soft: string; label: string }> = {
  'CDI':  { accent: 'var(--cl-up)',     soft: 'var(--cl-up-soft)',     label: 'CDI' },
  'IPCA': { accent: 'var(--cl-accent)', soft: 'var(--cl-accent-soft)', label: 'IPCA+' },
  'PRE':  { accent: 'var(--cl-amber)',  soft: 'var(--cl-amber-soft)',  label: 'Pré' },
  'IGPM': { accent: '#7c3aed',          soft: '#f3e8ff',               label: 'IGP-M' },
  'TR':   { accent: 'var(--cl-ink3)',   soft: 'var(--cl-line2)',       label: 'TR' },
}
const DEFAULT_THEME = { accent: 'var(--cl-ink3)', soft: 'var(--cl-line2)', label: '—' }

function fmtVol(v: number | null) {
  if (v == null) return null
  if (v >= 1e9) return `R$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`
  return `R$${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

interface AssetCard {
  codigo: string
  emissor: string | null
  setor: string | null
  indexador: string | null
  taxa: number | null
  duration: number | null
  vencimento: string | null
  volume: number | null
  rating: string | null
}

function toCards(tab: Tab, deb: AnbimaDebenture[], cri: AnbimaCRI[], cra: AnbimaCRA[]): AssetCard[] {
  if (tab === 'deb') return deb.map(d => ({
    codigo: d.codigo,
    emissor: d.anbima_debentures_cadastro?.nome_emissor ?? null,
    setor: d.anbima_debentures_cadastro?.setor ?? null,
    indexador: d.anbima_debentures_cadastro?.indexador ?? null,
    taxa: d.taxa_indicativa, duration: d.duration,
    vencimento: d.anbima_debentures_cadastro?.data_vencimento ?? null,
    volume: d.volume_negociado, rating: d.anbima_debentures_cadastro?.rating_nota ?? null,
  }))
  if (tab === 'cri') return cri.map(c => ({
    codigo: c.codigo,
    emissor: c.anbima_cri_cadastro?.cedente ?? null,
    setor: c.anbima_cri_cadastro?.securitizadora ?? null,
    indexador: c.anbima_cri_cadastro?.indexador ?? null,
    taxa: c.taxa_indicativa, duration: c.duration,
    vencimento: c.anbima_cri_cadastro?.data_vencimento ?? null,
    volume: c.volume_negociado, rating: c.anbima_cri_cadastro?.rating_nota ?? null,
  }))
  return cra.map(c => ({
    codigo: c.codigo,
    emissor: c.anbima_cra_cadastro?.cedente ?? null,
    setor: c.anbima_cra_cadastro?.securitizadora ?? null,
    indexador: c.anbima_cra_cadastro?.indexador ?? null,
    taxa: c.taxa_indicativa, duration: c.duration,
    vencimento: c.anbima_cra_cadastro?.data_vencimento ?? null,
    volume: c.volume_negociado, rating: c.anbima_cra_cadastro?.rating_nota ?? null,
  }))
}

function DurationBar({ dur }: { dur: number | null }) {
  if (dur == null) return null
  const pct = Math.min(100, (dur / 10) * 100)
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cl-ink3)', marginBottom: 4 }}>
        <span>Duration</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{dur.toFixed(1)} anos</span>
      </div>
      <div style={{ height: 3, background: 'var(--cl-line)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--cl-accent)', borderRadius: 2 }} />
      </div>
    </div>
  )
}

function AssetCardComponent({ card }: { card: AssetCard }) {
  const theme = card.indexador ? (IDX_THEME[card.indexador] ?? DEFAULT_THEME) : DEFAULT_THEME
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--cl-card)',
        border: `1px solid ${hov ? theme.accent : 'var(--cl-line)'}`,
        borderRadius: 10, padding: 16, cursor: 'pointer',
        boxShadow: hov ? '0 4px 16px rgba(0,0,0,0.08)' : 'var(--cl-shadow)',
        transform: hov ? 'translateY(-2px)' : 'none',
        transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: theme.accent,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--cl-ink)', letterSpacing: '0.02em' }}>
            {card.codigo}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginTop: 2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.emissor ?? 'Emissor não informado'}
          </div>
        </div>
        {card.rating && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: theme.soft, color: theme.accent,
          }}>{card.rating}</span>
        )}
      </div>

      {/* Taxa em destaque */}
      <div style={{
        background: theme.soft, borderRadius: 8, padding: '12px 14px', marginBottom: 12,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 10, color: theme.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Taxa {theme.label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: theme.accent, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {card.taxa != null ? `${card.taxa.toFixed(2)}%` : '—'}
        </div>
        <div style={{ fontSize: 10, color: theme.accent, marginTop: 2, opacity: 0.7 }}>a.a. · preço indicativo</div>
      </div>

      {/* Meta info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--cl-ink3)' }}>Indexador</span>
          <div style={{ fontWeight: 600, color: 'var(--cl-ink)', marginTop: 2 }}>{card.indexador ?? '—'}</div>
        </div>
        <div>
          <span style={{ color: 'var(--cl-ink3)' }}>Vencimento</span>
          <div style={{ fontWeight: 600, color: 'var(--cl-ink)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {card.vencimento ? card.vencimento.slice(0, 7) : '—'}
          </div>
        </div>
      </div>

      <DurationBar dur={card.duration} />

      {card.volume != null && (
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--cl-ink3)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--cl-line)', paddingTop: 8 }}>
          <span>Volume negociado</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtVol(card.volume)}</span>
        </div>
      )}
    </div>
  )
}

export default function RendaFixaP2() {
  const [tab, setTab] = useState<Tab>('deb')
  const [deb, setDeb] = useState<AnbimaDebenture[]>([])
  const [cri, setCri] = useState<AnbimaCRI[]>([])
  const [cra, setCra] = useState<AnbimaCRA[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroIdx, setFiltroIdx] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([getDebentures(60), getCRI(60), getCRA(60)])
      .then(([d, c, cr]) => { setDeb(d.data); setCri(c.data); setCra(cr.data); setLoading(false) })
      .catch(() => { setError('Falha ao carregar dados ANBIMA'); setLoading(false) })
  }, [])

  const cards = toCards(tab, deb, cri, cra)
  const indexadores = [...new Set(cards.map(c => c.indexador).filter(Boolean) as string[])]
  const filtered = filtroIdx ? cards.filter(c => c.indexador === filtroIdx) : cards

  const TABS: { key: Tab; label: string; desc: string; count: number }[] = [
    { key: 'deb', label: 'Debêntures', desc: 'Dívida corporativa', count: deb.length },
    { key: 'cri', label: 'CRI', desc: 'Recebíveis imobiliários', count: cri.length },
    { key: 'cra', label: 'CRA', desc: 'Recebíveis agronegócio', count: cra.length },
  ]

  return (
    <div style={{ padding: 'var(--cl-page-y) var(--cl-page-x)', maxWidth: 1200, margin: '0 auto' }}>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
          background: 'var(--cl-accent)', color: '#fff', letterSpacing: '0.06em' }}>
          PROPOSTA 2 — CARD MOSAIC
        </span>
      </div>

      <PageHeader
        title="Renda Fixa"
        description="Mercado secundário · preços indicativos ANBIMA"
        sourceBadge="ANBIMA"
      />

      {/* TABS como cartões seletores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setFiltroIdx(null) }} style={{
            padding: '14px 18px', borderRadius: 10, border: `2px solid ${tab === t.key ? 'var(--cl-navy)' : 'var(--cl-line)'}`,
            background: tab === t.key ? 'var(--cl-navy)' : 'var(--cl-card)',
            cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: tab === t.key ? '#fff' : 'var(--cl-ink)' }}>{t.label}</div>
            <div style={{ fontSize: 11, color: tab === t.key ? 'rgba(255,255,255,.6)' : 'var(--cl-ink3)', marginTop: 2 }}>{t.desc}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: tab === t.key ? '#fff' : 'var(--cl-accent)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {t.count || '—'}
            </div>
          </button>
        ))}
      </div>

      {/* FILTROS por indexador */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--cl-ink3)', alignSelf: 'center' }}>Filtrar:</span>
        <button onClick={() => setFiltroIdx(null)} style={{
          padding: '5px 14px', fontSize: 12, fontWeight: filtroIdx == null ? 700 : 400,
          borderRadius: 20, border: '1px solid var(--cl-line)', cursor: 'pointer',
          background: filtroIdx == null ? 'var(--cl-ink)' : 'transparent',
          color: filtroIdx == null ? '#fff' : 'var(--cl-ink3)',
        }}>Todos ({cards.length})</button>
        {indexadores.map(idx => {
          const theme = IDX_THEME[idx] ?? DEFAULT_THEME
          const count = cards.filter(c => c.indexador === idx).length
          return (
            <button key={idx} onClick={() => setFiltroIdx(filtroIdx === idx ? null : idx)} style={{
              padding: '5px 14px', fontSize: 12, fontWeight: filtroIdx === idx ? 700 : 400,
              borderRadius: 20, border: `1px solid ${filtroIdx === idx ? theme.accent : 'var(--cl-line)'}`,
              cursor: 'pointer',
              background: filtroIdx === idx ? theme.soft : 'transparent',
              color: filtroIdx === idx ? theme.accent : 'var(--cl-ink3)',
            }}>{idx} ({count})</button>
          )
        })}
      </div>

      {/* CARD GRID */}
      {loading ? <SkeletonShimmer lines={6} /> : error ? <ErrorState message={error} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map(c => <AssetCardComponent key={c.codigo} card={c} />)}
        </div>
      )}
    </div>
  )
}
