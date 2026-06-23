'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getIndicadores, type Indicador } from '@/lib/api'

/* ── types ───────────────────────────────────────────────── */
interface KpiData {
  label: string
  serie: string
  value: number | null
  delta: number | null
  note: string
  source: string
  ref: string
  unit: string
  dir: 'up' | 'down' | 'flat'
  spark: number[]
}

/* ── static data ──────────────────────────────────────────── */
const MODULOS = [
  { tag: 'MACRO', title: 'Indicadores', href: '/indicadores', desc: 'SELIC, IPCA, CDI e PIB com histórico completo via BCB-SGS', n: '4 séries' },
  { tag: 'B3',   title: 'Renda Variável', href: '/rv',       desc: 'Ações e FIIs com 252 pregões de histórico via brapi.dev', n: '500+ ativos' },
  { tag: 'TD',   title: 'Renda Fixa',     href: '/rf',       desc: 'Tesouro Direto com taxa, PU e histórico por indexador',   n: '12 títulos' },
  { tag: 'CVM',  title: 'Fundos',         href: '/fundos',   desc: '+40 mil fundos com cota diária, PL e rentabilidade CVM', n: '40k fundos' },
]

const EVENTOS = [
  { d: '29', m: 'JUL', t: 'Reunião COPOM', s: 'Decisão da taxa SELIC · Banco Central', inDays: 36 },
  { d: '12', m: 'AGO', t: 'IPCA Julho', s: 'Inflação oficial acumulada · IBGE', inDays: 50 },
  { d: '19', m: 'AGO', t: 'IPCA-15 Agosto', s: 'Prévia da inflação · IBGE', inDays: 57 },
  { d: '17', m: 'SET', t: 'Reunião COPOM', s: 'Decisão da taxa SELIC · Banco Central', inDays: 86 },
]

/* ── components ───────────────────────────────────────────── */
function Sparkline({ data, dir, w = 120, h = 40 }: { data: number[]; dir: KpiData['dir']; w?: number; h?: number }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />
  const pad = 3
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / rng) * (h - pad * 2),
  ])
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')
  const col  = dir === 'up' ? 'var(--cl-up)' : dir === 'down' ? 'var(--cl-down)' : 'var(--cl-ink3)'
  const fill = dir === 'up' ? 'var(--cl-up-soft)' : dir === 'down' ? 'var(--cl-down-soft)' : 'var(--cl-line2)'
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polygon points={`${pad},${h - pad} ${line} ${w - pad},${h - pad}`} fill={fill} />
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={col} />
    </svg>
  )
}

function Chip({ dir, delta }: { dir: KpiData['dir']; delta: number | null }) {
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'
  const color = dir === 'up' ? 'var(--cl-up)' : dir === 'down' ? 'var(--cl-down)' : 'var(--cl-ink3)'
  const bg    = dir === 'up' ? 'var(--cl-up-soft)' : dir === 'down' ? 'var(--cl-down-soft)' : 'var(--cl-line2)'
  const text  = delta != null ? `${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} p.p.` : `${arrow} —`
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: bg, color, borderRadius: 'var(--cl-radius-xs)',
      padding: '2px 8px', fontSize: 11, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

function KPICard({ k }: { k: KpiData }) {
  return (
    <div style={{
      background: 'var(--cl-card)',
      borderRadius: 'var(--cl-radius)',
      padding: 'var(--cl-card-pad)',
      boxShadow: 'var(--cl-shadow)',
      border: '1px solid var(--cl-line)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--cl-ink3)', fontWeight: 500 }}>{k.label}</span>
        <Chip dir={k.dir} delta={k.delta} />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: 'var(--cl-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {k.value != null ? k.value.toFixed(2) : '—'}
        <small style={{ fontSize: 16, fontWeight: 400, color: 'var(--cl-ink3)', marginLeft: 4, fontFamily: 'var(--font-sans)' }}>{k.unit}</small>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{k.note}</span>
        <Sparkline data={k.spark} dir={k.dir} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cl-ink3)', borderTop: '1px solid var(--cl-line)', paddingTop: 8, marginTop: 2 }}>
        <span>{k.source}</span>
        <span>{k.ref}</span>
      </div>
    </div>
  )
}

function ModuleCard({ m }: { m: typeof MODULOS[0] }) {
  const [hov, setHov] = useState(false)
  return (
    <Link href={m.href} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: 'var(--cl-card)',
          border: `1px solid ${hov ? 'var(--cl-accent)' : 'var(--cl-line)'}`,
          borderRadius: 'var(--cl-radius)',
          padding: 'var(--cl-card-pad)',
          boxShadow: hov ? 'var(--cl-shadow-hover)' : 'var(--cl-shadow)',
          transform: hov ? 'translateY(-2px)' : 'none',
          transition: 'all 0.18s ease',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            color: 'var(--cl-accent)', background: 'var(--cl-accent-soft)',
            borderRadius: 'var(--cl-radius-xs)', padding: '2px 8px',
          }}>{m.tag}</span>
          <span style={{ color: hov ? 'var(--cl-accent)' : 'var(--cl-ink3)', transition: 'color 0.18s', fontSize: 14 }}>→</span>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cl-ink)', marginBottom: 6 }}>{m.title}</h3>
        <p style={{ fontSize: 12, color: 'var(--cl-ink3)', lineHeight: 1.55 }}>{m.desc}</p>
        <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>{m.n}</div>
      </div>
    </Link>
  )
}

function GaugeMeta({ ipca }: { ipca: number | null }) {
  const axisMin = 0, axisMax = 6
  const posPct = (v: number) => Math.max(0, Math.min(100, ((v - axisMin) / (axisMax - axisMin)) * 100))
  const above = ipca != null && ipca > 4.5
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--cl-ink3)', marginBottom: 8 }}>Meta de inflação 2026 · CMN</div>
      <div style={{ position: 'relative', height: 8, background: 'var(--cl-line)', borderRadius: 4, overflow: 'visible' }}>
        <div style={{
          position: 'absolute', left: `${posPct(1.5)}%`, width: `${posPct(4.5) - posPct(1.5)}%`,
          top: 0, height: '100%', background: 'var(--cl-up-soft)', borderRadius: 4,
        }} />
        {ipca != null && (
          <div style={{
            position: 'absolute', left: `${posPct(ipca)}%`,
            top: -4, width: 3, height: 16,
            background: above ? 'var(--cl-down)' : 'var(--cl-accent)',
            borderRadius: 2, transform: 'translateX(-50%)',
          }} />
        )}
        <div style={{
          position: 'absolute', left: `${posPct(3.0)}%`,
          top: -3, width: 1.5, height: 14,
          background: 'var(--cl-amber)', transform: 'translateX(-50%)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cl-ink3)', marginTop: 6 }}>
        <span>1,5%</span><span style={{ color: 'var(--cl-amber)' }}>meta 3,0%</span><span>4,5%</span>
      </div>
      {ipca != null && (
        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 8, color: above ? 'var(--cl-down)' : 'var(--cl-up)' }}>
          {above ? '● Acima do teto' : '● Dentro da meta'} · IPCA {ipca.toFixed(2)}%
        </div>
      )}
    </div>
  )
}

/* ── page ─────────────────────────────────────────────────── */
export default function HomePage() {
  const [kpis, setKpis] = useState<KpiData[]>([
    { label: 'Taxa SELIC', serie: 'selic', value: null, delta: null, note: 'Meta definida pelo COPOM', source: 'BCB · COPOM', ref: 'a.a.', unit: '%', dir: 'flat', spark: [] },
    { label: 'IPCA 12M',  serie: 'ipca',  value: null, delta: null, note: 'Inflação acumulada 12 meses', source: 'IBGE', ref: 'acum. 12m', unit: '%', dir: 'flat', spark: [] },
    { label: 'CDI Diário', serie: 'cdi',  value: null, delta: null, note: 'Taxa interbancária de referência', source: 'CETIP', ref: 'a.a.', unit: '%', dir: 'flat', spark: [] },
    { label: 'PIB Anual', serie: 'pib',   value: null, delta: null, note: 'Crescimento do PIB real', source: 'IBGE', ref: 'variação anual', unit: '%', dir: 'flat', spark: [] },
  ])

  useEffect(() => {
    const series = ['selic', 'ipca', 'cdi', 'pib']
    Promise.all(series.map(s => getIndicadores(s, 24))).then(results => {
      setKpis(prev => prev.map((k, i) => {
        const data: Indicador[] = results[i].data
        const hist = [...data].reverse().map(d => d.valor)
        const last = data[0]?.valor ?? null
        const prev2 = data[1]?.valor ?? null
        const delta = last != null && prev2 != null ? last - prev2 : null
        const dir: KpiData['dir'] = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
        return { ...k, value: last, delta, dir, spark: hist }
      }))
    }).catch(() => {})
  }, [])

  const selic = kpis[0].value
  const ipca  = kpis[1].value
  const juroReal = selic != null && ipca != null
    ? +((selic - ipca) / (1 + ipca / 100) * 100).toFixed(2)
    : null

  return (
    <div style={{ background: 'var(--cl-bg)', minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>

      {/* ── HEADER ────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--cl-card)', borderBottom: '1px solid var(--cl-line)',
        height: 68, padding: '0 var(--cl-page-x)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: 'var(--cl-navy)',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500,
            }}>M</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--cl-ink)' }}>MCP Brasil</span>
          </div>
          <nav style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'Indicadores', href: '/indicadores' },
              { label: 'Renda Variável', href: '/rv' },
              { label: 'Renda Fixa', href: '/rf' },
              { label: 'Fundos', href: '/fundos' },
              { label: 'Chat Finance', href: '/copilot' },
              { label: 'Status', href: '/status' },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{
                fontSize: 13, color: 'var(--cl-ink3)', textDecoration: 'none',
                padding: '5px 10px', borderRadius: 'var(--cl-radius-xs)',
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--cl-line2)'; el.style.color = 'var(--cl-ink)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--cl-ink3)' }}
              >{l.label}</Link>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cl-ink3)' }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: 'var(--cl-up)',
              boxShadow: '0 0 0 2px var(--cl-up-soft)',
              animation: 'cl-fadeup 0s',
            }} />
            LIVE
          </div>
          <button style={{
            background: 'var(--cl-navy)', color: '#fff',
            border: 'none', borderRadius: 'var(--cl-radius-sm)',
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}>
            Acessar plataforma
          </button>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section style={{
        padding: '72px var(--cl-page-x) 56px',
        borderBottom: '1px solid var(--cl-line)',
        maxWidth: 1400, margin: '0 auto',
      }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--cl-accent)', textTransform: 'uppercase', marginBottom: 20,
          }}>
            Dados financeiros brasileiros
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 4vw, 3.25rem)',
            fontWeight: 500, lineHeight: 1.15,
            color: 'var(--cl-ink)', marginBottom: 20,
            letterSpacing: '-0.01em',
          }}>
            O mercado brasileiro,<br />
            <em style={{ fontStyle: 'italic', color: 'var(--cl-navy)' }}>com clareza.</em>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--cl-ink2)', lineHeight: 1.65, maxWidth: 540, marginBottom: 32 }}>
            Indicadores macro, renda variável, renda fixa e fundos consolidados
            em um único painel — sempre a partir de fontes oficiais.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 40 }}>
            <Link href="/indicadores" style={{
              background: 'var(--cl-navy)', color: '#fff',
              padding: '12px 28px', borderRadius: 'var(--cl-radius-sm)',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            >
              Acessar plataforma →
            </Link>
            <a href="https://plataforma-mcp-brasil-api.onrender.com/docs" target="_blank" rel="noreferrer" style={{
              background: 'transparent', color: 'var(--cl-ink2)',
              border: '1px solid var(--cl-line)',
              padding: '12px 28px', borderRadius: 'var(--cl-radius-sm)',
              fontSize: 14, fontWeight: 500, textDecoration: 'none',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cl-accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--cl-accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cl-line)'; (e.currentTarget as HTMLElement).style.color = 'var(--cl-ink2)' }}
            >
              Ver documentação da API
            </a>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['BCB', 'CVM', 'B3', 'IBGE', 'Tesouro Direto'].map(src => (
              <span key={src} style={{
                fontSize: 11, color: 'var(--cl-ink3)',
                border: '1px solid var(--cl-line)',
                borderRadius: 'var(--cl-radius-xs)', padding: '3px 10px',
                background: 'var(--cl-card)',
              }}>{src}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── KPI CARDS ─────────────────────────────────────── */}
      <section style={{ padding: '48px var(--cl-page-x)', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cl-ink)' }}>Indicadores-chave</h2>
          <span style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>Fontes oficiais · Atualizado hoje</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {kpis.map(k => <KPICard key={k.serie} k={k} />)}
        </div>
      </section>

      {/* ── MAIN GRID (Módulos + Macro | Eventos) ─────────── */}
      <section className="cl-main2" style={{
        padding: '0 var(--cl-page-x) 64px',
        maxWidth: 1400, margin: '0 auto',
      }}>

        {/* LEFT: Módulos + Painel Macro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Módulos */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cl-ink)', marginBottom: 16 }}>Módulos</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {MODULOS.map(m => <ModuleCard key={m.href} m={m} />)}
            </div>
          </div>

          {/* Painel Macro */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cl-ink)', marginBottom: 16 }}>Painel Macro</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Juro Real */}
              <div style={{
                background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
                borderRadius: 'var(--cl-radius)', padding: 'var(--cl-card-pad)',
                boxShadow: 'var(--cl-shadow)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--cl-ink3)', marginBottom: 8 }}>Juro real (ex-ante)</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500,
                  color: juroReal != null && juroReal >= 0 ? 'var(--cl-up)' : 'var(--cl-down)',
                  lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                }}>
                  {juroReal != null ? juroReal.toFixed(2) : '—'}
                  <small style={{ fontSize: 18, fontWeight: 400, fontFamily: 'var(--font-sans)' }}> %</small>
                </div>
                <div style={{ fontSize: 11, color: 'var(--cl-ink3)', marginTop: 10 }}>
                  Selic {selic?.toFixed(2) ?? '—'}% − IPCA {ipca?.toFixed(2) ?? '—'}% · método Fisher
                </div>
              </div>

              {/* Gauge Meta */}
              <div style={{
                background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
                borderRadius: 'var(--cl-radius)', padding: 'var(--cl-card-pad)',
                boxShadow: 'var(--cl-shadow)',
              }}>
                <GaugeMeta ipca={ipca} />
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT: Próximos Eventos */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cl-ink)', marginBottom: 16 }}>Próximos Eventos</h2>
          <div style={{
            background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
            borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
            overflow: 'hidden',
          }}>
            {EVENTOS.map((e, i) => {
              const soon = e.inDays <= 7
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px',
                  borderBottom: i < EVENTOS.length - 1 ? '1px solid var(--cl-line)' : 'none',
                }}>
                  <div style={{
                    textAlign: 'center', minWidth: 44,
                    borderLeft: `3px solid ${soon ? 'var(--cl-amber)' : 'var(--cl-line)'}`,
                    paddingLeft: 10,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500,
                      color: soon ? 'var(--cl-amber)' : 'var(--cl-ink)', lineHeight: 1,
                    }}>{e.d}</div>
                    <div style={{ fontSize: 10, color: 'var(--cl-ink3)', letterSpacing: '0.06em' }}>{e.m}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cl-ink)', marginBottom: 2 }}>{e.t}</p>
                    <p style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{e.s}</p>
                  </div>
                  <span style={{
                    fontSize: 11, color: soon ? 'var(--cl-amber)' : 'var(--cl-ink3)',
                    background: soon ? 'var(--cl-amber-soft)' : 'var(--cl-line2)',
                    borderRadius: 'var(--cl-radius-xs)', padding: '3px 9px',
                    whiteSpace: 'nowrap',
                  }}>
                    em {e.inDays}d
                  </span>
                </div>
              )
            })}
          </div>
        </div>

      </section>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--cl-line)', padding: '20px var(--cl-page-x)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1400, margin: '0 auto',
      }}>
        <span style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>© 2026 MCP Brasil · Dados públicos · Uso educacional</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['BCB', 'CVM', 'B3', 'IBGE', 'Tesouro Direto'].map(src => (
            <span key={src} style={{
              fontSize: 10, color: 'var(--cl-ink3)',
              border: '1px solid var(--cl-line)', borderRadius: 4,
              padding: '2px 8px',
            }}>{src}</span>
          ))}
        </div>
      </footer>

    </div>
  )
}
