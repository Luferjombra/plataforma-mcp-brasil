'use client'

/**
 * PROPOSTA 3 — "Market Scanner"
 * Layout master-detail: lista compacta à esquerda + painel de detalhe à direita.
 * Ao clicar num ativo, o painel direito expande com todos os dados e gráfico de taxa.
 * Ideal para análise detalhada de ativos individuais.
 */

import { useEffect, useState } from 'react'
import {
  getDebentures, getCRI, getCRA,
  type AnbimaDebenture, type AnbimaCRI, type AnbimaCRA,
} from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonShimmer, ErrorState } from '@/components/DataStates'

type Tab = 'deb' | 'cri' | 'cra'

const IDX_ACCENT: Record<string, string> = {
  'CDI': 'var(--cl-up)', 'IPCA': 'var(--cl-accent)',
  'PRE': 'var(--cl-amber)', 'IGPM': '#7c3aed', 'TR': 'var(--cl-ink3)',
}

function fmtVol(v: number | null) {
  if (v == null) return '—'
  if (v >= 1e9) return `R$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`
  return `R$${(v / 1e3).toFixed(0)}K`
}

interface Item {
  codigo: string
  emissor: string | null
  indexador: string | null
  taxa: number | null
  duration: number | null
  vencimento: string | null
  volume: number | null
  rating: string | null
  setor: string | null
  spreadCdi: number | null
  spreadIpca: number | null
  puMercado: number | null
}

function toItems(tab: Tab, deb: AnbimaDebenture[], cri: AnbimaCRI[], cra: AnbimaCRA[]): Item[] {
  if (tab === 'deb') return deb.map(d => ({
    codigo: d.codigo,
    emissor: d.anbima_debentures_cadastro?.nome_emissor ?? null,
    indexador: d.anbima_debentures_cadastro?.indexador ?? null,
    taxa: d.taxa_indicativa, duration: d.duration,
    vencimento: d.anbima_debentures_cadastro?.data_vencimento ?? null,
    volume: d.volume_negociado,
    rating: d.anbima_debentures_cadastro?.rating_nota ?? null,
    setor: d.anbima_debentures_cadastro?.setor ?? null,
    spreadCdi: d.spread_cdi, spreadIpca: d.spread_ipca, puMercado: d.pu_mercado,
  }))
  if (tab === 'cri') return cri.map(c => ({
    codigo: c.codigo,
    emissor: c.anbima_cri_cadastro?.cedente ?? null,
    indexador: c.anbima_cri_cadastro?.indexador ?? null,
    taxa: c.taxa_indicativa, duration: c.duration,
    vencimento: c.anbima_cri_cadastro?.data_vencimento ?? null,
    volume: c.volume_negociado,
    rating: c.anbima_cri_cadastro?.rating_nota ?? null,
    setor: c.anbima_cri_cadastro?.securitizadora ?? null,
    spreadCdi: c.spread_cdi, spreadIpca: c.spread_ipca, puMercado: c.pu_mercado,
  }))
  return cra.map(c => ({
    codigo: c.codigo,
    emissor: c.anbima_cra_cadastro?.cedente ?? null,
    indexador: c.anbima_cra_cadastro?.indexador ?? null,
    taxa: c.taxa_indicativa, duration: c.duration,
    vencimento: c.anbima_cra_cadastro?.data_vencimento ?? null,
    volume: c.volume_negociado,
    rating: c.anbima_cra_cadastro?.rating_nota ?? null,
    setor: c.anbima_cra_cadastro?.securitizadora ?? null,
    spreadCdi: c.spread_cdi, spreadIpca: c.spread_ipca, puMercado: c.pu_mercado,
  }))
}

function DetailField({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--cl-line)' }}>
      <div style={{ fontSize: 10, color: 'var(--cl-ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-ink)', fontVariantNumeric: mono ? 'tabular-nums' : 'normal', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function DetailPanel({ item }: { item: Item }) {
  const accent = item.indexador ? (IDX_ACCENT[item.indexador] ?? 'var(--cl-ink3)') : 'var(--cl-ink3)'

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Taxa em destaque */}
      <div style={{ padding: 20, borderBottom: '1px solid var(--cl-line)', background: 'var(--cl-line2)' }}>
        <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginBottom: 6 }}>TAXA INDICATIVA · {item.indexador ?? '—'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {item.taxa != null ? item.taxa.toFixed(2) : '—'}
          </span>
          <span style={{ fontSize: 18, color: accent, opacity: 0.7 }}>% a.a.</span>
        </div>
        {item.puMercado != null && (
          <div style={{ fontSize: 12, color: 'var(--cl-ink3)', marginTop: 8 }}>
            PU Mercado: <strong style={{ color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>
              {item.puMercado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
          </div>
        )}
      </div>

      {/* Spreads */}
      {(item.spreadCdi != null || item.spreadIpca != null) && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--cl-line)', display: 'flex', gap: 20 }}>
          {item.spreadCdi != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--cl-ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Spread CDI</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cl-up)', fontVariantNumeric: 'tabular-nums' }}>{item.spreadCdi.toFixed(0)} bps</div>
            </div>
          )}
          {item.spreadIpca != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--cl-ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Spread IPCA</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cl-accent)', fontVariantNumeric: 'tabular-nums' }}>{item.spreadIpca.toFixed(0)} bps</div>
            </div>
          )}
        </div>
      )}

      {/* Campos detalhados */}
      <div style={{ padding: '0 20px' }}>
        <DetailField label="Código" value={item.codigo} mono />
        <DetailField label="Emissor / Cedente" value={item.emissor} />
        {item.setor && <DetailField label="Setor / Securitizadora" value={item.setor} />}
        <DetailField label="Indexador" value={item.indexador} />
        <DetailField label="Rating" value={item.rating} />
        <DetailField label="Vencimento" value={item.vencimento?.slice(0, 10) ?? null} mono />
        <DetailField label="Duration" value={item.duration != null ? `${item.duration.toFixed(2)} anos` : null} mono />
        <DetailField label="Volume Negociado" value={fmtVol(item.volume)} mono />
      </div>

      {/* Gauge da duration */}
      {item.duration != null && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginBottom: 8 }}>Duration relativa (máx 10 anos)</div>
          <div style={{ height: 6, background: 'var(--cl-line)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (item.duration / 10) * 100)}%`,
              background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
              borderRadius: 4, transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cl-ink3)', marginTop: 4 }}>
            <span>0a</span><span>5a</span><span>10a</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RendaFixaP3() {
  const [tab, setTab] = useState<Tab>('deb')
  const [deb, setDeb] = useState<AnbimaDebenture[]>([])
  const [cri, setCri] = useState<AnbimaCRI[]>([])
  const [cra, setCra] = useState<AnbimaCRA[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([getDebentures(100), getCRI(100), getCRA(100)])
      .then(([d, c, cr]) => {
        setDeb(d.data); setCri(c.data); setCra(cr.data)
        setLoading(false)
      })
      .catch(() => { setError('Falha ao carregar dados ANBIMA'); setLoading(false) })
  }, [])

  const items = toItems(tab, deb, cri, cra)
  const filtered = search
    ? items.filter(i =>
        i.codigo.toLowerCase().includes(search.toLowerCase()) ||
        (i.emissor ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : items

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'deb', label: 'Debêntures', count: deb.length },
    { key: 'cri', label: 'CRI', count: cri.length },
    { key: 'cra', label: 'CRA', count: cra.length },
  ]

  const H = 'calc(100vh - 220px)'

  return (
    <div style={{ padding: 'var(--cl-page-y) var(--cl-page-x)', maxWidth: 1200, margin: '0 auto' }}>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
          background: 'var(--cl-up)', color: '#fff', letterSpacing: '0.06em' }}>
          PROPOSTA 3 — MARKET SCANNER
        </span>
      </div>

      <PageHeader
        title="Renda Fixa"
        description="Scanner de mercado secundário · ANBIMA"
        sourceBadge="ANBIMA"
      />

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cl-line)', marginBottom: 0, gap: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); setSearch('') }} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? 'var(--cl-navy)' : 'var(--cl-ink3)',
            border: 'none', borderBottom: `2px solid ${tab === t.key ? 'var(--cl-navy)' : 'transparent'}`,
            background: 'transparent', cursor: 'pointer', marginBottom: -1,
          }}>
            {t.label}
            {t.count > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--cl-ink3)' }}>({t.count})</span>}
          </button>
        ))}
      </div>

      {/* SPLIT LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0, height: H, border: '1px solid var(--cl-line)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>

        {/* LEFT — Lista */}
        <div style={{ borderRight: '1px solid var(--cl-line)', display: 'flex', flexDirection: 'column', background: 'var(--cl-card)' }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--cl-line)' }}>
            <input
              placeholder="Buscar código ou emissor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 12px', fontSize: 12,
                border: '1px solid var(--cl-line)', borderRadius: 6,
                background: 'var(--cl-bg)', color: 'var(--cl-ink)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div style={{ padding: 16 }}><SkeletonShimmer lines={6} /></div> :
             error ? <div style={{ padding: 16 }}><ErrorState message={error} /></div> :
             filtered.map(item => {
               const accent = item.indexador ? (IDX_ACCENT[item.indexador] ?? 'var(--cl-ink3)') : 'var(--cl-ink3)'
               const isSel = selected?.codigo === item.codigo
               return (
                 <div key={item.codigo} onClick={() => setSelected(item)} style={{
                   padding: '12px 16px',
                   borderBottom: '1px solid var(--cl-line)',
                   borderLeft: `3px solid ${isSel ? accent : 'transparent'}`,
                   background: isSel ? 'var(--cl-line2)' : 'transparent',
                   cursor: 'pointer', transition: 'all 0.1s',
                 }}
                   onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--cl-line2)' }}
                   onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                 >
                   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                     <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: isSel ? accent : 'var(--cl-ink)' }}>
                       {item.codigo}
                     </span>
                     <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>
                       {item.taxa != null ? `${item.taxa.toFixed(2)}%` : '—'}
                     </span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                     <span style={{ color: 'var(--cl-ink3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                       {item.emissor ?? 'Emissor n/d'}
                     </span>
                     <span style={{
                       fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                       background: 'var(--cl-line2)', color: accent,
                     }}>{item.indexador ?? '—'}</span>
                   </div>
                 </div>
               )
             })
            }
          </div>
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--cl-line)', fontSize: 10, color: 'var(--cl-ink3)' }}>
            {filtered.length} ativos {search && `(buscando "${search}")`}
          </div>
        </div>

        {/* RIGHT — Detalhe */}
        <div style={{ background: 'var(--cl-bg)', overflowY: 'auto' }}>
          {selected ? (
            <DetailPanel item={selected} />
          ) : (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--cl-ink3)', gap: 12,
            }}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>→</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Selecione um ativo</div>
              <div style={{ fontSize: 12 }}>Clique em qualquer linha da lista para ver os detalhes</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
