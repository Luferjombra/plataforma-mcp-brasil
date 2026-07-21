'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { getIndicadores, type Indicador } from '@/lib/api'
import { Sun, Moon } from 'lucide-react'

/* ── types ───────────────────────────────────────────────── */
interface KpiData {
  label: string
  serie: string
  value: number | null
  delta: number | null
  unit: string
  source: string
  dir: 'up' | 'down' | 'flat'
}

interface ModuleDemo {
  key: string
  tabLabel: string
  eyebrow: string
  title: string
  desc: string
  src: string
  render: () => React.ReactNode
}

/* ── static data ──────────────────────────────────────────── */
// TODO: EVENTOS ainda é estático — pendente de ligar em eventos_economicos
// (migration 017 + etl/eventos_economicos.py já existem, falta o parse real
// da API do IBGE e a rota de backend/frontend).
const EVENTOS = [
  { d: '05', m: 'AGO', t: 'Reunião COPOM', s: 'Decisão da taxa Selic · Banco Central', inDays: 15 },
  { d: '12', m: 'AGO', t: 'IPCA Julho', s: 'Inflação oficial acumulada · IBGE', inDays: 22 },
  { d: '16', m: 'SET', t: 'Reunião COPOM', s: 'Decisão da taxa Selic · Banco Central', inDays: 57 },
]

const TICKER = [
  { t: 'IBOV', v: '128.450', d: '+0,84%', dir: 'up' as const },
  { t: 'PETR4', v: 'R$ 38,72', d: '+1,20%', dir: 'up' as const },
  { t: 'VALE3', v: 'R$ 61,15', d: '-0,63%', dir: 'down' as const },
  { t: 'ITUB4', v: 'R$ 35,90', d: '+0,42%', dir: 'up' as const },
  { t: 'USD/BRL', v: 'R$ 5,42', d: '+0,31%', dir: 'up' as const },
]

/* ── small building blocks ───────────────────────────────── */
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) { setInView(true); return }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { setInView(true); io.unobserve(e.target) } })
    }, { threshold: 0.14 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`lp-reveal${inView ? ' in' : ''}`}>{children}</div>
}

function SectionHead({ idx, title }: { idx: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
      <span className="lp-mono" style={{ fontSize: 12, color: 'var(--lp-accent)', letterSpacing: '.06em' }}>{idx}</span>
      <h2 className="lp-serif" style={{ fontWeight: 600, fontSize: 'clamp(26px, 3.2vw, 34px)', color: 'var(--lp-head)', letterSpacing: '-.01em' }}>{title}</h2>
    </div>
  )
}

/* ── module demo panels (mesma amostra dos protótipos aprovados) ─ */
const MODULOS: ModuleDemo[] = [
  {
    key: 'indicadores', tabLabel: 'Indicadores', eyebrow: '— Macroeconomia',
    title: 'Juros e inflação, em série',
    desc: 'SELIC, IPCA, CDI e PIB com histórico completo via BCB-SGS e IBGE — cada número com data, variação e fonte.',
    src: 'BCB-SGS · IBGE',
    render: () => (
      <div style={{ background: 'var(--lp-bg)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--lp-line)' }} className="lp-mono">
          <span style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--lp-muted)', textTransform: 'uppercase' }}>SELIC · série</span>
          <span style={{ fontSize: 10.5, color: 'var(--lp-muted)' }}>BCB-SGS</span>
        </div>
        {[['20/07/2026', '14,25% a.a.', '+0,00', 'up'], ['18/06/2026', '14,25% a.a.', '+0,00', 'up'], ['07/05/2026', '14,75% a.a.', '-0,50', 'down']].map(([data, valor, pct, dir], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < 2 ? '1px solid var(--lp-line)' : 'none' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--lp-head)' }}>{data}</span>
            <span className="lp-serif" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: 'var(--lp-head)' }}>{valor}</span>
            <span className="lp-mono" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, color: dir === 'up' ? 'var(--lp-up)' : 'var(--lp-down)', background: dir === 'up' ? 'color-mix(in srgb, var(--lp-up) 14%, transparent)' : 'color-mix(in srgb, var(--lp-down) 14%, transparent)' }}>{pct}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: 'rv', tabLabel: 'Renda Variável', eyebrow: '— Renda Variável',
    title: 'Ações e FIIs da B3',
    desc: 'Cotação, abertura/máxima/mínima e retorno de 2.375 ativos, direto do arquivo COTAHIST da B3.',
    src: 'B3 · COTAHIST',
    render: () => (
      <div style={{ background: 'linear-gradient(135deg, var(--lp-navy), #0d1f33)', color: '#F6F2EA', borderRadius: 'var(--lp-radius)', padding: '24px 26px' }}>
        <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>PETR4 · Petrobras PN</div>
        <div className="lp-serif" style={{ fontWeight: 700, fontSize: 34, letterSpacing: '-.02em', margin: '6px 0 18px' }}>R$ 38,72</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid rgba(255,255,255,.14)', paddingTop: 16 }}>
          {[['Abertura', 'R$ 38,20'], ['Máxima', 'R$ 38,95'], ['Mínima', 'R$ 38,05'], ['Retorno 12M', '+14,20%']].map(([k, v]) => (
            <div key={k}>
              <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{k}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: 'rf', tabLabel: 'Tesouro Direto', eyebrow: '— Tesouro Direto',
    title: 'Títulos públicos comparados',
    desc: 'Taxa, preço unitário e vencimento de todos os títulos do Tesouro, com o indexador lado a lado.',
    src: 'Tesouro Nacional',
    render: () => (
      <div style={{ background: 'linear-gradient(135deg, var(--lp-navy), #0d1f33)', color: '#F6F2EA', borderRadius: 'var(--lp-radius)', padding: '24px 26px' }}>
        <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>Tesouro IPCA+ · ago/2032</div>
        <div className="lp-serif" style={{ fontWeight: 700, fontSize: 34, letterSpacing: '-.02em', margin: '6px 0 18px' }}>IPCA + 8,21%</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid rgba(255,255,255,.14)', paddingTop: 16 }}>
          {[['PU mercado', 'R$ 2.942,31'], ['Vencimento', 'ago/2032'], ['Risco', 'Baixo'], ['Classe', '36 títulos']].map(([k, v]) => (
            <div key={k}>
              <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{k}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: 'fundos', tabLabel: 'Fundos', eyebrow: '— Fundos',
    title: 'Cota e performance via CVM',
    desc: 'Patrimônio, cota e retorno de 252 dias úteis para o universo de fundos informado à CVM.',
    src: 'CVM · Informe Diário',
    render: () => (
      <div style={{ background: 'var(--lp-bg)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--lp-line)' }} className="lp-mono">
          <span style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--lp-muted)', textTransform: 'uppercase' }}>Verde PVT Multimercado</span>
          <span style={{ fontSize: 10.5, color: 'var(--lp-muted)' }}>04.222.368/0001-55</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--lp-line)' }}>
          {[['Cota', 'R$ 577,52'], ['Patrimônio', 'R$ 189,5M'], ['Retorno 252D', '+15,77%']].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--lp-card)', padding: '14px 16px' }}>
              <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--lp-muted)' }}>{k}</div>
              <div className="lp-serif" style={{ fontWeight: 700, fontSize: 17, color: 'var(--lp-head)', marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: 'dashboard', tabLabel: 'Dashboard', eyebrow: '— Dashboard',
    title: 'Histórico unificado',
    desc: 'Último, média, máximo e mínimo de qualquer ativo no período — a leitura rápida antes do detalhe.',
    src: 'Base normalizada',
    render: () => (
      <div style={{ background: 'var(--lp-bg)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--lp-line)' }} className="lp-mono">
          <span style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--lp-muted)', textTransform: 'uppercase' }}>PETR4 · métricas</span>
          <span style={{ fontSize: 10.5, color: 'var(--lp-muted)' }}>07/07/25 → 20/07/26</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--lp-line)' }}>
          {[['Último', 'R$ 38,72'], ['Média', 'R$ 35,10'], ['Máximo', 'R$ 41,88'], ['Mínimo', 'R$ 30,14']].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--lp-card)', padding: '13px 15px' }}>
              <div className="lp-mono" style={{ fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--lp-muted)' }}>{k}</div>
              <div className="lp-serif" style={{ fontWeight: 700, fontSize: 17, color: 'var(--lp-head)', marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: 'noticias', tabLabel: 'Notícias', eyebrow: '— Notícias',
    title: 'As notícias que movem o mercado',
    desc: 'Feed agregado de InfoMoney, Valor, BCB, IBGE e B3, categorizado por tema.',
    src: 'RSS · 6 fontes',
    render: () => (
      <div style={{ background: 'var(--lp-bg)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: '4px 18px' }}>
        {[['Macro', 'Copom mantém Selic em 14,25% e sinaliza cautela', 'InfoMoney · há 2h'], ['Renda Variável', 'Petrobras aprova dividendos de R$ 1,20 por ação', 'Valor · há 4h'], ['Câmbio', 'Dólar recua com fluxo externo e fecha a R$ 5,42', 'B3 · há 5h']].map(([cat, ti, so], i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: i < 2 ? '1px solid var(--lp-line)' : 'none' }}>
            <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--lp-accent)' }}>{cat}</div>
            <div style={{ fontSize: 13.5, color: 'var(--lp-head)', fontWeight: 600, marginTop: 4, lineHeight: 1.35 }}>{ti}</div>
            <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-muted)', marginTop: 3 }}>{so}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: 'status', tabLabel: 'Status ETL', eyebrow: '— Status ETL',
    title: 'Observabilidade dos pipelines',
    desc: 'Cada job do ETL com horário, resultado e linhas processadas — erro aparece na hora, com a causa.',
    src: 'etl_runs',
    render: () => (
      <div style={{ border: '1px solid var(--lp-navy)', background: '#111826', color: '#E7E3D6', borderRadius: 'var(--lp-radius)', overflow: 'hidden' }} className="lp-mono">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(231,227,214,.14)', fontSize: 10, letterSpacing: '.14em', color: '#8c93a5' }}>
          <span>PIPELINE · MONITOR</span><span>● ● ●</span>
        </div>
        <div style={{ padding: '18px 16px', lineHeight: 1.8, fontSize: 12.5 }}>
          <div><span style={{ color: 'var(--lp-accent)' }}>08:15 ›</span> promover_cotahist · <span style={{ color: '#82C398' }}>OK</span> · 2.375 tickers</div>
          <div style={{ marginTop: 8 }}><span style={{ color: 'var(--lp-accent)' }}>09:00 ›</span> indicadores_batch · <span style={{ color: '#82C398' }}>OK</span> · 4 séries</div>
          <div style={{ marginTop: 8 }}><span style={{ color: '#E39C82' }}>14:26 ›</span> eventos_corporativos · <span style={{ color: '#E39C82' }}>Erro 403</span> · brapi.dev</div>
        </div>
      </div>
    ),
  },
]

/* ── page ─────────────────────────────────────────────────── */
export default function HomePage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [kpis, setKpis] = useState<KpiData[]>([
    { label: 'Taxa Selic', serie: 'selic', value: null, delta: null, unit: '% a.a.', source: 'BCB · Copom', dir: 'flat' },
    { label: 'IPCA 12 meses', serie: 'ipca', value: null, delta: null, unit: '%', source: 'IBGE', dir: 'flat' },
    { label: 'CDI diário', serie: 'cdi', value: null, delta: null, unit: '% a.a.', source: 'B3 · Cetip', dir: 'flat' },
    { label: 'PIB anual', serie: 'pib', value: null, delta: null, unit: '%', source: 'IBGE', dir: 'flat' },
  ])
  const [kpiError, setKpiError] = useState<string | null>(null)

  useEffect(() => {
    const series = ['selic', 'ipca', 'cdi', 'pib']
    Promise.all(series.map(s => getIndicadores(s, 2)))
      .then(results => {
        setKpis(prev => prev.map((k, i) => {
          const data: Indicador[] = results[i].data
          const last = data[0]?.valor ?? null
          const prevVal = data[1]?.valor ?? null
          const delta = last != null && prevVal != null ? last - prevVal : null
          const dir: KpiData['dir'] = delta == null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down'
          return { ...k, value: last, delta, dir }
        }))
      })
      .catch(() => setKpiError('Não foi possível carregar os indicadores agora.'))
  }, [])

  const [activeMod, setActiveMod] = useState(MODULOS[0].key)
  const mod = MODULOS.find(m => m.key === activeMod) ?? MODULOS[0]

  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 30px', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="lp-serif" style={{ width: 26, height: 26, background: 'var(--lp-navy)', color: '#F6F2EA', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, borderRadius: 5 }}>M</span>
            <b style={{ fontWeight: 600, fontSize: 16, color: 'var(--lp-head)', letterSpacing: '-.01em' }}>MCP Brasil</b>
          </div>
          <nav className="lp-nav" style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
            <a href="#como" style={{ fontSize: 13.5, color: 'var(--lp-ink)', textDecoration: 'none' }}>Como funciona</a>
            <a href="#modulos" style={{ fontSize: 13.5, color: 'var(--lp-ink)', textDecoration: 'none' }}>Módulos</a>
            <a href="#chat" style={{ fontSize: 13.5, color: 'var(--lp-ink)', textDecoration: 'none' }}>Chat Finance</a>
            <a href="#specs" style={{ fontSize: 13.5, color: 'var(--lp-ink)', textDecoration: 'none' }}>Especificação</a>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {mounted && (
              <button
                className="lp-themebtn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Alternar tema"
                style={{ width: 34, height: 34, borderRadius: 7, border: '1px solid var(--lp-line)', background: 'var(--lp-card)', color: 'var(--lp-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}
            <Link href="/indicadores" className="lp-btn" style={{ fontSize: 13.5, fontWeight: 500, background: 'var(--lp-navy)', color: '#F6F2EA', border: '1px solid var(--lp-navy)', padding: '9px 16px', textDecoration: 'none', borderRadius: 6 }}>
              Acessar plataforma
            </Link>
          </div>
        </div>
      </header>

      <div className="lp-wrap">
        <section className="lp-hero">
          <div>
            <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--lp-accent)' }}>— Dados financeiros brasileiros</span>
            <h1 className="lp-serif" style={{ fontWeight: 600, color: 'var(--lp-head)', fontSize: 'clamp(38px, 5.4vw, 60px)', lineHeight: 1.04, letterSpacing: '-.015em', margin: '16px 0 20px' }}>
              O mercado brasileiro, com clareza.
            </h1>
            <p style={{ fontSize: 17, maxWidth: '40ch', color: 'var(--lp-ink)', opacity: 0.85, marginBottom: 26 }}>
              Indicadores macro, renda variável, renda fixa e fundos consolidados em um único painel — sempre a partir de fontes oficiais.
            </p>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/indicadores" className="lp-btn" style={{ fontSize: 13.5, fontWeight: 500, background: 'var(--lp-navy)', color: '#F6F2EA', border: '1px solid var(--lp-navy)', padding: '9px 16px', textDecoration: 'none', borderRadius: 6 }}>Acessar plataforma</Link>
              <a href="#modulos" className="lp-btn ghost" style={{ fontSize: 13.5, fontWeight: 500, background: 'transparent', color: 'var(--lp-ink)', border: '1px solid var(--lp-line)', padding: '9px 16px', textDecoration: 'none', borderRadius: 6 }}>Ver os módulos</a>
            </div>
            <p className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)', marginTop: 20, letterSpacing: '.02em' }}>FONTES: B3 · BANCO CENTRAL · CVM · IBGE — 100% PÚBLICAS</p>
          </div>

          <div className="lp-panel" style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--lp-line)' }} className="lp-mono">
              <span style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--lp-muted)', textTransform: 'uppercase' }}>Indicadores-chave</span>
              <span style={{ fontSize: 10.5, color: 'var(--lp-muted)' }}>Fontes oficiais</span>
            </div>
            {kpiError ? (
              <div style={{ padding: 20, fontSize: 12.5, color: 'var(--lp-down)' }}>{kpiError}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {kpis.map(k => (
                  <div key={k.serie} className="lp-icard" style={{ background: 'var(--lp-card)', padding: '16px 16px 14px' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {k.label}
                      <span className="lp-mono" style={{
                        fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
                        color: k.dir === 'up' ? 'var(--lp-up)' : 'var(--lp-muted)',
                        background: k.dir === 'up' ? 'color-mix(in srgb, var(--lp-up) 12%, transparent)' : 'var(--lp-bg2)',
                      }}>
                        {k.delta != null ? `${k.delta >= 0 ? '▲' : '▼'} ${Math.abs(k.delta).toFixed(2)}` : '0,00'}
                      </span>
                    </div>
                    <div className="lp-serif" style={{ fontWeight: 700, fontSize: 26, color: 'var(--lp-head)', margin: '7px 0 2px', letterSpacing: '-.01em' }}>
                      {k.value != null ? k.value.toFixed(2) : '—'}
                      <small style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--lp-muted)', fontFamily: 'var(--font-inter)', marginLeft: 2 }}>{k.unit}</small>
                    </div>
                    <div className="lp-mono" style={{ fontSize: 9.5, color: 'var(--lp-muted)', letterSpacing: '.04em', marginTop: 6 }}>{k.source}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="lp-ticker" aria-label="Cotações do mercado">
        <div className="lp-ticker-run">
          {[...TICKER, ...TICKER].map((tk, i) => (
            <span key={i} className="lp-tick lp-mono" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 9, padding: '12px 24px', fontSize: 12.5, color: '#F6F2EA' }}>
              <b style={{ fontWeight: 700 }}>{tk.t}</b>
              <span style={{ opacity: 0.82 }}>{tk.v}</span>
              <span style={{ color: tk.dir === 'up' ? '#82C398' : '#E39C82' }}>{tk.dir === 'up' ? '▲' : '▼'} {tk.d}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="lp-wrap">
        <section id="como" style={{ padding: '82px 0' }}>
          <Reveal><SectionHead idx="§ 01" title="Como o dado vira análise" /></Reveal>
          <Reveal><p style={{ color: 'var(--lp-muted)', fontSize: 15, maxWidth: '54ch', marginBottom: 34 }}>Do coletor à consulta, três etapas — e a fonte de cada número fica sempre à mão.</p></Reveal>
          <Reveal>
            <div className="lp-cards3">
              {[
                { step: '01', tag: 'Ingestão', title: 'Coleta diária', body: 'Um cron busca preços, proventos e indicadores direto das fontes oficiais, sem intermediário pago.', src: 'B3 · BCB/SGS · CVM' },
                { step: '02', tag: 'Normalização', title: 'Base consistente', body: 'Os dados são padronizados e validados por uma rotina de QA que trava o deploy se algo destoa.', src: 'PostgreSQL · QA a cada release' },
                { step: '03', tag: 'Consulta', title: 'Painel + copiloto', body: 'Você abre o painel ou pergunta ao Chat Finance. A resposta sai da mesma base, com a fonte junto.', src: 'Painel + Chat Finance' },
              ].map(c => (
                <div key={c.step} className="lp-pcard" style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: '24px 22px' }}>
                  <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)', float: 'right' }}>{c.step}</span>
                  <span className="lp-mono" style={{ fontSize: 10, letterSpacing: '.12em', color: 'var(--lp-accent)', textTransform: 'uppercase' }}>{c.tag}</span>
                  <h3 className="lp-serif" style={{ fontWeight: 600, fontSize: 20, color: 'var(--lp-head)', margin: '16px 0 9px' }}>{c.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--lp-ink)', opacity: 0.85 }}>{c.body}</p>
                  <div className="lp-mono" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--lp-line)', fontSize: 11, color: 'var(--lp-muted)' }}>{c.src}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* §02 MÓDULOS — menu que demonstra cada tela inline */}
        <section id="modulos" style={{ padding: '0 0 82px' }}>
          <Reveal><SectionHead idx="§ 02" title="Um painel, sete módulos" /></Reveal>
          <Reveal><p style={{ color: 'var(--lp-muted)', fontSize: 15, maxWidth: '54ch', marginBottom: 24 }}>Toda a plataforma em uma página. Escolha um módulo e veja a tela real — cada uma alimentada pela mesma base normalizada.</p></Reveal>
          <Reveal>
            <div className="lp-mod-menu" style={{ marginBottom: 26 }}>
              {MODULOS.map((m, i) => (
                <button
                  key={m.key}
                  className={`lp-mod-tab${activeMod === m.key ? ' on' : ''}`}
                  onClick={() => setActiveMod(m.key)}
                  style={{
                    fontSize: 13, fontWeight: 500, padding: '8px 15px', borderRadius: 8,
                    background: activeMod === m.key ? 'var(--lp-navy)' : 'var(--lp-card)',
                    border: `1px solid ${activeMod === m.key ? 'var(--lp-navy)' : 'var(--lp-line)'}`,
                    color: activeMod === m.key ? '#F6F2EA' : 'var(--lp-muted)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span className="lp-mono" style={{ fontSize: 10, opacity: 0.7 }}>{String(i + 1).padStart(2, '0')}</span>
                  {m.tabLabel}
                </button>
              ))}
            </div>
          </Reveal>
          <Reveal>
            <div className="lp-mod-stage" style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 14, padding: '34px 32px' }}>
              <div>
                <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--lp-accent)', display: 'block', marginBottom: 10 }}>{mod.eyebrow}</span>
                <h3 className="lp-serif" style={{ fontWeight: 600, fontSize: 26, color: 'var(--lp-head)', lineHeight: 1.1, marginBottom: 12, letterSpacing: '-.01em' }}>{mod.title}</h3>
                <p style={{ fontSize: 15, color: 'var(--lp-ink)', opacity: 0.82, marginBottom: 18, maxWidth: '42ch' }}>{mod.desc}</p>
                <div className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)', letterSpacing: '.03em' }}>{mod.src}</div>
              </div>
              <div key={mod.key} className="lp-fade">{mod.render()}</div>
            </div>
          </Reveal>
        </section>

        {/* §03 Chat */}
        <section id="chat" style={{ padding: '0 0 82px' }}>
          <div className="lp-chat-grid">
            <Reveal>
              <div className="lp-chat-copy">
                <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--lp-accent)' }}>§ 03 — Copiloto</span>
                <h2 className="lp-serif" style={{ fontWeight: 600, fontSize: 'clamp(26px, 3.2vw, 34px)', color: 'var(--lp-head)', lineHeight: 1.1, margin: '12px 0 14px', letterSpacing: '-.01em' }}>
                  Pergunte em português. Receba o número com a fonte.
                </h2>
                <p style={{ fontSize: 15.5, maxWidth: '42ch', color: 'var(--lp-ink)', opacity: 0.82, marginBottom: 14 }}>
                  O Chat Finance lê a mesma base normalizada do painel. Cada valor vem de uma consulta rastreável — nada de resposta inventada.
                </p>
                <ul style={{ listStyle: 'none', marginTop: 18 }}>
                  {['Comparações entre ativos', 'Histórico de proventos e yield', 'Contexto macro: Selic, IPCA, câmbio', 'Independente do modelo de IA'].map(li => (
                    <li key={li} style={{ fontSize: 14, color: 'var(--lp-ink)', padding: '9px 0', borderBottom: '1px solid var(--lp-line)', display: 'flex', gap: 10 }}>{li}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal>
              <div style={{ border: '1px solid var(--lp-navy)', background: '#111826', color: '#E7E3D6', borderRadius: 12, fontSize: 13, overflow: 'hidden', boxShadow: '0 18px 44px -30px rgba(0,0,0,.6)' }} className="lp-mono">
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(231,227,214,.14)', fontSize: 10, letterSpacing: '.14em', color: '#8c93a5' }}>
                  <span>CHAT FINANCE — SESSÃO 0xA3</span><span>● ● ●</span>
                </div>
                <div style={{ padding: '20px 18px', lineHeight: 1.65 }}>
                  <div style={{ marginBottom: 16 }}><span style={{ color: 'var(--lp-accent)' }}>você ›</span> Compare o dividend yield de ITUB4 e BBDC4 nos últimos 12 meses.</div>
                  <div style={{ color: '#C7CCD8' }}>
                    <span style={{ color: '#82C398' }}>finance ›</span> Consultando proventos e preço médio…
                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
                      <tbody>
                        <tr><th style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, color: '#8c93a5', fontWeight: 400, textAlign: 'left' }}>Ativo</th><th style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, color: '#8c93a5', fontWeight: 400, textAlign: 'right' }}>Prov. 12m</th><th style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, color: '#8c93a5', fontWeight: 400, textAlign: 'right' }}>Preço</th><th style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, color: '#8c93a5', fontWeight: 400, textAlign: 'right' }}>DY</th></tr>
                        <tr><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'left' }}>ITUB4</td><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'right' }}>R$ 2,71</td><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'right' }}>R$ 35,90</td><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'right', color: '#82C398' }}>7,55%</td></tr>
                        <tr><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'left' }}>BBDC4</td><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'right' }}>R$ 1,04</td><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'right' }}>R$ 14,88</td><td style={{ border: '1px solid rgba(231,227,214,.16)', padding: '6px 10px', fontSize: 12, textAlign: 'right', color: '#82C398' }}>6,99%</td></tr>
                      </tbody>
                    </table>
                    ITUB4 lidera por ~0,56 p.p. no período. Fonte: CVM (proventos) + B3 (fechamento).
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* §04 Especificação */}
        <section id="specs" style={{ padding: '0 0 82px' }}>
          <Reveal><SectionHead idx="§ 04" title="Especificação técnica" /></Reveal>
          <Reveal><p style={{ color: 'var(--lp-muted)', fontSize: 15, maxWidth: '54ch', marginBottom: 34 }}>O que sustenta a plataforma, sem letra miúda.</p></Reveal>
          <Reveal>
            <div className="lp-spec">
              {[['7', 'Módulos'], ['24/h', 'Ciclo de ETL'], ['100%', 'Fontes públicas'], ['QA ✓', 'Valida cada deploy']].map(([n, k]) => (
                <div key={k} style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: '26px 22px' }}>
                  <div className="lp-serif" style={{ fontWeight: 700, fontSize: 38, color: 'var(--lp-head)', letterSpacing: '-.02em', lineHeight: 1 }}>{n}</div>
                  <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.06em', color: 'var(--lp-muted)', marginTop: 12, textTransform: 'uppercase' }}>{k}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* §05 Estados do dado */}
        <section id="estados" style={{ padding: '0 0 82px' }}>
          <Reveal><SectionHead idx="§ 05" title="Todo dado tem quatro estados" /></Reveal>
          <Reveal><p style={{ color: 'var(--lp-muted)', fontSize: 15, maxWidth: '54ch', marginBottom: 34 }}>Nada de "—%" quando algo falha. Cada indicador comunica exatamente em que estado está — e o que fazer em seguida.</p></Reveal>
          <Reveal>
            <div className="lp-states">
              <div style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: 20, minHeight: 190, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--lp-head)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lp-muted)' }} />Carregando</span>
                  <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)' }}>01</span>
                </div>
                <div className="lp-sk" style={{ height: 22, width: '66%', margin: '2px 0 12px' }} />
                <div className="lp-sk" style={{ width: '100%', margin: '10px 0' }} />
                <div className="lp-sk" style={{ width: '44%' }} />
                <div style={{ fontSize: 12.5, color: 'var(--lp-muted)', lineHeight: 1.5, marginTop: 'auto' }}>Skeleton enquanto a API responde.</div>
              </div>
              <div style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: 20, minHeight: 190, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--lp-head)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lp-down)' }} />Erro</span>
                  <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)' }}>02</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-head)', marginBottom: 6 }}>Não foi possível carregar</div>
                <div style={{ fontSize: 12.5, color: 'var(--lp-muted)', lineHeight: 1.5 }}>Falha ao consultar o BCB (SGS). Última leitura válida há 6 min.</div>
                <button className="lp-btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'auto', fontSize: 11, border: '1px solid var(--lp-line)', background: 'var(--lp-bg)', padding: '6px 11px', borderRadius: 6, color: 'var(--lp-ink)', cursor: 'pointer' }}>↻ Tentar novamente</button>
              </div>
              <div style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: 20, minHeight: 190, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--lp-head)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--lp-muted)' }} />Vazio</span>
                  <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)' }}>03</span>
                </div>
                <div className="lp-serif" style={{ fontSize: 30, color: 'var(--lp-muted)', opacity: 0.5, margin: '2px 0 8px' }}>—</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-head)', marginBottom: 6 }}>Sem dado no período</div>
                <div style={{ fontSize: 12.5, color: 'var(--lp-muted)', lineHeight: 1.5 }}>Nenhuma divulgação para o intervalo. O próximo dado sai em 24 dias.</div>
              </div>
              <div style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', padding: 20, minHeight: 190, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--lp-head)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lp-up)' }} />Carregado</span>
                  <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-muted)' }}>04</span>
                </div>
                <div className="lp-serif" style={{ fontSize: 24, fontWeight: 700, color: 'var(--lp-head)' }}>5,32<small style={{ fontSize: 12, color: 'var(--lp-muted)', fontFamily: 'var(--font-inter)' }}>%</small></div>
                <div style={{ fontSize: 12.5, color: 'var(--lp-muted)', lineHeight: 1.5 }}>IPCA 12 meses · acima do teto da meta</div>
                <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-muted)', marginTop: 'auto' }}>IBGE</div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Próximos eventos */}
        <section style={{ padding: '0 0 82px', maxWidth: 640 }}>
          <Reveal><h2 className="lp-serif" style={{ fontSize: 21, fontWeight: 600, color: 'var(--lp-head)', marginBottom: 16 }}>Próximos eventos</h2></Reveal>
          <Reveal>
            <div style={{ background: 'var(--lp-card)', border: '1px solid var(--lp-line)', borderRadius: 'var(--lp-radius)', overflow: 'hidden' }}>
              {EVENTOS.map((e, i) => {
                const soon = e.inDays <= 7
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: i < EVENTOS.length - 1 ? '1px solid var(--lp-line)' : 'none' }}>
                    <div style={{ textAlign: 'center', minWidth: 44, borderLeft: `3px solid ${soon ? 'var(--lp-accent)' : 'var(--lp-line)'}`, paddingLeft: 10 }}>
                      <div className="lp-serif" style={{ fontSize: 19, fontWeight: 500, color: soon ? 'var(--lp-accent)' : 'var(--lp-head)', lineHeight: 1 }}>{e.d}</div>
                      <div className="lp-mono" style={{ fontSize: 9, color: 'var(--lp-muted)', letterSpacing: '.05em' }}>{e.m}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-head)', marginBottom: 2 }}>{e.t}</p>
                      <p style={{ fontSize: 11, color: 'var(--lp-muted)' }}>{e.s}</p>
                    </div>
                    <span className="lp-mono" style={{ fontSize: 11, color: soon ? 'var(--lp-accent)' : 'var(--lp-muted)', background: soon ? 'color-mix(in srgb, var(--lp-accent) 12%, transparent)' : 'var(--lp-line2)', borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                      em {e.inDays}d
                    </span>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </section>
      </div>

      <div className="lp-wrap">
        <section style={{ textAlign: 'center', padding: '96px 0' }}>
          <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--lp-accent)' }}>Comece agora</span>
          <h2 className="lp-serif" style={{ fontWeight: 600, fontSize: 'clamp(30px, 4.6vw, 48px)', color: 'var(--lp-head)', lineHeight: 1.06, letterSpacing: '-.02em', maxWidth: '16ch', margin: '14px auto 26px' }}>
            Analise o mercado com clareza.
          </h2>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/indicadores" className="lp-btn" style={{ fontSize: 13.5, fontWeight: 500, background: 'var(--lp-navy)', color: '#F6F2EA', border: '1px solid var(--lp-navy)', padding: '9px 16px', textDecoration: 'none', borderRadius: 6 }}>Acessar plataforma</Link>
            <a href="#modulos" className="lp-btn ghost" style={{ fontSize: 13.5, fontWeight: 500, background: 'transparent', color: 'var(--lp-ink)', border: '1px solid var(--lp-line)', padding: '9px 16px', textDecoration: 'none', borderRadius: 6 }}>Ver os módulos</a>
          </div>
          <p className="lp-mono" style={{ color: 'var(--lp-muted)', fontSize: 11, marginTop: 24, letterSpacing: '.08em' }}>NÃO CONSTITUI RECOMENDAÇÃO DE INVESTIMENTO</p>
        </section>
      </div>

      <footer style={{ borderTop: '1px solid var(--lp-line)', background: 'var(--lp-bg2)' }}>
        <div className="lp-tblock lp-wrap">
          <div style={{ padding: '28px 26px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg viewBox="0 0 100 100" width={48} height={48} aria-hidden="true">
                <circle cx={50} cy={50} r={46} fill="none" stroke="var(--lp-head)" strokeWidth={1.2} />
                <circle cx={50} cy={50} r={38} fill="none" stroke="var(--lp-accent)" strokeWidth={0.8} />
                <text x={50} y={47} textAnchor="middle" fontWeight={700} fontSize={16} fill="var(--lp-head)">MCP</text>
                <text x={50} y={61} textAnchor="middle" fontSize={7.5} fill="var(--lp-muted)" letterSpacing={1.5}>BRASIL</text>
              </svg>
              <div className="lp-mono" style={{ fontSize: 10.5, color: 'var(--lp-muted)', lineHeight: 1.6 }}>Dados públicos<br />do mercado<br />brasileiro</div>
            </div>
          </div>
          <div style={{ padding: '28px 26px', borderLeft: '1px solid var(--lp-line)' }}>
            <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Plataforma</div>
            <a href="#como" style={{ color: 'var(--lp-ink)', textDecoration: 'none', display: 'block', padding: '4px 0', fontSize: 13.5, opacity: 0.82 }}>Como funciona</a>
            <a href="#modulos" style={{ color: 'var(--lp-ink)', textDecoration: 'none', display: 'block', padding: '4px 0', fontSize: 13.5, opacity: 0.82 }}>Módulos</a>
            <a href="#chat" style={{ color: 'var(--lp-ink)', textDecoration: 'none', display: 'block', padding: '4px 0', fontSize: 13.5, opacity: 0.82 }}>Chat Finance</a>
          </div>
          <div style={{ padding: '28px 26px', borderLeft: '1px solid var(--lp-line)' }}>
            <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Fontes de dados</div>
            <span style={{ color: 'var(--lp-ink)', display: 'block', padding: '4px 0', fontSize: 13.5, opacity: 0.82 }}>B3 — Bolsa</span>
            <span style={{ color: 'var(--lp-ink)', display: 'block', padding: '4px 0', fontSize: 13.5, opacity: 0.82 }}>Banco Central · SGS</span>
            <span style={{ color: 'var(--lp-ink)', display: 'block', padding: '4px 0', fontSize: 13.5, opacity: 0.82 }}>CVM · IBGE</span>
          </div>
          <div style={{ padding: '28px 0 28px 26px', borderLeft: '1px solid var(--lp-line)' }}>
            <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--lp-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Rev.</div>
            <div className="lp-mono" style={{ fontSize: 13.5 }}>1.4 / 2026</div>
          </div>
        </div>
        <div className="lp-mono" style={{ maxWidth: 1160, margin: '0 auto', padding: '18px 30px', borderTop: '1px solid var(--lp-line)', fontSize: 10.5, color: 'var(--lp-muted)', lineHeight: 1.7 }}>
          MCP BRASIL É UMA FERRAMENTA DE ANÁLISE INFORMACIONAL. OS DADOS EXIBIDOS SÃO DE FONTES PÚBLICAS E PODEM CONTER DEFASAGEM. NADA NESTA PÁGINA CONSTITUI RECOMENDAÇÃO, OFERTA OU SOLICITAÇÃO DE COMPRA OU VENDA DE VALORES MOBILIÁRIOS. DECISÕES DE INVESTIMENTO SÃO DE RESPONSABILIDADE DO USUÁRIO.
        </div>
      </footer>
    </div>
  )
}
