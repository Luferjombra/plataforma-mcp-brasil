'use client'

import { useEffect, useState, useMemo } from 'react'
import { getNoticias, getIndicadores, type Noticia } from '@/lib/api'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { juroRealFisher, formatPctSinal } from '@/lib/format'

type Categoria = 'Todos' | 'Macro' | 'Renda Variável' | 'Renda Fixa' | 'Fundos' | 'Outros'

const CAT_STYLES: Record<string, { fg: string; bg: string }> = {
  'Macro':          { fg: 'var(--cl-accent)',  bg: 'rgba(31,111,235,.12)' },
  'Renda Variável': { fg: 'var(--cl-up)',      bg: 'rgba(15,157,88,.13)'  },
  'Renda Fixa':     { fg: 'var(--cl-amber)',   bg: 'rgba(185,119,10,.14)' },
  'Fundos':         { fg: '#7c3aed',            bg: 'rgba(124,58,237,.10)' },
  'Outros':         { fg: 'var(--cl-ink3)',     bg: 'rgba(107,124,150,.1)' },
  'Todos':          { fg: 'var(--cl-ink)',      bg: 'transparent'          },
}

const FILTROS: Categoria[] = ['Todos', 'Macro', 'Renda Variável', 'Renda Fixa', 'Fundos', 'Outros']

function tempoRelativo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  return d.toLocaleDateString('pt-BR')
}

function catTag(cat: string | null) {
  if (!cat) return null
  const s = CAT_STYLES[cat] ?? CAT_STYLES['Outros']
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      color: s.fg, background: s.bg,
      padding: '2px 8px', borderRadius: 99, display: 'inline-block',
    }}>
      {cat}
    </span>
  )
}

export default function NoticiasPage() {
  const [noticias, setNoticias]     = useState<Noticia[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro]             = useState<string | null>(null)
  const [filtro, setFiltro]         = useState<Categoria>('Todos')
  const [ultimaAtt, setUltimaAtt]   = useState<Date | null>(null)
  const [selic, setSelic]           = useState<number | null>(null)
  const [ipca, setIpca]             = useState<number | null>(null)

  const carregar = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)
    try {
      setErro(null)
      const res = await getNoticias({ limit: 60 })
      setNoticias(res.data)
      setUltimaAtt(new Date())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar notícias')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    carregar()
    const id = setInterval(() => carregar(), 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    Promise.all([
      getIndicadores('selic_meta', 1),
      getIndicadores('ipca_acum12m', 1),
    ]).then(([s, ip]) => {
      setSelic(s.data[0]?.valor ?? null)
      setIpca(ip.data[0]?.valor ?? null)
    }).catch(() => {})
  }, [])

  const juroReal = useMemo(() => {
    if (selic == null || ipca == null) return null
    return juroRealFisher(selic, ipca)
  }, [selic, ipca])

  const filtradas = useMemo(() => {
    if (filtro === 'Todos') return noticias
    return noticias.filter(n => n.categoria === filtro)
  }, [noticias, filtro])

  const featured = useMemo(() => {
    const macro = noticias.find(n => n.categoria === 'Macro')
    return macro ?? noticias[0] ?? null
  }, [noticias])

  const feedNoticias = useMemo(() => {
    if (!featured) return filtradas
    return filtradas.filter(n => n.id !== featured.id)
  }, [filtradas, featured])

  const col0 = feedNoticias.filter((_, i) => i % 3 === 0)
  const col1 = feedNoticias.filter((_, i) => i % 3 === 1)
  const col2 = feedNoticias.filter((_, i) => i % 3 === 2)

  const isSpinning = loading || refreshing

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--cl-ink3)', margin: 0 }}>
            Feed de Notícias
          </p>
          <h1 style={{ fontFamily: 'var(--font-display, serif)', fontSize: 36, fontWeight: 700, color: 'var(--cl-ink)', margin: '4px 0 6px', lineHeight: 1.1 }}>
            Notícias do Mercado
          </h1>
          <p style={{ fontSize: 13, color: 'var(--cl-ink3)', margin: 0 }}>
            Feed agregado · InfoMoney · Valor · BCB · IBGE · B3 · CVM
            {ultimaAtt && <> · atualizado {tempoRelativo(ultimaAtt.toISOString())}</>}
          </p>
        </div>
        <button
          onClick={() => carregar(true)}
          disabled={isSpinning}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--cl-line)',
            background: 'var(--cl-card)', color: 'var(--cl-ink)', fontSize: 13, fontWeight: 500,
            cursor: isSpinning ? 'not-allowed' : 'pointer', opacity: isSpinning ? .6 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: isSpinning ? 'cl-spin .8s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* ── Erro ───────────────────────────────────────────── */}
      {erro && (
        <div style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: 'var(--cl-down)', fontSize: 13 }}>
          {erro}
        </div>
      )}

      {/* ── Featured card ──────────────────────────────────── */}
      {loading && !featured ? (
        <div style={{ height: 220, borderRadius: 14, background: 'var(--cl-card)', animation: 'cl-shimmer 1.4s ease infinite', backgroundSize: '200% 100%' }} />
      ) : featured ? (
        <div style={{
          background: 'var(--cl-navy)', borderRadius: 14, padding: '36px 40px',
          display: 'grid', gridTemplateColumns: '1fr 268px', gap: 44,
        }}
          className="cl-featured-card"
        >
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {catTag(featured.categoria)}
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                {featured.fonte} · {tempoRelativo(featured.publicado_em)}
              </span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-display, serif)', fontSize: 28, fontWeight: 700,
              color: '#fff', lineHeight: 1.25, margin: 0,
            }}>
              {featured.titulo}
            </h2>
            {featured.resumo && (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.55, margin: 0 }}>
                {featured.resumo}
              </p>
            )}
            <a
              href={featured.url} target="_blank" rel="noreferrer noopener"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
                fontSize: 13, fontWeight: 600, color: 'var(--cl-accent)',
                textDecoration: 'none',
              }}
            >
              Ler matéria completa <ExternalLink size={13} />
            </a>
          </div>

          {/* Right — dados relacionados */}
          <div style={{
            borderLeft: '1px solid rgba(255,255,255,.1)', paddingLeft: 40,
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', margin: 0 }}>
              Dados Relacionados
            </p>
            {[
              { label: 'Selic Meta',   value: selic   != null ? `${selic.toFixed(2)}%` : '—' },
              { label: 'IPCA 12M',     value: ipca    != null ? `${ipca.toFixed(2)}%`  : '—' },
              { label: 'Juro Real',    value: juroReal != null ? formatPctSinal(juroReal) : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontFamily: 'var(--font-display, serif)', fontSize: 28, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Filter pills ───────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTROS.map(cat => {
            const ativo = filtro === cat
            const s = CAT_STYLES[cat]
            return (
              <button
                key={cat}
                onClick={() => setFiltro(cat)}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 500,
                  border: ativo ? `1px solid ${s.fg}` : '1px solid var(--cl-line)',
                  background: ativo ? s.bg : 'var(--cl-card)',
                  color: ativo ? s.fg : 'var(--cl-ink3)',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--cl-ink3)', whiteSpace: 'nowrap' }}>
          Fontes: InfoMoney · Valor · BCB · IBGE · B3 · CVM
        </p>
      </div>

      {/* ── Feed 3 colunas ─────────────────────────────────── */}
      {loading && feedNoticias.length === 0 ? (
        <div className="cl-news-grid">
          {[...Array(9)].map((_, i) => (
            <div key={i} style={{ height: 100, margin: '20px 0', borderRadius: 6, background: 'var(--cl-card)', opacity: .5 }} />
          ))}
        </div>
      ) : feedNoticias.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 14, color: 'var(--cl-ink3)', borderTop: '1px solid var(--cl-line)' }}>
          Nenhuma notícia encontrada nesta categoria.
        </div>
      ) : (
        <div className="cl-news-grid">
          {[col0, col1, col2].map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column' }}>
              {col.map(n => <FeedItem key={n.id} n={n} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FeedItem({ n }: { n: Noticia }) {
  const s = CAT_STYLES[n.categoria ?? 'Outros'] ?? CAT_STYLES['Outros']
  return (
    <a
      href={n.url} target="_blank" rel="noreferrer noopener"
      style={{ display: 'block', textDecoration: 'none', padding: '20px 0', borderBottom: '1px solid var(--cl-line)' }}
    >
      <div style={{ width: 3, height: 20, background: s.fg, borderRadius: 2, marginBottom: 10 }} />
      <p style={{
        fontSize: 14, fontWeight: 600, color: 'var(--cl-ink)', lineHeight: 1.45,
        margin: '0 0 8px', transition: 'color .15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--cl-accent)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--cl-ink)')}
      >
        {n.titulo}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{n.fonte}</span>
        <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>·</span>
        <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{tempoRelativo(n.publicado_em)}</span>
        {n.tickers_rel && n.tickers_rel.length > 0 && (
          <>
            <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>·</span>
            {n.tickers_rel.slice(0, 2).map(t => (
              <span key={t} style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                color: 'var(--cl-accent)', border: '1px solid rgba(31,111,235,.3)',
                padding: '1px 5px', borderRadius: 4,
              }}>{t}</span>
            ))}
          </>
        )}
        <ExternalLink size={11} style={{ marginLeft: 'auto', color: 'var(--cl-ink3)' }} />
      </div>
    </a>
  )
}
