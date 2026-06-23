'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { getIndicadores, perguntarCopilot, APIError, type Indicador } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface Mensagem {
  role: 'user' | 'assistant'
  content: string
  cached?: boolean
  fonte?: string
}

const SUGESTOES = [
  'Como está o IPCA nos últimos 12 meses?',
  'Qual o desempenho da PETR4 no ano?',
  'Compare SELIC e CDI historicamente.',
  'O que é juro real e qual o valor atual?',
]

export default function CopilotPage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput]         = useState('')
  const [carregando, setCarregando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Context data
  const [selicHistory, setSelicHistory] = useState<{ data: string; valor: number }[]>([])
  const [lastSelic, setLastSelic]       = useState<number | null>(null)
  const [lastIpca, setLastIpca]         = useState<number | null>(null)
  const [lastCdi, setLastCdi]           = useState<number | null>(null)
  const [ctxLoading, setCtxLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      getIndicadores('selic', 12),
      getIndicadores('ipca', 1),
      getIndicadores('cdi', 1),
    ]).then(([selic, ipca, cdi]) => {
      const hist = [...selic.data].reverse()
      setSelicHistory(hist.map(d => ({ data: d.data, valor: d.valor })))
      setLastSelic(selic.data[0]?.valor ?? null)
      setLastIpca(ipca.data[0]?.valor ?? null)
      setLastCdi(cdi.data[0]?.valor ?? null)
    }).catch(() => {}).finally(() => setCtxLoading(false))
  }, [])

  const juroReal = lastSelic != null && lastIpca != null
    ? +((lastSelic - lastIpca) / (1 + lastIpca / 100) * 100).toFixed(2)
    : null

  const chartData = useMemo(() => selicHistory.map(d => ({
    data: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    valor: d.valor,
  })), [selicHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, carregando])

  async function enviar(pergunta?: string) {
    const texto = (pergunta ?? input).trim()
    if (!texto || carregando) return
    setInput('')
    setMensagens(prev => [...prev, { role: 'user', content: texto }])
    setCarregando(true)
    try {
      const res = await perguntarCopilot(texto)
      setMensagens(prev => [...prev, { role: 'assistant', content: res.resposta, cached: res.cached, fonte: res.fonte }])
    } catch (e) {
      const detail = e instanceof APIError && e.detail ? e.detail : null
      setMensagens(prev => [...prev, { role: 'assistant', content: detail ?? 'Erro ao processar sua pergunta. Tente novamente.' }])
    } finally {
      setCarregando(false)
    }
  }

  const contextCards = [
    { label: 'SELIC',     value: lastSelic,  unit: '% a.a.', color: 'var(--cl-accent)' },
    { label: 'IPCA 12M',  value: lastIpca,   unit: '%',      color: 'var(--cl-down)'   },
    { label: 'Juro Real', value: juroReal,   unit: '%',      color: 'var(--cl-up)'     },
    { label: 'CDI',       value: lastCdi,    unit: '% a.a.', color: 'var(--cl-amber)'  },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
      height: 'calc(100vh - 64px)',
    }}>

      {/* ── LEFT PANEL — Contexto de mercado ─────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
        borderRadius: 'var(--cl-radius)', padding: 24, boxShadow: 'var(--cl-shadow)',
        overflow: 'auto',
      }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--cl-ink)', marginBottom: 4 }}>Contexto de mercado</h2>
          <p style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>Dados reais · BCB · IBGE · CETIP</p>
        </div>

        {/* Context stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {contextCards.map(c => (
            <div key={c.label} style={{
              background: 'var(--cl-bg)', border: '1px solid var(--cl-line)',
              borderRadius: 'var(--cl-radius-sm)', padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: c.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {ctxLoading ? '…' : c.value != null ? c.value.toFixed(2) : '—'}
                <small style={{ fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'var(--cl-ink3)', marginLeft: 4 }}>{c.unit}</small>
              </div>
            </div>
          ))}
        </div>

        {/* SELIC chart */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cl-ink3)', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>SELIC histórico · 12 meses</div>
          {ctxLoading ? (
            <div style={{ height: 140, background: 'var(--cl-line2)', borderRadius: 8 }} />
          ) : chartData.length > 0 ? (
            <div style={{ background: 'var(--cl-bg)', borderRadius: 'var(--cl-radius-sm)', padding: '8px 0 4px', border: '1px solid var(--cl-line)' }}>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-ctx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--cl-accent)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--cl-accent)" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-line)" vertical={false} />
                  <XAxis dataKey="data" tick={{ fontSize: 10, fill: 'var(--cl-ink3)' }} stroke="transparent" tickLine={false} height={24} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--cl-ink3)' }} stroke="transparent" tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 'auto']} width={36} tickLine={false} />
                  <Tooltip
                    formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)}%` : '—', 'SELIC']}
                    contentStyle={{ background: 'var(--cl-card)', border: '1px solid var(--cl-line)', borderRadius: 8, fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="valor" stroke="var(--cl-accent)" strokeWidth={2} fill="url(#grad-ctx)" dot={false} activeDot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>

        {/* Info */}
        <div style={{
          marginTop: 'auto', padding: '12px 14px',
          background: 'var(--cl-accent-soft)', borderRadius: 'var(--cl-radius-sm)',
          border: '1px solid var(--cl-accent)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--cl-accent)', fontWeight: 600, marginBottom: 3 }}>Chat Finance</p>
          <p style={{ fontSize: 11, color: 'var(--cl-ink3)', lineHeight: 1.55 }}>
            Copilot financeiro com acesso aos dados reais da plataforma — indicadores, ações e fundos.
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — Chat ────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
        borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
        overflow: 'hidden',
      }}>
        {/* Chat header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--cl-line)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cl-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>✦</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cl-ink)' }}>Assistente Financeiro</div>
            <div style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>Dados reais · Supabase + MCP Brasil</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--cl-up)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--cl-up)', display: 'inline-block' }} />
            online
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mensagens.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, paddingBottom: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-ink)', marginBottom: 6 }}>Como posso ajudar?</p>
                <p style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>Pergunte sobre indicadores, ações ou fundos do mercado brasileiro.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 340 }}>
                {SUGESTOES.map(s => (
                  <button key={s} onClick={() => enviar(s)} style={{
                    textAlign: 'left', fontSize: 11, padding: '10px 12px',
                    background: 'var(--cl-bg)', border: '1px solid var(--cl-line)',
                    borderRadius: 'var(--cl-radius-sm)', cursor: 'pointer',
                    color: 'var(--cl-ink3)', lineHeight: 1.4, transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--cl-accent)'; el.style.color = 'var(--cl-ink)' }}
                    onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--cl-line)'; el.style.color = 'var(--cl-ink3)' }}
                  >{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {mensagens.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: m.role === 'user' ? 'var(--cl-navy)' : 'var(--cl-line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: m.role === 'user' ? '#fff' : 'var(--cl-ink3)',
                  }}>
                    {m.role === 'user' ? '↑' : '✦'}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '85%', fontSize: 13, lineHeight: 1.6,
                      padding: '10px 14px',
                      borderRadius: m.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                      background: m.role === 'user' ? 'var(--cl-navy)' : 'var(--cl-bg)',
                      color: m.role === 'user' ? '#fff' : 'var(--cl-ink)',
                      border: m.role === 'assistant' ? '1px solid var(--cl-line)' : 'none',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.content}
                    </div>
                    {m.role === 'assistant' && (m.cached || m.fonte) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {m.fonte && <span style={{ fontSize: 10, color: 'var(--cl-ink3)', background: 'var(--cl-line2)', borderRadius: 4, padding: '1px 6px' }}>{m.fonte}</span>}
                        {m.cached && <span style={{ fontSize: 10, color: 'var(--cl-amber)', background: 'var(--cl-amber-soft)', borderRadius: 4, padding: '1px 6px' }}>cached</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {carregando && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--cl-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--cl-ink3)', flexShrink: 0 }}>✦</div>
                  <div style={{
                    padding: '10px 14px', background: 'var(--cl-bg)', border: '1px solid var(--cl-line)',
                    borderRadius: '4px 14px 14px 14px', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 5, height: 5, borderRadius: '50%', background: 'var(--cl-ink3)',
                          animation: `cl-fadeup 1s ease-in-out ${i * 0.2}s infinite alternate`,
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>Analisando…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--cl-line)', flexShrink: 0,
          display: 'flex', gap: 10, alignItems: 'flex-end',
        }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
            placeholder="Pergunte sobre IPCA, PETR4, fundos…"
            disabled={carregando}
            style={{
              flex: 1, fontSize: 13, padding: '10px 14px',
              background: 'var(--cl-bg)', border: '1px solid var(--cl-line)',
              borderRadius: 'var(--cl-radius-sm)', outline: 'none',
              color: 'var(--cl-ink)', transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--cl-accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--cl-line)')}
          />
          <button
            onClick={() => enviar()}
            disabled={!input.trim() || carregando}
            style={{
              width: 44, height: 44, borderRadius: 'var(--cl-radius-sm)',
              background: !input.trim() || carregando ? 'var(--cl-line)' : 'var(--cl-navy)',
              color: '#fff', border: 'none', cursor: !input.trim() || carregando ? 'default' : 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >↑</button>
        </div>
      </div>
    </div>
  )
}
