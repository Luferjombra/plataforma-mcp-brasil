'use client'

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getFundos, getHistoricoFundo, type Fundo, type HistoricoFundo } from '@/lib/api'
import { SkeletonShimmer, ErrorState, EmptyState } from '@/components/DataStates'
import { formatCota, formatMilhoes } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const TIPO_COLORS: Record<string, { color: string; bg: string }> = {
  'Renda Fixa':       { color: 'var(--cl-accent)', bg: 'var(--cl-accent-soft)' },
  'Multimercado':     { color: '#7c3aed',           bg: 'rgba(124,58,237,.08)' },
  'Ações':            { color: 'var(--cl-up)',       bg: 'var(--cl-up-soft)'    },
  'Previdência':      { color: 'var(--cl-amber)',    bg: 'var(--cl-amber-soft)' },
  'Crédito Privado':  { color: '#db2777',            bg: 'rgba(219,39,119,.08)' },
  'ETF':              { color: '#0891b2',            bg: 'rgba(8,145,178,.08)'  },
}

const DEFAULT_TIPO = { color: 'var(--cl-ink3)', bg: 'var(--cl-line2)' }

// Deve bater com `minmax(220px, 1fr)` + `gap: 12` do grid de cards abaixo --
// usado para calcular quantas colunas cabem por linha na virtualização.
const CARD_MIN_WIDTH = 220
const GRID_GAP = 12
const CARD_ROW_HEIGHT = 112 // altura estimada do card + gap vertical

function getNome(f: Fundo): string {
  return f.nome_abreviado ?? f.nome
}

function getTipoColor(tipo: string | null) {
  if (!tipo) return DEFAULT_TIPO
  for (const [key, val] of Object.entries(TIPO_COLORS)) {
    if (tipo.toLowerCase().includes(key.toLowerCase())) return val
  }
  return DEFAULT_TIPO
}

function FundosInner() {
  const searchParams = useSearchParams()
  const cnpjParam    = searchParams.get('cnpj')

  const [fundos, setFundos]           = useState<Fundo[]>([])
  const [selecionado, setSelecionado] = useState<Fundo | null>(null)
  const [historico, setHistorico]     = useState<HistoricoFundo[]>([])
  const [loadingFundos, setLF]        = useState(true)
  const [loadingChart, setLC]         = useState(false)
  const [filtro, setFiltro]           = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const recarregar = () => {
    setLF(true); setError(null)
    getFundos().then(r => {
      setFundos(r.data)
      const init = cnpjParam ? r.data.find(f => f.cnpj === cnpjParam) ?? r.data[0] : r.data[0]
      if (init) setSelecionado(init)
    }).catch(e => setError(e instanceof Error ? e.message : 'Erro ao conectar na API'))
    .finally(() => setLF(false))
  }

  useEffect(() => { recarregar() }, [cnpjParam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selecionado) return
    setLC(true)
    getHistoricoFundo(selecionado.cnpj, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLC(false))
  }, [selecionado])

  const tipos = useMemo(() => {
    const set = new Set<string>()
    fundos.forEach(f => { if (f.tipo_fundo) set.add(f.tipo_fundo) })
    return Array.from(set).sort()
  }, [fundos])

  const fundosFiltrados = useMemo(() =>
    filtro ? fundos.filter(f => f.tipo_fundo === filtro) : fundos
  , [fundos, filtro])

  // Virtualização do grid de cards -- hoje `fundos_cadastro` tem só 8
  // linhas, mas isso prepara o componente para quando o universo de fundos
  // crescer. O grid usa `auto-fill`, então o nº de colunas por linha
  // depende da largura do container (medida via ResizeObserver). A
  // virtualização exige uma área de scroll com altura limitada -- por isso
  // o container abaixo tem `maxHeight` + `overflowY: auto` em vez de deixar
  // o grid crescer com o resto da página (sem isso o virtualizador não tem
  // como saber quais linhas estão "fora da tela").
  // Ref via callback (não `useRef` + `useEffect([])`): a área do grid só
  // monta depois do loading skeleton sair da árvore, então um efeito com
  // deps vazias rodaria antes do elemento existir e nunca mais reobservaria.
  const [gridScrollEl, setGridScrollEl] = useState<HTMLDivElement | null>(null)
  const gridScrollRef = useCallback((node: HTMLDivElement | null) => setGridScrollEl(node), [])
  const [gridWidth, setGridWidth] = useState(0)

  useEffect(() => {
    if (!gridScrollEl) return
    const ro = new ResizeObserver(entries => setGridWidth(entries[0].contentRect.width))
    ro.observe(gridScrollEl)
    return () => ro.disconnect()
  }, [gridScrollEl])

  const colunas = Math.max(1, Math.floor((gridWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)))
  const linhasGrid = Math.ceil(fundosFiltrados.length / colunas)

  const rowVirtualizer = useVirtualizer({
    count: linhasGrid,
    getScrollElement: () => gridScrollEl,
    estimateSize: () => CARD_ROW_HEIGHT,
    overscan: 4,
  })

  const dadosGrafico = useMemo(() =>
    [...historico].reverse().map(d => ({
      data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      cota: d.valor_cota,
    })), [historico])

  const ultCota  = historico[0]
  const primCota = historico[historico.length - 1]
  const retorno  = primCota && ultCota
    ? ((ultCota.valor_cota - primCota.valor_cota) / primCota.valor_cota * 100)
    : null
  const retornoPos = retorno != null && retorno >= 0

  const selColor = getTipoColor(selecionado?.tipo_fundo ?? null)

  if (error) return (
    <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
      <ErrorState msg={error} onRetry={recarregar} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header + Filtros ──────────────────────────── */}
      <div>
        <PageHeader
          title="Fundos de Investimento"
          description={`CVM · Instrução Normativa Diária · ${fundos.length} fundos`}
          sourceBadge="CVM"
        />

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltro(null)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: filtro === null ? 700 : 400,
            borderRadius: 'var(--cl-radius-xs)', cursor: 'pointer', transition: 'all 0.15s',
            background: filtro === null ? 'var(--cl-navy)' : 'var(--cl-card)',
            color: filtro === null ? '#fff' : 'var(--cl-ink3)',
            border: `1px solid ${filtro === null ? 'var(--cl-navy)' : 'var(--cl-line)'}`,
          }}>Todos</button>
          {tipos.map(t => {
            const c = getTipoColor(t)
            const active = filtro === t
            return (
              <button key={t} onClick={() => setFiltro(active ? null : t)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: active ? 700 : 400,
                borderRadius: 'var(--cl-radius-xs)', cursor: 'pointer', transition: 'all 0.15s',
                background: active ? c.color : 'var(--cl-card)',
                color: active ? '#fff' : c.color,
                border: `1px solid ${active ? c.color : 'var(--cl-line)'}`,
              }}>{t}</button>
            )
          })}
        </div>
      </div>

      {/* ── Fund cards grid ───────────────────────────── */}
      {loadingFundos ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonShimmer key={i} h={100} />)}
        </div>
      ) : fundosFiltrados.length === 0 ? (
        <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
          <EmptyState msg="Nenhum fundo encontrado" hint="Tente remover os filtros de tipo" />
        </div>
      ) : (
        <div ref={gridScrollRef} style={{ maxHeight: 640, overflowY: 'auto' }}>
        {gridWidth === 0 ? (
          // Evita 1 frame com `colunas=1` (grid em coluna única) antes do
          // ResizeObserver medir a largura real do container -- achado de
          // revisão (P6).
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonShimmer key={i} h={100} />)}
          </div>
        ) : (
        <div style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map(vRow => {
            const inicio = vRow.index * colunas
            const itensLinha = fundosFiltrados.slice(inicio, inicio + colunas)
            return (
              <div
                key={vRow.key}
                data-index={vRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%',
                  transform: `translateY(${vRow.start}px)`,
                  display: 'grid', gridTemplateColumns: `repeat(${colunas}, 1fr)`, gap: GRID_GAP,
                  paddingBottom: GRID_GAP,
                }}
              >
                {itensLinha.map(f => {
                  const c      = getTipoColor(f.tipo_fundo ?? null)
                  const active = selecionado?.cnpj === f.cnpj
                  return (
                    <button key={f.cnpj} onClick={() => setSelecionado(f)} style={{
                      textAlign: 'left', cursor: 'pointer',
                      background: 'var(--cl-card)',
                      border: `1px solid ${active ? c.color : 'var(--cl-line)'}`,
                      borderTop: `3px solid ${c.color}`,
                      borderRadius: 'var(--cl-radius)',
                      padding: 'var(--cl-card-pad)',
                      boxShadow: active ? 'var(--cl-shadow-hover)' : 'var(--cl-shadow)',
                      transform: active ? 'translateY(-1px)' : 'none',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        {f.tipo_fundo && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            color: c.color, background: c.bg, borderRadius: 4, padding: '2px 7px',
                          }}>{f.tipo_fundo}</span>
                        )}
                        {active && <span style={{ fontSize: 11, color: c.color }}>●</span>}
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--cl-ink)', lineHeight: 1.3, marginBottom: 6 }}>{getNome(f)}</p>
                      <p style={{ fontSize: 10, color: 'var(--cl-ink3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.gestor ?? f.administrador ?? '—'}
                      </p>
                      <p style={{ fontSize: 9, color: 'var(--cl-ink3)', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                        {f.cnpj}
                      </p>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        )}
        </div>
      )}

      {/* ── Selected fund detail ──────────────────────── */}
      {selecionado && (
        <div style={{
          background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
          borderTop: `3px solid ${selColor.color}`,
          borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--cl-line)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                {selecionado.tipo_fundo && (
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: selColor.color, background: selColor.bg, borderRadius: 4, padding: '2px 8px', marginBottom: 8,
                  }}>{selecionado.tipo_fundo}</span>
                )}
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cl-ink)', marginBottom: 4 }}>{getNome(selecionado)}</h2>
                <p style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>
                  {selecionado.classe_anbima && <span>{selecionado.classe_anbima} · </span>}
                  {selecionado.gestor ?? '—'} · CNPJ {selecionado.cnpj}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 12, flexShrink: 0 }}>
                {[
                  { label: 'Valor da Cota', value: formatCota(ultCota?.valor_cota ?? null), sub: 'última disponível' },
                  { label: 'Patrimônio', value: formatMilhoes(ultCota?.patrimonio_liq ?? null), sub: 'consolidado' },
                  {
                    label: 'Retorno 252d',
                    value: retorno != null ? `${retornoPos ? '+' : ''}${retorno.toFixed(2)}%` : '—',
                    sub: '252 dias úteis',
                    accent: retorno != null ? (retornoPos ? 'var(--cl-up)' : 'var(--cl-down)') : undefined,
                  },
                ].map(s => (
                  <div key={s.label} style={{
                    textAlign: 'right', padding: '10px 14px', minWidth: 120,
                    background: 'var(--cl-bg)', borderRadius: 'var(--cl-radius-sm)',
                    border: '1px solid var(--cl-line)',
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--cl-ink3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: s.accent ?? 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '12px 0 8px' }}>
            {loadingChart ? (
              <div style={{ padding: '8px 20px' }}><SkeletonShimmer h={220} /></div>
            ) : dadosGrafico.length === 0 ? (
              <EmptyState msg="Sem histórico disponível" hint="Este fundo pode não ter dados de cota no período" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dadosGrafico} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-fundos-cl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={selColor.color} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={selColor.color} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-line)" vertical={false} />
                  <XAxis dataKey="data" tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickLine={false} height={28} interval={Math.max(1, Math.floor(dadosGrafico.length / 8))} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--cl-ink3)' }} stroke="transparent" tickFormatter={v => v.toFixed(4)} domain={['auto', 'auto']} width={72} tickLine={false} />
                  <Tooltip
                    formatter={(v) => [typeof v === 'number' ? v.toFixed(6) : '—', 'Cota']}
                    contentStyle={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius-sm)', fontSize: 12 }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="cota" stroke={selColor.color} strokeWidth={2} fill="url(#grad-fundos-cl)" dot={false} activeDot={{ r: 4, fill: selColor.color, stroke: 'var(--cl-card)', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FundosPage() {
  return (
    <Suspense>
      <FundosInner />
    </Suspense>
  )
}
