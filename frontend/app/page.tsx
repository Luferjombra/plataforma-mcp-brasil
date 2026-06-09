'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getIndicadores, type Indicador } from '@/lib/api'

/* ─── brand tokens ─────────────────────────────────────────── */
const T = {
  bg:        '#0a0f0a',
  card:      '#0d130d',
  card2:     '#111811',
  line:      '#1a2e1a',
  lineDim:   '#0f1a0f',
  green:     '#22c55e',
  greenHov:  '#10b981',
  amber:     '#f59e0b',
  red:       '#ef4444',
  violet:    '#8b5cf6',
  blue:      '#3b82f6',
  text:      '#e8f5e8',
  muted:     '#6b7e6b',
  dim:       '#3a4e3a',
  mono:      "'Courier New', monospace",
  sans:      "Geist, system-ui, sans-serif",
}

/* ─── data types ───────────────────────────────────────────── */
interface KpiData {
  label: string; serie: string; value: number | null
  delta: number | null; fonte: string; history: number[]; color: string; unit: string
}

/* ─── static content ───────────────────────────────────────── */
const EVENTOS = [
  { day: '17', mon: 'JUN', title: 'REUNIÃO COPOM', sub: 'Decisão da taxa SELIC · Banco Central', badge: 'EM 9 DIAS', urgent: true },
  { day: '20', mon: 'JUN', title: 'DIVULGAÇÃO IPCA-15', sub: 'Prévia da inflação · IBGE', badge: 'EM 12 DIAS', urgent: false },
  { day: '10', mon: 'JUL', title: 'IPCA JUNHO', sub: 'Inflação oficial acumulada · IBGE', badge: 'EM 32 DIAS', urgent: false },
  { day: '29', mon: 'JUL', title: 'REUNIÃO COPOM', sub: 'Decisão da taxa SELIC · Banco Central', badge: 'EM 51 DIAS', urgent: false },
]

const MODULOS = [
  { tag: 'MACRO', label: 'Indicadores',    href: '/indicadores', desc: 'SELIC, IPCA, CDI, PIB com histórico completo via BCB-SGS', color: T.green },
  { tag: 'B3',   label: 'Renda Variável', href: '/rv',          desc: 'Ações e FIIs com 252 pregões de histórico via brapi.dev',  color: T.blue },
  { tag: 'TD',   label: 'Renda Fixa',     href: '/rf',          desc: 'Tesouro Direto com taxa, PU e histórico por indexador',    color: T.violet },
  { tag: 'CVM',  label: 'Fundos',         href: '/fundos',      desc: '+40 mil fundos com cota diária, PL e performance',        color: T.amber },
]

/* ─── components ───────────────────────────────────────────── */
function Clock() {
  const [t, setT] = useState('')
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }))
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])
  return <>{t}</>
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const w = 88, h = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4)}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
    </svg>
  )
}

function KpiCard({ k, index }: { k: KpiData; index: number }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? T.card2 : T.card,
        padding: '20px 20px 16px',
        borderLeft: `2px solid ${hov ? k.color : T.lineDim}`,
        transition: 'all 0.2s ease',
        transform: hov ? 'translateY(-2px)' : 'none',
        animation: `fadeUp 0.4s ease-out ${index * 80}ms both`,
        cursor: 'default',
      }}
    >
      <p style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>
        {k.label}
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 32, fontWeight: 800, color: T.text, letterSpacing: '-0.03em', marginBottom: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {k.value != null ? k.value.toFixed(2) : '—'}<span style={{ fontSize: 14, fontWeight: 400, color: T.muted, marginLeft: 4 }}>%</span>
      </p>
      {k.delta != null && (
        <p style={{ fontFamily: T.mono, fontSize: 10, color: k.delta >= 0 ? k.color : T.red, marginBottom: 10 }}>
          {k.delta >= 0 ? '▲' : '▼'} {k.delta >= 0 ? '+' : ''}{k.delta.toFixed(2)} p.p.
        </p>
      )}
      {k.history.length > 3 && (
        <div style={{ margin: '10px 0 6px' }}>
          <Sparkline data={k.history.slice(-20)} color={k.color} />
        </div>
      )}
      <p style={{ fontFamily: T.mono, fontSize: 8, color: T.dim, letterSpacing: '0.1em', borderTop: `1px solid ${T.lineDim}`, paddingTop: 8, marginTop: 8 }}>
        FONTE: {k.fonte}
      </p>
    </div>
  )
}

function ModuleCard({ m, index }: { m: typeof MODULOS[0]; index: number }) {
  const [hov, setHov] = useState(false)
  return (
    <Link href={m.href} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: hov ? T.card2 : T.card,
          border: `1px solid ${hov ? m.color + '60' : T.line}`,
          padding: '20px 24px',
          transition: 'all 0.2s ease',
          transform: hov ? 'translateY(-2px)' : 'none',
          animation: `fadeUp 0.4s ease-out ${300 + index * 80}ms both`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: T.mono, fontSize: 8, color: m.color, border: `1px solid ${m.color}40`, padding: '3px 10px', letterSpacing: '0.12em' }}>
            {m.tag}
          </span>
          <span style={{ color: hov ? m.color : T.dim, fontSize: 14, transition: 'color 0.2s' }}>→</span>
        </div>
        <p style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>{m.label}</p>
        <p style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{m.desc}</p>
      </div>
    </Link>
  )
}

/* ─── page ─────────────────────────────────────────────────── */
export default function LandingPage() {
  const [kpis, setKpis] = useState<KpiData[]>([
    { label: 'TAXA SELIC', serie: 'selic', value: null, delta: null, fonte: 'BCB · COPOM', history: [], color: T.green,  unit: '% a.a.' },
    { label: 'IPCA 12M',  serie: 'ipca',  value: null, delta: null, fonte: 'IBGE',        history: [], color: T.amber,  unit: '%'      },
    { label: 'CDI DIÁRIO', serie: 'cdi',  value: null, delta: null, fonte: 'CETIP',       history: [], color: T.violet, unit: '% a.a.' },
    { label: 'PIB ANUAL', serie: 'pib',   value: null, delta: null, fonte: 'IBGE',        history: [], color: T.blue,   unit: '%'      },
  ])

  useEffect(() => {
    const series = ['selic', 'ipca', 'cdi', 'pib']
    Promise.all(series.map(s => getIndicadores(s, 24))).then(results => {
      setKpis(prev => prev.map((k, i) => {
        const data: Indicador[] = results[i].data
        const hist = [...data].reverse().map(d => d.valor)
        const last = data[0]?.valor ?? null
        const prev2 = data[1]?.valor ?? null
        return { ...k, value: last, delta: last != null && prev2 != null ? last - prev2 : null, history: hist }
      }))
    }).catch(() => {})
  }, [])

  const selic   = kpis[0].value
  const ipca    = kpis[1].value
  const juroReal = selic != null && ipca != null ? selic - ipca : null
  const ipcaPct  = ipca  != null ? Math.min((ipca / 4.5) * 100, 100) : 0
  const metaPct  = (3.0 / 4.5) * 100

  return (
    <div style={{ fontFamily: T.sans, background: T.bg, color: T.text, minHeight: '100vh' }}>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          49%      { opacity: 1; }
          50%      { opacity: 0; }
          99%      { opacity: 0; }
        }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav style={{
        background: T.card, borderBottom: `1px solid ${T.line}`,
        padding: '0 40px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
        animation: 'fadeUp 0.3s ease-out both',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.green, letterSpacing: '0.15em' }}>MCP BRASIL</span>
          <div style={{ width: 1, height: 16, background: T.line }} />
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>PLATAFORMA FINANCEIRA</span>
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { href: '/',           label: 'INÍCIO' },
            { href: '/indicadores', label: 'INDICADORES' },
            { href: '/rv',         label: 'AÇÕES' },
            { href: '/rf',         label: 'RENDA FIXA' },
            { href: '/fundos',     label: 'FUNDOS' },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{
              fontFamily: T.mono, fontSize: 10, color: l.href === '/' ? T.green : T.muted,
              textDecoration: 'none', letterSpacing: '0.1em', transition: 'color 0.15s',
            }}
              onMouseEnter={e => { if (l.href !== '/') (e.target as HTMLElement).style.color = T.text }}
              onMouseLeave={e => { if (l.href !== '/') (e.target as HTMLElement).style.color = T.muted }}
            >{l.label}</Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: T.mono, fontSize: 10, color: T.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, background: T.green, borderRadius: '50%', animation: 'pulse 2s ease-in-out infinite' }} />
            LIVE
          </span>
          <span style={{ color: T.dim }}>|</span>
          <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}><Clock /></span>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────── */}
      <div style={{ padding: '64px 40px 48px', borderBottom: `1px solid ${T.line}` }}>
        <p style={{
          fontFamily: T.mono, fontSize: 9, color: T.green, letterSpacing: '0.2em',
          marginBottom: 20, animation: 'fadeUp 0.4s ease-out 0.05s both',
        }}>
          // PLATAFORMA DE DADOS FINANCEIROS BRASILEIROS
        </p>

        <h1 style={{
          fontFamily: T.sans, fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800,
          color: T.text, lineHeight: 1.1, letterSpacing: '-0.03em',
          marginBottom: 16, maxWidth: 600,
          animation: 'fadeUp 0.4s ease-out 0.1s both',
        }}>
          Dados do <span style={{ color: T.green }}>mercado brasileiro</span>{' '}
          em tempo real
        </h1>

        <p style={{
          fontFamily: T.sans, fontSize: 14, color: T.muted, lineHeight: 1.7,
          maxWidth: 480, marginBottom: 40,
          animation: 'fadeUp 0.4s ease-out 0.15s both',
        }}>
          Indicadores macro, renda variável, renda fixa e fundos — consolidados
          em um único painel. Fontes oficiais: BCB, CVM, B3 e Tesouro Direto.
        </p>

        <div style={{ display: 'flex', gap: 12, animation: 'fadeUp 0.4s ease-out 0.2s both' }}>
          <Link href="/indicadores" style={{
            background: T.green, color: T.bg,
            padding: '12px 32px', fontFamily: T.mono, fontSize: 11,
            fontWeight: 700, letterSpacing: '0.12em', textDecoration: 'none',
            display: 'inline-block', transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = T.greenHov)}
            onMouseLeave={e => (e.currentTarget.style.background = T.green)}
          >
            ACESSAR PLATAFORMA →
          </Link>
          <a href="https://plataforma-mcp-brasil-api.onrender.com/docs" target="_blank" rel="noreferrer" style={{
            background: 'transparent', color: T.green,
            border: `1px solid ${T.green}`, padding: '12px 32px',
            fontFamily: T.mono, fontSize: 11, letterSpacing: '0.12em',
            textDecoration: 'none', display: 'inline-block', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = T.green + '15' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            VER API DOCS
          </a>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: T.lineDim, marginTop: 48 }}>
          {kpis.map((k, i) => <KpiCard key={k.serie} k={k} index={i} />)}
        </div>
      </div>

      {/* ── MÓDULOS ─────────────────────────────────────── */}
      <div style={{ padding: '40px 40px 0', borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.12em' }}>MÓDULOS</span>
          <div style={{ flex: 1, height: 1, background: T.lineDim }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, paddingBottom: 40 }}>
          {MODULOS.map((m, i) => <ModuleCard key={m.href} m={m} index={i} />)}
        </div>
      </div>

      {/* ── BOTTOM GRID ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: T.lineDim, gap: 1 }}>

        {/* PRÓXIMOS EVENTOS */}
        <div style={{ background: T.card, padding: '32px 32px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.12em' }}>PRÓXIMOS EVENTOS</span>
            <div style={{ flex: 1, height: 1, background: T.lineDim }} />
          </div>
          {EVENTOS.map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 0',
              borderBottom: i < EVENTOS.length - 1 ? `1px solid ${T.lineDim}` : 'none',
            }}>
              <div style={{
                textAlign: 'center', minWidth: 44, padding: '6px 0',
                borderLeft: `2px solid ${e.urgent ? T.green : T.dim}`,
                paddingLeft: 10,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: e.urgent ? T.green : T.text, lineHeight: 1 }}>{e.day}</div>
                <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, letterSpacing: '0.1em' }}>{e.mon}</div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 3 }}>{e.title}</p>
                <p style={{ fontFamily: T.sans, fontSize: 11, color: T.muted }}>{e.sub}</p>
              </div>
              <span style={{
                fontFamily: T.mono, fontSize: 8,
                color: e.urgent ? T.green : T.dim,
                border: `1px solid ${e.urgent ? T.green + '60' : T.lineDim}`,
                padding: '3px 10px', letterSpacing: '0.1em', whiteSpace: 'nowrap',
              }}>{e.badge}</span>
            </div>
          ))}
        </div>

        {/* JURO REAL + META */}
        <div style={{ background: T.card, padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.12em' }}>PAINEL MACRO</span>
              <div style={{ flex: 1, height: 1, background: T.lineDim }} />
            </div>

            {/* Juro Real */}
            <div style={{ background: T.bg, border: `1px solid ${T.line}`, padding: '20px 20px 16px', marginBottom: 16 }}>
              <p style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.12em', marginBottom: 14 }}>JURO REAL (SELIC − IPCA)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 9, marginBottom: 6, letterSpacing: '0.08em' }}>
                    <span style={{ color: T.green }}>SELIC {selic?.toFixed(2) ?? '—'}%</span>
                    <span style={{ color: T.amber }}>IPCA {ipca?.toFixed(2) ?? '—'}%</span>
                  </div>
                  <div style={{ position: 'relative', height: 6, background: T.lineDim }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(((selic ?? 0) / 20) * 100, 100)}%`, background: T.green, transition: 'width 0.6s ease' }} />
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(((ipca ?? 0) / 20) * 100, 100)}%`, background: T.amber, opacity: 0.65, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 72 }}>
                  <p style={{ fontFamily: T.sans, fontSize: 24, fontWeight: 800, color: juroReal != null && juroReal >= 0 ? T.green : T.red, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                    {juroReal != null ? `${juroReal.toFixed(2)}%` : '—'}
                  </p>
                  <p style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, letterSpacing: '0.1em' }}>JURO REAL</p>
                </div>
              </div>
            </div>

            {/* Meta de Inflação */}
            <div style={{ background: T.bg, border: `1px solid ${T.line}`, padding: '20px 20px 16px' }}>
              <p style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: '0.12em', marginBottom: 14 }}>META DE INFLAÇÃO 2026 — CMN</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 8, color: T.dim, marginBottom: 6, letterSpacing: '0.08em' }}>
                    <span>MÍN 1,5%</span><span style={{ color: T.amber }}>META 3,0%</span><span>MÁX 4,5%</span>
                  </div>
                  <div style={{ position: 'relative', height: 6, background: T.lineDim }}>
                    <div style={{ height: '100%', width: `${ipcaPct}%`, background: ipca != null && ipca > 4.5 ? T.red : T.green, transition: 'width 0.6s ease' }} />
                    <div style={{ position: 'absolute', left: `${metaPct}%`, top: -3, width: 1.5, height: 12, background: T.amber }} />
                  </div>
                  <p style={{ fontFamily: T.mono, fontSize: 8, color: ipca != null && ipca > 4.5 ? T.red : T.muted, marginTop: 5, letterSpacing: '0.08em', textAlign: 'right' }}>
                    {ipca != null && ipca > 4.5 ? 'ACIMA DO TETO' : 'DENTRO DA META'}
                  </p>
                </div>
                <div style={{ textAlign: 'right', minWidth: 72 }}>
                  <p style={{ fontFamily: T.sans, fontSize: 24, fontWeight: 800, color: ipca != null && ipca > 4.5 ? T.red : T.green, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                    {ipca != null ? `${ipca.toFixed(2)}%` : '—'}
                  </p>
                  <p style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, letterSpacing: '0.1em' }}>IPCA 12M</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer style={{
        background: '#080d08', borderTop: `1px solid ${T.lineDim}`,
        padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
          © 2026 MCP BRASIL · DADOS PÚBLICOS · USO EDUCACIONAL
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['BCB', 'CVM', 'B3', 'IBGE', 'TESOURO'].map(src => (
            <span key={src} style={{
              fontFamily: T.mono, fontSize: 8, color: T.dim,
              border: `1px solid ${T.lineDim}`, padding: '2px 8px', letterSpacing: '0.1em',
            }}>{src}</span>
          ))}
        </div>
      </footer>
    </div>
  )
}
