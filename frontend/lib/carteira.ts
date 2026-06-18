// Helpers de formatação e session para o módulo Carteira
// Tipos Posicao e AnaliseCarteira definidos em @/lib/api

export const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtPct = (v: number, casas = 2) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(casas)}%`

export const fmtPP = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`

export const corPL = (v: number | null): string =>
  v === null ? 'text-muted-foreground' : v >= 0 ? 'text-green-500' : 'text-red-500'

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
