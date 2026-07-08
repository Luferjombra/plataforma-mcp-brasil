'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { getEtlHealth, type EtlJob, type EtlHealth, type EtlStatus } from '@/lib/api'
import { formatDataHoraBRT } from '@/lib/format'

const STATUS_CFG: Record<EtlStatus, { label: string; symbol: string; color: string; bg: string }> = {
  ok:      { label: 'Online',        symbol: '✓', color: 'var(--cl-up)',     bg: 'var(--cl-up-soft)'     },
  stale:   { label: 'Desatualizado', symbol: '⚠', color: 'var(--cl-amber)',  bg: 'var(--cl-amber-soft)'  },
  error:   { label: 'Erro',          symbol: '✗', color: 'var(--cl-down)',   bg: 'var(--cl-down-soft)'   },
  running: { label: 'Rodando',       symbol: '↻', color: 'var(--cl-accent)', bg: 'var(--cl-accent-soft)' },
  unknown: { label: 'Sem dados',     symbol: '?', color: 'var(--cl-ink3)',   bg: 'var(--cl-line2)'       },
}

const SOURCES = [
  { key: 'BCB',    label: 'Banco Central',   endpoint: '/indicadores',        matches: (j: string) => /bcb|selic|cdi|cambio|juros/i.test(j) },
  { key: 'IBGE',   label: 'IBGE',            endpoint: '/indicadores/ipca',   matches: (j: string) => /ibge|ipca|pib/i.test(j) },
  { key: 'CVM',    label: 'CVM',             endpoint: '/fundos',             matches: (j: string) => /cvm|fundo/i.test(j) },
  { key: 'B3',     label: 'B3',              endpoint: '/rv/ativos',          matches: (j: string) => /b3|rv|ativo|acao|ibov/i.test(j) },
  { key: 'TD',     label: 'Tesouro Direto',  endpoint: '/rf/titulos',         matches: (j: string) => /td|rf|tesouro|renda.?fixa/i.test(j) },
  { key: 'ANBIMA', label: 'ANBIMA',          endpoint: '/fundos/historico',   matches: (j: string) => /anbima/i.test(j) },
]


function fmtDuration(secs: number | null) {
  if (secs == null) return '—'
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function TerminalLog({ jobs }: { jobs: EtlJob[] }) {
  const lines = jobs.flatMap(j => {
    const cfg  = STATUS_CFG[j.status]
    const time = j.started_at ? new Date(j.started_at).toISOString().slice(11, 19) : '--:--:--'
    const rows = [
      { type: j.status === 'ok' ? 'ok' : j.status === 'error' ? 'error' : 'info',
        text: `[${time}] ${cfg.symbol} ${j.job} · ${cfg.label}${j.rows_upserted != null ? ` · ${j.rows_upserted.toLocaleString('pt-BR')} linhas` : ''}${j.duration_seconds != null ? ` · ${fmtDuration(j.duration_seconds)}` : ''}` },
    ]
    if (j.error_msg) rows.push({ type: 'error', text: `  ↳ ${j.error_msg}` })
    return rows
  })

  const LINE_COLORS: Record<string, string> = {
    ok:    'var(--cl-up)',
    error: 'var(--cl-down)',
    warn:  'var(--cl-amber)',
    info:  'var(--cl-ink3)',
  }

  return (
    <div style={{
      background: '#0a0e14', borderRadius: 'var(--cl-radius-sm)',
      padding: '14px 16px', fontFamily: "'Courier New', 'IBM Plex Mono', monospace",
      fontSize: 11, lineHeight: 1.8, overflowY: 'auto', maxHeight: 200,
      border: '1px solid rgba(255,255,255,.06)',
    }}>
      {lines.length === 0 ? (
        <span style={{ color: '#4b5563' }}>// sem logs disponíveis</span>
      ) : lines.map((l, i) => (
        <div key={i} style={{ color: LINE_COLORS[l.type] ?? LINE_COLORS.info, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {l.text}
        </div>
      ))}
    </div>
  )
}

const REFRESH = 60

export default function StatusPage() {
  const [data, setData]           = useState<EtlHealth | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH)
  const [lastChecked, setLastChecked] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await getEtlHealth()
      setData(res)
      setLastChecked(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
      setCountdown(REFRESH)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar na API')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    const id = setInterval(() => setCountdown(prev => {
      if (prev <= 1) { carregar(); return REFRESH }
      return prev - 1
    }), 1000)
    return () => clearInterval(id)
  }, [carregar])

  const jobs    = data?.jobs ?? []
  const summary = data?.summary

  const uptime = summary && summary.total > 0
    ? Math.round((summary.ok / summary.total) * 100)
    : null
  const avgDuration = jobs.length > 0
    ? jobs.reduce((sum, j) => sum + (j.duration_seconds ?? 0), 0) / jobs.length
    : null

  // Group jobs by source
  const grouped = useMemo(() => {
    const result: { source: typeof SOURCES[0]; jobs: EtlJob[] }[] = []
    const assigned = new Set<string>()
    for (const src of SOURCES) {
      const matched = jobs.filter(j => src.matches(j.job))
      matched.forEach(j => assigned.add(j.job))
      result.push({ source: src, jobs: matched })
    }
    const others = jobs.filter(j => !assigned.has(j.job))
    if (others.length > 0) {
      result.push({ source: { key: 'OTHER', label: 'Outros', endpoint: '—', matches: () => true }, jobs: others })
    }
    return result
  }, [jobs])

  const worstStatus = (jobList: EtlJob[]): EtlStatus => {
    if (jobList.length === 0) return 'unknown'
    if (jobList.some(j => j.status === 'error'))   return 'error'
    if (jobList.some(j => j.status === 'running')) return 'running'
    if (jobList.some(j => j.status === 'stale'))   return 'stale'
    if (jobList.some(j => j.status === 'ok'))      return 'ok'
    return 'unknown'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--cl-ink)' }}>Status ETL</h1>
          <p style={{ fontSize: 13, color: 'var(--cl-ink3)', marginTop: 4 }}>
            Monitoramento dos pipelines de dados · auto-refresh em {countdown}s
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastChecked && <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>Atualizado: {lastChecked} BRT</span>}
          <button onClick={carregar} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 'var(--cl-radius-sm)', fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            background: 'var(--cl-card)', border: '1px solid var(--cl-line)', color: 'var(--cl-ink)',
            transition: 'all 0.15s', opacity: loading ? 0.6 : 1,
          }}>
            <span style={{ display: 'inline-block', animation: loading ? 'cl-fadeup 1s linear infinite' : 'none' }}>↻</span>
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────── */}
      <div className="cl-kpi4">
        {[
          { label: 'Uptime', value: uptime != null ? `${uptime}%` : '—', color: uptime != null && uptime >= 80 ? 'var(--cl-up)' : 'var(--cl-down)' },
          { label: 'Total jobs', value: summary?.total ?? (loading ? '…' : 0), color: 'var(--cl-ink)' },
          { label: 'Erros', value: summary?.error ?? (loading ? '…' : 0), color: (summary?.error ?? 0) > 0 ? 'var(--cl-down)' : 'var(--cl-ink3)' },
          { label: 'Latência média', value: avgDuration != null ? fmtDuration(Math.round(avgDuration)) : '—', color: 'var(--cl-ink)' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
            borderRadius: 'var(--cl-radius)', padding: 'var(--cl-card-pad)', boxShadow: 'var(--cl-shadow)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cl-ink3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{k.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: k.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      {/* ── Error state ─────────────────────────────── */}
      {error && (
        <div style={{
          background: 'var(--cl-down-soft)', border: '1px solid var(--cl-down)',
          borderRadius: 'var(--cl-radius)', padding: '16px 20px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cl-down)', marginBottom: 4 }}>✗ {error}</div>
          <div style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>Verifique se o backend está no ar. O Render pode levar até 30s no cold start.</div>
        </div>
      )}

      {/* ── Source cards grid ───────────────────────── */}
      {!error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {grouped.filter(g => g.jobs.length > 0 || SOURCES.find(s => s.key === g.source.key)).map(({ source, jobs: srcJobs }) => {
            const status = worstStatus(srcJobs)
            const cfg    = STATUS_CFG[status]
            return (
              <div key={source.key} style={{
                background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
                borderLeft: `3px solid ${cfg.color}`,
                borderRadius: 'var(--cl-radius)', boxShadow: 'var(--cl-shadow)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '16px 18px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cl-ink)' }}>{source.key}</span>
                      <span style={{ fontSize: 11, color: 'var(--cl-ink3)' }}>{source.label}</span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg,
                      borderRadius: 4, padding: '2px 8px', letterSpacing: '0.06em',
                    }}>{cfg.symbol} {cfg.label}</span>
                  </div>

                  <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: 'var(--cl-ink3)', background: 'var(--cl-bg)', borderRadius: 4, padding: '4px 8px', marginBottom: 10 }}>
                    {source.endpoint}
                  </div>

                  {/* Metrics 2×2 */}
                  {srcJobs.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Jobs', value: String(srcJobs.length) },
                        { label: 'OK', value: String(srcJobs.filter(j => j.status === 'ok').length) },
                        { label: 'Última exec.', value: srcJobs[0]?.started_at ? formatDataHoraBRT(srcJobs[0].started_at).split(' ')[0] : '—' },
                        { label: 'Linhas', value: srcJobs.reduce((s, j) => s + (j.rows_upserted ?? 0), 0).toLocaleString('pt-BR') },
                      ].map(m => (
                        <div key={m.label} style={{ background: 'var(--cl-bg)', borderRadius: 4, padding: '6px 8px', border: '1px solid var(--cl-line2)' }}>
                          <div style={{ fontSize: 9, color: 'var(--cl-ink3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cl-ink)', fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {srcJobs.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--cl-ink3)', padding: '4px 0 8px' }}>Nenhum job mapeado para esta fonte</div>
                  )}
                </div>

                {/* Terminal log */}
                {srcJobs.length > 0 && (
                  <div style={{ padding: '0 14px 14px' }}>
                    <TerminalLog jobs={srcJobs} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Schedule info ──────────────────────────── */}
      <div style={{
        background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
        borderRadius: 'var(--cl-radius)', padding: '14px 20px',
      }}>
        <div className="cl-sched3">
          <div><span style={{ fontWeight: 700, color: 'var(--cl-ink)' }}>RV (B3)</span><span style={{ color: 'var(--cl-ink3)' }}> · 21h UTC via brapi.dev</span></div>
          <div><span style={{ fontWeight: 700, color: 'var(--cl-ink)' }}>Indicadores</span><span style={{ color: 'var(--cl-ink3)' }}> · 22h UTC via BCB-SGS</span></div>
          <div><span style={{ fontWeight: 700, color: 'var(--cl-ink)' }}>Fundos (CVM)</span><span style={{ color: 'var(--cl-ink3)' }}> · 23h UTC · Renda Fixa: manual</span></div>
        </div>
      </div>
    </div>
  )
}
