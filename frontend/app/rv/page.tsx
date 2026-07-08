'use client'

import { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getAtivos, getHistoricoRV, type Ativo, type Historico } from '@/lib/api'
import { SkeletonShimmer, ErrorState, EmptyState } from '@/components/DataStates'
import { formatBRL, formatCap } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type Filtro = 'todos' | 'acao' | 'fii'
type Range  = '5d' | '1m' | '3m' | '6m' | '1a'

const RANGE_N: Record<Range, number> = { '5d': 5, '1m': 21, '3m': 63, '6m': 126, '1a': 252 }
const POR_PAGINA = 50
const DEBOUNCE_BUSCA_MS = 350

function RVInner() {
  const searchParams  = useSearchParams()
  const tickerParam   = searchParams.get('ticker')

  const [ativos, setAtivos]             = useState<Ativo[]>([])
  const [total, setTotal]               = useState(0)
  const [pagina, setPagina]             = useState(1)
  const [busca, setBusca]               = useState(tickerParam ?? '')
  const [buscaDebounced, setBuscaDebounced] = useState(tickerParam ?? '')
  const [selecionado, setSelecionado]   = useState<string | null>(null)
  // Objeto completo do ativo selecionado, guardado à parte de `ativos` --
  // sem isso, trocar de página faz o painel de detalhe "sumir" assim que o
  // ticker selecionado não está mais na página atual (achado de revisão).
  const [ativoSel, setAtivoSel]         = useState<Ativo | null>(null)
  const [historico, setHistorico]       = useState<Historico[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingChart, setLoadingChart]   = useState(false)
  const [filtro, setFiltro]             = useState<Filtro>('todos')
  const [range, setRange]               = useState<Range>('1a')
  const [error, setError]               = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const selecionarAtivo = (a: Ativo) => {
    setSelecionado(a.ticker)
    setAtivoSel(a)
  }

  // Busca com debounce -- evita 1 requisição por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), DEBOUNCE_BUSCA_MS)
    return () => clearTimeout(t)
  }, [busca])

  // Trocar filtro ou busca reinicia a paginação.
  useEffect(() => { setPagina(1) }, [filtro, buscaDebounced])

  // Deep-link vindo da busca global (SearchBar navega para /rv?ticker=X):
  // preenche a busca com o ticker para garantir que ele apareça na lista
  // (sem isso, um ticker fora da página 1 alfabética nunca seria
  // encontrado -- achado de revisão) e limpa a seleção atual para forçar
  // o auto-select em `recarregar` a escolher o novo ticker do deep-link.
  useEffect(() => {
    if (tickerParam) {
      setBusca(tickerParam); setBuscaDebounced(tickerParam); setSelecionado(null)
    }
  }, [tickerParam])

  const recarregar = () => {
    const meuId = ++requestIdRef.current
    setLoadingAtivos(true); setError(null)
    getAtivos({
      q: buscaDebounced || undefined,
      tipo: filtro === 'fii' ? 'FII' : undefined,
      excluirFii: filtro === 'acao',
      page: pagina,
      perPage: POR_PAGINA,
    }).then(r => {
      if (requestIdRef.current !== meuId) return // resposta desatualizada (troca rápida de filtro/página) -- ignorar
      setAtivos(r.data)
      setTotal(r.total)
      if (!selecionado) {
        const init = tickerParam
          ? r.data.find(a => a.ticker === tickerParam.toUpperCase()) ?? r.data[0]
          : r.data[0]
        if (init) selecionarAtivo(init)
      }
    }).catch(e => {
      if (requestIdRef.current !== meuId) return
      setError(e instanceof Error ? e.message : 'Erro ao conectar na API')
    }).finally(() => {
      if (requestIdRef.current === meuId) setLoadingAtivos(false)
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recarregar() }, [tickerParam, filtro, buscaDebounced, pagina])

  useEffect(() => {
    if (!selecionado) return
    setLoadingChart(true)
    getHistoricoRV(selecionado, 252)
      .then(r => setHistorico(r.data))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingChart(false))
  }, [selecionado])

  // Ordenação por variação diária é feita client-side só na página atual
  // (50 itens) -- a busca/filtro/paginação em si já são server-side (E2).
  const ativosFiltrados = useMemo(() => [...ativos].sort((a, b) => {
    if (a.var_dia_pct == null && b.var_dia_pct == null) return 0
    if (a.var_dia_pct == null) return 1
    if (b.var_dia_pct == null) return -1
    return b.var_dia_pct - a.var_dia_pct
  }), [ativos])

  // Virtualização da lista -- POR_PAGINA é 50 hoje, mas isso prepara a
  // lista para quando per_page crescer (ou a paginação for removida em
  // favor de scroll infinito) sem precisar revisitar este componente.
  const listParentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: ativosFiltrados.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 46,
    overscan: 8,
  })

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const isFII = ativoSel?.tipo === 'FII'

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

  if (error) return (
    <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
      <ErrorState msg={error} onRetry={recarregar} />
    </div>
  )

  return (
    <>
      <PageHeader
        title="Renda Variável"
        description="Ações e FIIs negociados na B3 — cotações e histórico de preços"
        sourceBadge="B3 · brapi"
      />

      <div className="cl-panel-rv">

      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Busca por ticker ou nome (server-side — ver ADR-001 E2) */}
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por ticker ou nome..."
          style={{
            padding: '8px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
            border: '1px solid var(--cl-line)', background: 'var(--cl-card)',
            color: 'var(--cl-ink)', outline: 'none',
          }}
        />

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
          {total.toLocaleString('pt-BR')} ativo(s) · página {pagina} de {totalPaginas}
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

          <div ref={listParentRef} className="cl-rv-list" style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {loadingAtivos ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, i) => <SkeletonShimmer key={i} h={44} />)}
              </div>
            ) : ativosFiltrados.length === 0 ? (
              <EmptyState msg="Nenhum ativo encontrado" />
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map(vRow => {
                  const a = ativosFiltrados[vRow.index]
                  const active = selecionado === a.ticker
                  const pos    = (a.var_dia_pct ?? 0) >= 0
                  return (
                    <button
                      key={a.ticker}
                      data-index={vRow.index}
                      ref={rowVirtualizer.measureElement}
                      onClick={() => selecionarAtivo(a)}
                      style={{
                        position: 'absolute', top: 0, left: 0, width: '100%',
                        transform: `translateY(${vRow.start}px)`,
                        display: 'grid', gridTemplateColumns: '1fr auto auto',
                        gap: 8, alignItems: 'center', padding: '10px 14px', textAlign: 'left',
                        background: active ? 'var(--cl-accent-soft)' : 'transparent',
                        borderLeft: active ? '3px solid var(--cl-accent)' : '3px solid transparent',
                        borderBottom: '1px solid var(--cl-line2)',
                        cursor: 'pointer', transition: 'background 0.1s',
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

        {/* Pagination — E2, ADR-001 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina <= 1 || loadingAtivos}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
              background: 'var(--cl-card)', color: 'var(--cl-ink)', border: '1px solid var(--cl-line)',
              cursor: pagina <= 1 || loadingAtivos ? 'default' : 'pointer',
              opacity: pagina <= 1 || loadingAtivos ? 0.5 : 1,
            }}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>
            {pagina} / {totalPaginas}
          </span>
          <button
            onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas || loadingAtivos}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
              background: 'var(--cl-card)', color: 'var(--cl-ink)', border: '1px solid var(--cl-line)',
              cursor: pagina >= totalPaginas || loadingAtivos ? 'default' : 'pointer',
              opacity: pagina >= totalPaginas || loadingAtivos ? 0.5 : 1,
            }}
          >
            Próxima ›
          </button>
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
    </>
  )
}

export default function RVPage() {
  return (
    <Suspense>
      <RVInner />
    </Suspense>
  )
}
