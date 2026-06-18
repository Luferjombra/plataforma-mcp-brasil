// Tipos e helpers do módulo Carteira

export interface Posicao {
  id: string
  session_id: string
  ticker: string
  tipo: 'acao' | 'fii' | 'etf'
  quantidade: number
  preco_medio: number
  data_entrada: string
  preco_atual: number | null
  data_preco: string | null
  pl_valor: number | null
  pl_pct: number | null
  valor_pos: number
}

export interface AnaliseCarteira {
  pl_total: number
  rentabilidade_pct: number
  vs_cdi_pp: number | null
  vs_ibov_pp: number | null
  sharpe: number | null
  sortino: number | null
  calmar: number | null
  drawdown_max: number | null
  win_rate: number | null
  posicoes_count: number
  valor_total: number
  serie_carteira: { data: string; valor: number }[]
}

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
