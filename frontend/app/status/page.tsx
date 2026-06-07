'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getEtlHealth, type EtlJob, type EtlHealth, type EtlStatus } from '@/lib/api'
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EtlStatus, {
  label: string
  icon: React.ElementType
  cardClass: string
  badgeClass: string
}> = {
  ok:      { label: 'OK',           icon: CheckCircle2,   cardClass: 'border-l-4 border-l-emerald-500', badgeClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  stale:   { label: 'Desatualizado',icon: Clock,          cardClass: 'border-l-4 border-l-amber-500',   badgeClass: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  error:   { label: 'Erro',         icon: XCircle,        cardClass: 'border-l-4 border-l-red-500',     badgeClass: 'bg-red-500/15 text-red-500 border-red-500/30' },
  running: { label: 'Rodando',      icon: RefreshCw,      cardClass: 'border-l-4 border-l-blue-500',    badgeClass: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  unknown: { label: 'Sem dados',    icon: HelpCircle,     cardClass: 'border-l-4 border-l-muted',       badgeClass: 'bg-muted/30 text-muted-foreground border-muted/30' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' BRT'
}

function fmtDuration(secs: number | null): string {
  if (secs == null) return '–'
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function fmtRows(n: number | null): string {
  if (n == null) return '–'
  return n.toLocaleString('pt-BR')
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, variant }: { label: string; value: number; variant?: 'ok' | 'error' | 'warn' }) {
  return (
    <Card className={cn(
      variant === 'ok'    && value > 0 && 'border-emerald-500/40 bg-emerald-500/5',
      variant === 'error' && value > 0 && 'border-red-500/40 bg-red-500/5',
      variant === 'warn'  && value > 0 && 'border-amber-500/40 bg-amber-500/5',
    )}>
      <CardContent className="pt-6 text-center">
        <p className="text-3xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{label}</p>
      </CardContent>
    </Card>
  )
}

function JobCard({ job }: { job: EtlJob }) {
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.unknown
  const Icon = cfg.icon

  return (
    <Card className={cn('transition-all', cfg.cardClass)}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold truncate">{job.job}</span>
              <Badge variant="outline" className={cn('text-xs shrink-0', cfg.badgeClass)}>
                <Icon className={cn('h-3 w-3 mr-1', job.status === 'running' && 'animate-spin')} />
                {cfg.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Início: {fmtDate(job.started_at)}
            </p>
            {job.error_msg && (
              <p className="mt-2 text-xs font-mono bg-destructive/10 text-destructive rounded px-2 py-1 break-words">
                {job.error_msg}
              </p>
            )}
          </div>
          <div className="text-right shrink-0 space-y-1">
            <p className="text-lg font-semibold tabular-nums">{fmtRows(job.rows_upserted)}</p>
            <p className="text-xs text-muted-foreground">linhas</p>
            <p className="text-xs text-muted-foreground">{fmtDuration(job.duration_seconds)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 60 // segundos

export default function StatusPage() {
  const [data, setData] = useState<EtlHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [lastChecked, setLastChecked] = useState<string>('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getEtlHealth()
      setData(res)
      setLastChecked(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
      setCountdown(REFRESH_INTERVAL)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar na API')
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial
  useEffect(() => { carregar() }, [carregar])

  // Auto-refresh countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { carregar(); return REFRESH_INTERVAL }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [carregar])

  const summary = data?.summary
  const jobs = data?.jobs ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Status ETL</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento dos pipelines de dados · auto-refresh em {countdown}s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-muted-foreground">Atualizado: {lastChecked} BRT</span>
          )}
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading && !data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <KpiCard label="Total jobs" value={summary?.total ?? 0} />
            <KpiCard label="✓ OK"       value={summary?.ok ?? 0}    variant="ok" />
            <KpiCard label="⚠ Stale"   value={summary?.stale ?? 0} variant="warn" />
            <KpiCard label="✗ Erro"     value={(summary?.error ?? 0) + (summary?.running ?? 0)} variant="error" />
          </>
        )}
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Verifique se o backend está no ar. O Render pode levar até 30s no cold start.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Jobs */}
      {!error && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Jobs ({jobs.length})
          </h2>

          {loading && !data ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-5 pb-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum job encontrado.</p>
                <p className="text-xs mt-1">
                  Execute a migration <code className="bg-muted px-1 rounded">003_etl_runs.sql</code> no Supabase
                  e rode pelo menos um ETL pelo GitHub Actions.
                </p>
              </CardContent>
            </Card>
          ) : (
            jobs.map(job => <JobCard key={job.job} job={job} />)
          )}
        </div>
      )}

      {/* Footer info */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div><span className="font-medium text-foreground">RV (B3)</span> · 21h UTC via brapi.dev</div>
            <div><span className="font-medium text-foreground">Indicadores</span> · 22h UTC via BCB-SGS</div>
            <div><span className="font-medium text-foreground">Fundos (CVM)</span> · 23h UTC · Renda Fixa: manual</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
