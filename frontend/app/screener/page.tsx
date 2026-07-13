'use client'

import { useEffect, useState, useRef } from 'react'
import { getScreener, type FundamentoRV, type ScreenerParams } from '@/lib/api'
import { SkeletonShimmer, ErrorState, EmptyState } from '@/components/DataStates'
import { formatMilhoes, formatPctSinal } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'

type Sort = NonNullable<ScreenerParams['sort']>

const COLUNAS: { key: Sort; label: string }[] = [
  { key: 'roe',                label: 'ROE'  },
  { key: 'lucro_liquido',      label: 'Lucro Líquido' },
  { key: 'patrimonio_liquido', label: 'Patrimônio Líquido' },
]

const POR_PAGINA = 50
const DEBOUNCE_BUSCA_MS = 350

export default function ScreenerPage() {
  const [linhas, setLinhas]   = useState<FundamentoRV[]>([])
  const [total, setTotal]     = useState(0)
  const [pagina, setPagina]   = useState(1)
  const [sort, setSort]       = useState<Sort>('roe')
  const [order, setOrder]     = useState<'asc' | 'desc'>('desc')
  const [busca, setBusca]     = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), DEBOUNCE_BUSCA_MS)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => { setPagina(1) }, [sort, order, buscaDebounced])

  const recarregar = () => {
    const meuId = ++requestIdRef.current
    setLoading(true); setError(null)
    getScreener({
      q: buscaDebounced || undefined,
      sort, order, page: pagina, perPage: POR_PAGINA,
    }).then(r => {
      if (requestIdRef.current !== meuId) return
      setLinhas(r.data)
      setTotal(r.total)
    }).catch(e => {
      if (requestIdRef.current !== meuId) return
      setError(e instanceof Error ? e.message : 'Erro ao conectar na API')
    }).finally(() => {
      if (requestIdRef.current === meuId) setLoading(false)
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recarregar() }, [sort, order, buscaDebounced, pagina])

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const alternarSort = (campo: Sort) => {
    if (campo === sort) { setOrder(o => o === 'desc' ? 'asc' : 'desc'); return }
    setSort(campo); setOrder('desc')
  }

  if (error) return (
    <div style={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius)' }}>
      <ErrorState msg={error} onRetry={recarregar} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Screener Fundamentalista"
        description="Lucro Líquido, Patrimônio Líquido e ROE por ação — DFP da CVM"
        sourceBadge="CVM · DFP"
      />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por ticker..."
          style={{
            padding: '8px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
            border: '1px solid var(--cl-line)', background: 'var(--cl-card)',
            color: 'var(--cl-ink)', outline: 'none', minWidth: 200,
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {COLUNAS.map(c => (
            <button key={c.key} onClick={() => alternarSort(c.key)} style={{
              padding: '6px 12px', fontSize: 12, fontWeight: sort === c.key ? 700 : 400,
              borderRadius: 'var(--cl-radius-xs)', cursor: 'pointer', transition: 'all 0.15s',
              background: sort === c.key ? 'var(--cl-navy)' : 'var(--cl-card)',
              color: sort === c.key ? '#fff' : 'var(--cl-ink3)',
              border: `1px solid ${sort === c.key ? 'var(--cl-navy)' : 'var(--cl-line)'}`,
            }}>
              {c.label} {sort === c.key ? (order === 'desc' ? '↓' : '↑') : ''}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginLeft: 'auto' }}>
          {total.toLocaleString('pt-BR')} ativo(s) · página {pagina} de {totalPaginas}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
        borderRadius: 'var(--cl-radius)', overflow: 'hidden', boxShadow: 'var(--cl-shadow)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--cl-line2)', borderBottom: '1px solid var(--cl-line)' }}>
                {['Ativo', 'Setor', 'Lucro Líquido', 'Patrimônio Líquido', 'ROE', 'P/L'].map((h, i) => (
                  <th key={h} style={{
                    padding: '8px 14px', fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    textAlign: i === 0 || i === 1 ? 'left' : 'right', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} style={{ padding: '6px 14px' }}><SkeletonShimmer h={28} /></td></tr>
                ))
              ) : linhas.length === 0 ? (
                <tr><td colSpan={6}><EmptyState msg="Nenhum ativo encontrado" hint="Tente remover a busca por ticker" /></td></tr>
              ) : (
                linhas.map(r => {
                  const roePos = (r.roe ?? 0) >= 0
                  return (
                    <tr key={r.ticker} style={{ borderBottom: '1px solid var(--cl-line2)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cl-ink)' }}>{r.ticker}</div>
                        <div style={{ fontSize: 10, color: 'var(--cl-ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{r.nome ?? '—'}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--cl-ink3)' }}>{r.setor ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--cl-ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMilhoes(r.lucro_liquido)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--cl-ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMilhoes(r.patrimonio_liquido)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {r.roe != null ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                            padding: '2px 8px', borderRadius: 4,
                            background: roePos ? 'var(--cl-up-soft)' : 'var(--cl-down-soft)',
                            color: roePos ? 'var(--cl-up)' : 'var(--cl-down)',
                          }}>{formatPctSinal(r.roe)}</span>
                        ) : <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--cl-ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {r.p_l != null ? `${r.p_l.toFixed(1)}x` : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          disabled={pagina <= 1 || loading}
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
            background: 'var(--cl-card)', color: 'var(--cl-ink)', border: '1px solid var(--cl-line)',
            cursor: pagina <= 1 || loading ? 'default' : 'pointer',
            opacity: pagina <= 1 || loading ? 0.5 : 1,
          }}
        >
          ‹ Anterior
        </button>
        <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{pagina} / {totalPaginas}</span>
        <button
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          disabled={pagina >= totalPaginas || loading}
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 'var(--cl-radius-xs)',
            background: 'var(--cl-card)', color: 'var(--cl-ink)', border: '1px solid var(--cl-line)',
            cursor: pagina >= totalPaginas || loading ? 'default' : 'pointer',
            opacity: pagina >= totalPaginas || loading ? 0.5 : 1,
          }}
        >
          Próxima ›
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>
        Cobertura parcial — nem toda ação ON/PN tem Lucro/PL localizável no relatório consolidado
        do ano corrente da CVM. P/L calculado a partir do market cap mais recente; fica sem valor
        quando a empresa reportou prejuízo.
      </p>
    </div>
  )
}
