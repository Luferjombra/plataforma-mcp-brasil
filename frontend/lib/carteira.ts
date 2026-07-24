// Helpers de formatação e session para o módulo Carteira
// Tipos Posicao e AnaliseCarteira definidos em @/lib/api

export { formatBRL as fmtBRL, formatPctSinal as fmtPct } from '@/lib/format'

export const fmtPP = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`

export const corPL = (v: number | null): string =>
  v === null ? 'text-muted-foreground' : v >= 0 ? 'text-[var(--cl-up)]' : 'text-[var(--cl-down)]'

export const fmtMetrica = (v: number | null, casas = 2): string =>
  v === null ? '—' : v.toFixed(casas)

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = localStorage.getItem('mcp_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('mcp_session_id', id)
  }
  return id
}
