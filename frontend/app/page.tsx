'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { getIndicadores, type Indicador } from '@/lib/api'

function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span style={{ fontFamily: 'monospace' }}>{time}</span>
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 80
    const y = 22 - ((v - min) / range) * 20
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width="80" height="24" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

interface KpiData {
  label: string
  serie: string
  value: number | null
  delta: number | null
  fonte: string
  history: number[]
  color: string
  unit: string
}

const EVENTOS = [
  { day: '17', mon: 'JUN', title: 'REUNIÃO COPOM', sub: 'Decisão da taxa SELIC · Banco Central', tag: 'EM 9 DIAS' },
  { day: '20', mon: 'JUN', title: 'DIVULGAÇÃO IPCA-15', sub: 'Prévia da inflação · IBGE', tag: 'EM 12 DIAS' },
  { day: '10', mon: 'JUL', title: 'IPCA JUNHO', sub: 'Inflação oficial acumulada · IBGE', tag: 'EM 32 DIAS' },
  { day: '29', mon: 'JUL', title: 'REUNIÃO COPOM', sub: 'Decisão da taxa SELIC · Banco Central', tag: 'EM 51 DIAS' },
]

const FEATURES = [
  { title: 'INDICADORES MACRO', desc: 'SELIC, IPCA, CDI, PIB e Focus com histórico completo via BCB-SGS' },
  { title: 'RENDA VARIÁVEL', desc: 'Ações e FIIs da B3 com 252 pregões de histórico via brapi.dev' },
  { title: 'RENDA FIXA', desc: 'Tesouro Direto com taxa, PU e histórico por indexador (SELIC, IPCA+, Pré)' },
  { title: 'FUNDOS CVM', desc: '+40k fundos com cota diária, PL e performance normalizada' },
  { title: 'BUSCA GLOBAL', desc: 'Encontre qualquer ativo, título ou fundo em todos os módulos' },
  { title: 'API ABERTA', desc: 'FastAPI com docs automáticas e endpoint MCP para integrações' },
]

const s: Record<string, string | number> = {
  bg: '#0a0f0a',
  bgCard: '#0d130d',
  bgLine: '#1a2e1a',
  green: '#22c55e',
  greenDim: '#4ade80',
  textPrimary: '#e8f5e8',
  textMuted: '#6b7e6b',
  textDim: '#3a4e3a',
  red: '#ef4444',
}

export default function LandingPage() {
  const [kpis, setKpis] = useState<KpiData[]>([
    { label: 'TAXA SELIC', serie: 'selic', value: null, delta: null, fonte: 'BCB · COPOM', history: [], color: '#22c55e', unit: '% a.a.' },
    { label: 'IPCA (12M)',  serie: 'ipca',  value: null, delta: null, fonte: 'IBGE',        history: [], color: '#f59e0b', unit: '%' },
    { label: 'CDI DIÁRIO',  serie: 'cdi',   value: null, delta: null, fonte: 'CETIP',       history: [], color: '#8b5cf6', unit: '% a.a.' },
    { label: 'PIB ANUAL',   serie: 'pib',   value: null, delta: null, fonte: 'IBGE',        history: [], color: '#3b82f6', unit: '%' },
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

  const selic = kpis[0].value
  const ipca = kpis[1].value
  const juroReal = selic != null && ipca != null ? selic - ipca : null
  const ipcaPct = ipca != null ? Math.min((ipca / 4.5) * 100, 100) : 75
  const metaPct = (3.0 / 4.5) * 100

  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: s.bg, color: s.textPrimary as string, minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ background: s.bgCard, borderBottom: `1px solid ${s.bgLine}`, padding: '0 32px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: s.green as string, letterSpacing: 3 }}>MCP BRASIL</span>
          <span style={{ fontSize: 10, color: s.green as string, border: `1px solid ${s.green}`, padding: '2px 8px', letterSpacing: 1 }}>● LIVE</span>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {[
            { href: '/', label: 'INÍCIO' },
            { href: '/indicadores', label: 'INDICADORES' },
            { href: '/rv', label: 'RV' },
            { href: '/rf', label: 'RENDA FIXA' },
            { href: '/fundos', label: 'FUNDOS' },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{ fontSize: 11, color: l.href === '/' ? s.green as string : s.textMuted as string, textDecoration: 'none', letterSpacing: 1 }}>
              {l.label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 11, color: s.textMuted as string, alignItems: 'center' }}>
          <span><span style={{ display: 'inline-block', width: 6, height: 6, background: s.green as string, borderRadius: '50%', marginRight: 5 }} />SÃO PAULO</span>
          <Clock />
        </div>
      </nav>

      {/* HERO */}
      <div style={{ padding: '56px 40px 36px', borderBottom: `1px solid ${s.bgLine}` }}>
        <p style={{ fontSize: 10, color: s.green as string, letterSpacing: 4, marginBottom: 14 }}>// PLATAFORMA DE DADOS FINANCEIROS BRASILEIROS</p>
        <h1 style={{ fontSize: 42, fontWeight: 700, color: s.textPrimary as string, lineHeight: 1.15, marginBottom: 12 }}>
          Dados do <span style={{ color: s.green as string }}>mercado brasileiro</span><br />em tempo real
        </h1>
        <p style={{ fontSize: 13, color: s.textMuted as string, lineHeight: 1.7, maxWidth: 500, marginBottom: 32 }}>
          Indicadores macro, renda variável, renda fixa e fundos — consolidados em um único painel.<br />
          Fontes oficiais: BCB, CVM, B3 e Tesouro Direto.
        </p>
        <div style={{ display: 'flex', gap: 14, marginBottom: 48 }}>
          <Link href="/indicadores" style={{ background: s.green as string, color: s.bg as string, padding: '11px 28px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: 1, textDecoration: 'none', display: 'inline-block' }}>
            ACESSAR PLATAFORMA →
          </Link>
          <a href="https://plataforma-mcp-brasil-api.onrender.com/docs" target="_blank" rel="noreferrer" style={{ background: 'transparent', color: s.green as string, border: `1px solid ${s.green}`, padding: '11px 28px', fontFamily: 'monospace', fontSize: 12, letterSpacing: 1, textDecoration: 'none', display: 'inline-block' }}>
            VER API DOCS
          </a>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: s.bgLine }}>
          {kpis.map(k => (
            <div key={k.serie} style={{ background: s.bgCard, padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 10, color: s.textMuted as string, letterSpacing: 2, marginBottom: 6 }}>{k.label}</p>
              <p style={{ fontSize: 30, fontWeight: 700, color: s.textPrimary as string, letterSpacing: -1, marginBottom: 4 }}>
                {k.value != null ? `${k.value.toFixed(2)}%` : '—'}
              </p>
              {k.delta != null && (
                <p style={{ fontSize: 11, color: k.delta >= 0 ? s.green as string : s.red as string, marginBottom: 8 }}>
                  {k.delta >= 0 ? '▲' : '▼'} {k.delta >= 0 ? '+' : ''}{k.delta.toFixed(2)} p.p.
                </p>
              )}
              {k.history.length > 3 && (
                <div style={{ margin: '8px 0' }}>
                  <Sparkline data={k.history.slice(-16)} color={k.color} />
                </div>
              )}
              <p style={{ fontSize: 9, color: s.textDim as string, letterSpacing: 1, borderTop: `1px solid ${s.bgLine}`, paddingTop: 8, marginTop: 4 }}>
                FONTE: {k.fonte}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: s.bgLine }}>

        {/* FEATURES */}
        <div style={{ background: s.bgCard, padding: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 10, color: s.green as string, letterSpacing: 2 }}>FUNCIONALIDADES</span>
            <div style={{ flex: 1, height: 1, background: s.bgLine }} />
          </div>
          {FEATURES.map(f => (
            <div key={f.title} style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
              <span style={{ color: s.green as string, fontSize: 13, flexShrink: 0, marginTop: 2 }}>▸</span>
              <div>
                <p style={{ fontSize: 11, color: s.textPrimary as string, letterSpacing: 1, marginBottom: 3 }}>{f.title}</p>
                <p style={{ fontSize: 12, color: '#9ab09a', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* EVENTOS */}
        <div style={{ background: s.bgCard, padding: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 10, color: s.green as string, letterSpacing: 2 }}>PRÓXIMOS EVENTOS</span>
            <div style={{ flex: 1, height: 1, background: s.bgLine }} />
          </div>
          {EVENTOS.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: i < EVENTOS.length - 1 ? `1px solid ${s.bgLine}` : 'none' }}>
              <div style={{ textAlign: 'center', minWidth: 40 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.green as string, lineHeight: 1 }}>{e.day}</div>
                <div style={{ fontSize: 9, color: s.textMuted as string, letterSpacing: 1 }}>{e.mon}</div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: s.textPrimary as string, letterSpacing: 0.5, marginBottom: 3 }}>{e.title}</p>
                <p style={{ fontSize: 10, color: s.textMuted as string }}>{e.sub}</p>
              </div>
              <span style={{ fontSize: 9, color: s.green as string, border: `1px solid ${s.green}`, padding: '2px 8px', whiteSpace: 'nowrap', letterSpacing: 1 }}>{e.tag}</span>
            </div>
          ))}

          {/* JURO REAL */}
          {juroReal != null && (
            <div style={{ marginTop: 24, padding: '16px', background: '#0a0f0a', border: `1px solid ${s.bgLine}` }}>
              <p style={{ fontSize: 10, color: s.textMuted as string, letterSpacing: 2, marginBottom: 10 }}>JURO REAL (SELIC − IPCA)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: s.textDim as string, marginBottom: 4, letterSpacing: 1 }}>
                    <span style={{ color: '#22c55e' }}>SELIC {selic?.toFixed(2)}%</span>
                    <span style={{ color: '#f59e0b' }}>IPCA {ipca?.toFixed(2)}%</span>
                  </div>
                  <div style={{ position: 'relative', height: 6, background: s.bgLine, borderRadius: 0 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min((selic! / 20) * 100, 100)}%`, background: '#22c55e' }} />
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min((ipca! / 20) * 100, 100)}%`, background: '#f59e0b', opacity: 0.6 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: juroReal >= 0 ? '#22c55e' : '#ef4444' }}>{juroReal.toFixed(2)}%</p>
                  <p style={{ fontSize: 9, color: s.textMuted as string, letterSpacing: 1 }}>JURO REAL</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* META INFLAÇÃO */}
      <div style={{ background: s.bgCard, padding: '20px 40px', borderTop: `1px solid ${s.bgLine}` }}>
        <p style={{ fontSize: 10, color: s.textMuted as string, letterSpacing: 2, marginBottom: 12 }}>META DE INFLAÇÃO 2026 — CMN</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: s.textDim as string, marginBottom: 5, letterSpacing: 1 }}>
              <span>MÍN 1,5%</span><span>META 3,0%</span><span>MÁX 4,5%</span>
            </div>
            <div style={{ position: 'relative', height: 8, background: s.bgLine }}>
              <div style={{ height: '100%', width: `${ipcaPct}%`, background: ipca != null && ipca > 4.5 ? '#ef4444' : '#22c55e' }} />
              <div style={{ position: 'absolute', left: `${metaPct}%`, top: -4, width: 2, height: 16, background: '#f59e0b' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 9, color: ipca != null && ipca > 4.5 ? '#ef4444' : s.textMuted as string, marginTop: 4, letterSpacing: 1 }}>
              {ipca != null && ipca > 4.5 ? 'ACIMA DO TETO — LIMITE SUPERIOR' : 'DENTRO DA META'}
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 90 }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: ipca != null && ipca > 4.5 ? '#ef4444' : '#22c55e' }}>
              {ipca != null ? `${ipca.toFixed(2)}%` : '—'}
            </p>
            <p style={{ fontSize: 9, color: s.textMuted as string, letterSpacing: 1 }}>IPCA 12M</p>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: '#080d08', borderTop: `1px solid ${s.bgLine}`, padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: s.textDim as string, letterSpacing: 1 }}>© 2026 MCP BRASIL · DADOS PÚBLICOS · USO EDUCACIONAL</span>
        <div style={{ display: 'flex', gap: 10 }}>
          {['BCB', 'CVM', 'B3', 'IBGE', 'TESOURO'].map(src => (
            <span key={src} style={{ fontSize: 9, color: s.textDim as string, border: `1px solid ${s.bgLine}`, padding: '2px 8px', letterSpacing: 1 }}>{src}</span>
          ))}
        </div>
      </footer>
    </div>
  )
}
