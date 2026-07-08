'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  getDebentures, getCRI, getCRA, getAnbimaSparklines,
  AnbimaDebenture, AnbimaCRI, AnbimaCRA,
} from '@/lib/api'
import { Sparkline } from '@/components/Sparkline'
import { formatDataBR } from '@/lib/format'
import { useApi } from '@/lib/useApi'

// ─── Types ───────────────────────────────────────────────────────────────────

type TabType = 'debentures' | 'cri' | 'cra'

interface Bond {
  codigo: string
  emissor: string
  setor: string | null
  indexador: string | null
  taxa_indicativa: number | null
  spread_ipca: number | null
  spread_cdi: number | null
  pu_mercado: number | null
  duration: number | null
  volume_negociado: number | null
  data_vencimento: string | null
  rating: string | null
  tipo: TabType
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBondFromDeb(d: AnbimaDebenture): Bond {
  const c = d.anbima_debentures_cadastro
  return {
    codigo: d.codigo,
    emissor: c?.nome_emissor ?? d.codigo,
    setor: c?.setor ?? null,
    indexador: c?.indexador ?? null,
    taxa_indicativa: d.taxa_indicativa,
    spread_ipca: d.spread_ipca,
    spread_cdi: d.spread_cdi,
    pu_mercado: d.pu_mercado,
    duration: d.duration,
    volume_negociado: d.volume_negociado,
    data_vencimento: c?.data_vencimento ?? null,
    rating: c?.rating_nota ?? null,
    tipo: 'debentures',
  }
}

function toBondFromCRI(d: AnbimaCRI): Bond {
  const c = d.anbima_cri_cadastro
  return {
    codigo: d.codigo,
    emissor: c?.cedente ?? c?.securitizadora ?? d.codigo,
    setor: 'Imobiliário',
    indexador: c?.indexador ?? null,
    taxa_indicativa: d.taxa_indicativa,
    spread_ipca: d.spread_ipca,
    spread_cdi: d.spread_cdi,
    pu_mercado: d.pu_mercado,
    duration: d.duration,
    volume_negociado: d.volume_negociado,
    data_vencimento: c?.data_vencimento ?? null,
    rating: c?.rating_nota ?? null,
    tipo: 'cri',
  }
}

function toBondFromCRA(d: AnbimaCRA): Bond {
  const c = d.anbima_cra_cadastro
  return {
    codigo: d.codigo,
    emissor: c?.cedente ?? c?.securitizadora ?? d.codigo,
    setor: 'Agronegócio',
    indexador: c?.indexador ?? null,
    taxa_indicativa: d.taxa_indicativa,
    spread_ipca: d.spread_ipca,
    spread_cdi: d.spread_cdi,
    pu_mercado: d.pu_mercado,
    duration: d.duration,
    volume_negociado: d.volume_negociado,
    data_vencimento: c?.data_vencimento ?? null,
    rating: c?.rating_nota ?? null,
    tipo: 'cra',
  }
}

function fmtRate(taxa: number | null, indexador: string | null): string {
  if (taxa == null) return '—'
  const idx = (indexador ?? '').toUpperCase()
  if (idx.includes('CDI')) return `CDI+${taxa.toFixed(2)}%`
  if (idx.includes('IPCA')) return `IPCA+${taxa.toFixed(2)}%`
  if (idx === 'PRE' || idx === 'PREFIXADO') return `${taxa.toFixed(2)}%`
  return `${taxa.toFixed(2)}%`
}

function fmtVol(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e9) return `R$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(0)}M`
  if (v >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`
  return `R$${v.toFixed(0)}`
}

function fmtPU(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ratingColor(r: string | null): { bg: string; text: string } {
  if (!r) return { bg: 'var(--cl-line2)', text: 'var(--cl-ink3)' }
  const upper = r.toUpperCase()
  if (upper.startsWith('AAA') || upper === 'AA+') return { bg: 'rgba(15,157,88,0.12)', text: 'var(--cl-up)' }
  if (upper.startsWith('AA')) return { bg: 'rgba(15,157,88,0.08)', text: 'var(--cl-up)' }
  if (upper.startsWith('A')) return { bg: 'rgba(31,111,235,0.10)', text: 'var(--cl-accent)' }
  if (upper.startsWith('BBB')) return { bg: 'rgba(185,119,10,0.10)', text: 'var(--cl-amber)' }
  return { bg: 'rgba(217,56,56,0.10)', text: 'var(--cl-down)' }
}

function idxColor(idx: string | null): { bg: string; text: string } {
  const i = (idx ?? '').toUpperCase()
  if (i.includes('CDI')) return { bg: 'var(--cl-up-soft)', text: 'var(--cl-up)' }
  if (i.includes('IPCA')) return { bg: 'var(--cl-accent-soft)', text: 'var(--cl-accent)' }
  return { bg: 'var(--cl-amber-soft)', text: 'var(--cl-amber)' }
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function IdxTag({ idx }: { idx: string | null }) {
  const label = idx ? idx.toUpperCase().replace('PREFIXADO', 'PRE') : '—'
  const { bg, text } = idxColor(idx)
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 6px',
      borderRadius: 4, background: bg, color: text, display: 'inline-block',
    }}>{label}</span>
  )
}

function RatingBadge({ rating }: { rating: string | null }) {
  const { bg, text } = ratingColor(rating)
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
      background: bg, color: text, display: 'inline-block',
    }}>{rating ?? 'N/R'}</span>
  )
}

function MiniLine({ values, color }: { values: number[]; color: string }) {
  return (
    <Sparkline
      data={values} width={60} height={24} padding={2}
      color={color} filled={false} showDot={false} strokeWidth={1.5}
    />
  )
}

// ─── Bond Detail Panel ────────────────────────────────────────────────────────

function BondDetail({ bond, sparkline }: { bond: Bond; sparkline: number[] }) {
  const idx = (bond.indexador ?? '').toUpperCase()
  const isIPCA = idx.includes('IPCA')
  const isCDI = idx.includes('CDI')
  const { text: accentColor } = idxColor(bond.indexador)

  const labelTaxa = isIPCA ? 'Taxa Indicativa IPCA+' : isCDI ? 'Taxa Indicativa CDI+' : 'Taxa Prefixada'

  const spreadIPCA = bond.spread_ipca != null ? `${(bond.spread_ipca * 100).toFixed(0)} bps` : '—'
  const spreadCDI = bond.spread_cdi != null ? `${(bond.spread_cdi * 100).toFixed(0)} bps` : '—'

  const durPct = bond.duration ? Math.min((bond.duration / 12) * 100, 100) : 0

  return (
    <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--cl-ink)' }}>
            {bond.codigo}
          </div>
          <div style={{ fontSize: 13, color: 'var(--cl-ink3)', marginTop: 4 }}>
            {bond.emissor}{bond.setor ? ` · ${bond.setor}` : ''}
          </div>
        </div>
        <RatingBadge rating={bond.rating} />
      </div>

      {/* Taxa Hero */}
      <div style={{
        background: 'var(--cl-accent-soft)', border: '1px solid rgba(31,111,235,.15)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accentColor, marginBottom: 8 }}>
          {labelTaxa}
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, color: accentColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {bond.taxa_indicativa != null ? `${bond.taxa_indicativa.toFixed(2)}%` : '—'}
        </div>
        <div style={{ marginTop: 10 }}>
          <MiniLine values={sparkline} color={accentColor} />
        </div>
        <div style={{ fontSize: 11, color: accentColor, opacity: 0.7, marginTop: 4 }}>
          a.a. · mercado secundário · preço indicativo ANBIMA
        </div>
      </div>

      {/* Spreads */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Spread IPCA', value: spreadIPCA, sub: 'sobre NTN-B par' },
          { label: 'Spread CDI', value: spreadCDI, sub: 'sobre CDI à vista' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--cl-line2)', borderRadius: 8, padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cl-ink3)', marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--cl-ink)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { key: 'Indexador', val: bond.indexador ?? '—' },
          { key: 'Vencimento', val: formatDataBR(bond.data_vencimento) },
          { key: 'Volume Neg.', val: fmtVol(bond.volume_negociado) },
        ].map(c => (
          <div key={c.key} style={{ padding: 12, background: 'var(--cl-line2)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cl-ink3)', marginBottom: 4 }}>
              {c.key}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>
              {c.val}
            </div>
          </div>
        ))}
      </div>

      {/* Duration bar */}
      {bond.duration != null && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cl-ink3)', marginBottom: 10 }}>
            Duration
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--cl-ink3)', marginBottom: 6 }}>
            <span>Curto prazo</span>
            <span style={{ fontWeight: 700, color: 'var(--cl-ink)' }}>{bond.duration.toFixed(1)} anos</span>
            <span>Longo prazo (12a)</span>
          </div>
          <div style={{ height: 6, background: 'var(--cl-line)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${durPct}%`, background: 'linear-gradient(90deg, var(--cl-accent), #7c3aed)' }} />
          </div>
        </div>
      )}

      {/* PU */}
      <div style={{ background: 'var(--cl-line2)', borderRadius: 8, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--cl-ink3)', fontWeight: 600 }}>PU Mercado</div>
          <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 2 }}>preço indicativo ANBIMA</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtPU(bond.pu_mercado)}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const RENDA_FIXA_VAZIO = { debs: [] as Bond[], cris: [] as Bond[], cras: [] as Bond[], sparklines: {} as Record<string, number[]> }

export default function RendaFixaPage() {
  const [tab, setTab] = useState<TabType>('debentures')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Bond | null>(null)

  const { data, loading, error } = useApi(async () => {
    const [debRes, criRes, craRes, debSp, criSp, craSp] = await Promise.all([
      getDebentures(100),
      getCRI(100),
      getCRA(100),
      getAnbimaSparklines('debentures', 7).catch(() => ({ data: {} })),
      getAnbimaSparklines('cri', 7).catch(() => ({ data: {} })),
      getAnbimaSparklines('cra', 7).catch(() => ({ data: {} })),
    ])
    return {
      debs: (debRes.data ?? []).map(toBondFromDeb),
      cris: (criRes.data ?? []).map(toBondFromCRI),
      cras: (craRes.data ?? []).map(toBondFromCRA),
      sparklines: { ...debSp.data, ...criSp.data, ...craSp.data },
    }
  }, [])

  const { debs, cris, cras, sparklines } = data ?? RENDA_FIXA_VAZIO

  useEffect(() => {
    if (debs.length > 0) setSelected(debs[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debs])

  const activeList = tab === 'debentures' ? debs : tab === 'cri' ? cris : cras

  const filtered = useMemo(() => {
    if (!search.trim()) return activeList
    const q = search.toLowerCase()
    return activeList.filter(b =>
      b.codigo.toLowerCase().includes(q) ||
      b.emissor.toLowerCase().includes(q) ||
      (b.indexador ?? '').toLowerCase().includes(q)
    )
  }, [activeList, search])

  // avg taxa by indexador for topbar
  const avgByIdx = useMemo(() => {
    const byIdx: Record<string, number[]> = {}
    activeList.forEach(b => {
      if (b.taxa_indicativa == null) return
      const k = (b.indexador ?? 'OUT').toUpperCase().replace('PREFIXADO', 'PRE')
      const baseKey = k.includes('IPCA') ? 'IPCA' : k.includes('CDI') ? 'CDI' : 'PRE'
      if (!byIdx[baseKey]) byIdx[baseKey] = []
      byIdx[baseKey].push(b.taxa_indicativa)
    })
    return Object.fromEntries(
      Object.entries(byIdx).map(([k, vals]) => [k, vals.reduce((a, b) => a + b, 0) / vals.length])
    )
  }, [activeList])

  const counts = { debentures: debs.length, cri: cris.length, cra: cras.length }

  // Virtualização da lista -- hoje limitada a 100 itens/aba (getDebentures/
  // getCRI/getCRA), mas prepara o componente para quando o limite subir.
  const listParentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 62,
    overscan: 8,
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[180, 56, 400].map((h, i) => (
          <div key={i} style={{
            height: h, borderRadius: 'var(--cl-radius-sm)',
            background: 'var(--cl-line)', animation: 'pulse 1.4s ease-in-out infinite',
          }} />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, borderRadius: 'var(--cl-radius-sm)', border: '1px solid rgba(217,56,56,.3)', background: 'var(--cl-down-soft)', color: 'var(--cl-down)', fontSize: 14 }}>
        {error}
        <button onClick={() => window.location.reload()} style={{ marginLeft: 12, fontSize: 12, background: 'none', border: 'none', color: 'var(--cl-down)', cursor: 'pointer', textDecoration: 'underline' }}>
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Top bar ── */}
      <div style={{
        background: 'var(--cl-navy)', borderRadius: 'var(--cl-radius-sm) var(--cl-radius-sm) 0 0',
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>Renda Fixa</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>
            Scanner de mercado secundário · ANBIMA
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {Object.entries(avgByIdx).map(([key, avg]) => {
            const { text: c } = idxColor(key)
            return (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,.45)', marginBottom: 2 }}>
                  Média {key}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c }}>
                  {key === 'PRE' ? `${avg.toFixed(2)}%` : `${key}+${avg.toFixed(2)}%`}
                </div>
              </div>
            )
          })}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,.45)', marginBottom: 2 }}>
              Fonte
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--cl-accent)', background: 'rgba(31,111,235,.18)',
              border: '1px solid rgba(31,111,235,.3)', borderRadius: 4, padding: '2px 8px',
            }}>
              ANBIMA
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 0, borderLeft: '1px solid var(--cl-line)', borderRight: '1px solid var(--cl-line)',
        background: 'var(--cl-card)',
      }}>
        {(['debentures', 'cri', 'cra'] as TabType[]).map(t => {
          const labels: Record<TabType, string> = { debentures: 'Debêntures', cri: 'CRI', cra: 'CRA' }
          const active = t === tab
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); setSelected(null) }}
              style={{
                padding: '9px 18px', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer',
                background: active ? 'var(--cl-navy)' : 'transparent',
                color: active ? '#fff' : 'var(--cl-ink)',
                border: 'none', borderBottom: active ? 'none' : '1px solid var(--cl-line)',
                transition: 'background .15s',
              }}
            >
              {labels[t]}
              <span style={{
                marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 3,
                background: active ? 'rgba(255,255,255,.2)' : 'var(--cl-line2)',
                color: active ? '#fff' : 'var(--cl-ink3)',
              }}>
                {counts[t]}
              </span>
            </button>
          )
        })}
        <div style={{ flex: 1, borderBottom: '1px solid var(--cl-line)' }} />
      </div>

      {/* ── Split layout ──
          `height` (não `minHeight`) é necessário para o painel de lista
          poder usar `overflowY: auto` de verdade -- sem uma altura definida
          aqui, o grid cresce para caber todo o conteúdo e a virtualização
          da lista nunca teria uma janela visível menor que o total.
          `min(560px, ...)` evita que os 560px fixos estourem em viewports
          curtas (achado de revisão -- diferente de `/rv`, que usa
          `maxHeight` sem limite superior porque a lista lá é só uma
          coluna que pode crescer livremente; aqui preferimos não
          redesenhar o grid 2 colunas para mobile agora). */}
      <div style={{
        display: 'grid', gridTemplateColumns: '310px 1fr', gridTemplateRows: 'minmax(0, 1fr)', gap: 0,
        border: '1px solid var(--cl-line)', borderTop: 'none',
        borderRadius: '0 0 var(--cl-radius-sm) var(--cl-radius-sm)',
        overflow: 'hidden', height: 'min(560px, calc(100vh - 220px))',
      }}>
        {/* List panel */}
        <div style={{ borderRight: '1px solid var(--cl-line)', background: 'var(--cl-card)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--cl-line)' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar código ou emissor..."
              style={{
                width: '100%', padding: '7px 10px', border: '1px solid var(--cl-line)',
                borderRadius: 6, fontSize: 12, color: 'var(--cl-ink)',
                background: 'var(--cl-line2)', outline: 'none',
              }}
            />
          </div>

          <div ref={listParentRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--cl-ink3)' }}>
                Nenhum ativo encontrado
              </div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map(vRow => {
                  const bond = filtered[vRow.index]
                  const isActive = selected?.codigo === bond.codigo
                  const sp = sparklines[bond.codigo] ?? []
                  const { text: spColor } = idxColor(bond.indexador)
                  return (
                    <div
                      key={bond.codigo}
                      data-index={vRow.index}
                      ref={rowVirtualizer.measureElement}
                      onClick={() => setSelected(bond)}
                      style={{
                        position: 'absolute', top: 0, left: 0, width: '100%',
                        transform: `translateY(${vRow.start}px)`,
                        padding: '11px 13px', borderBottom: '1px solid var(--cl-line)',
                        cursor: 'pointer', transition: 'background .1s',
                        background: isActive ? 'var(--cl-accent-soft)' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--cl-accent)' : '3px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--cl-navy)' }}>
                          {bond.codigo}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: spColor }}>
                          {fmtRate(bond.taxa_indicativa, bond.indexador)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          fontSize: 11, color: 'var(--cl-ink3)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150,
                        }}>
                          {bond.emissor}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {sp.length >= 2 && <MiniLine values={sp} color={spColor} />}
                          <IdxTag idx={bond.indexador} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ padding: '8px 13px', borderTop: '1px solid var(--cl-line)', fontSize: 11, color: 'var(--cl-ink3)' }}>
            {filtered.length} ativos
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ background: 'var(--cl-card)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selected ? (
            <BondDetail bond={selected} sparkline={sparklines[selected.codigo] ?? []} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cl-ink3)', fontSize: 13 }}>
              Selecione um ativo para ver os detalhes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
