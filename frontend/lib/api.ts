const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

// ── Indicadores ──────────────────────────────────────────────
export interface Indicador {
  id: number
  serie: string
  data: string
  valor: number
  unidade: string
  fonte: string
}

export function getIndicadores(serie?: string, limit = 252) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (serie) params.set('serie', serie)
  return fetchAPI<{ data: Indicador[]; total: number }>(`/indicadores?${params}`)
}

// ── Renda Variável ───────────────────────────────────────────
export interface Ativo {
  ticker: string
  nome: string
  setor: string
  tipo: string
  market_cap: number | null
  ativo: boolean
  status: string
}

export interface Historico {
  ticker: string
  data: string
  abertura: number | null
  maxima: number | null
  minima: number | null
  fechamento: number
  fechamento_adj: number | null
  volume: number | null
}

export function getAtivos() {
  return fetchAPI<{ data: Ativo[]; total: number }>('/rv/ativos')
}

export function getHistoricoRV(ticker: string, limit = 252) {
  return fetchAPI<{ ticker: string; data: Historico[] }>(`/rv/historico/${ticker}?limit=${limit}`)
}

// ── Fundos ───────────────────────────────────────────────────
export interface Fundo {
  cnpj: string
  nome: string
  nome_abreviado: string | null
  classe_anbima: string | null
  gestor: string | null
  administrador: string | null
  tipo_fundo: string | null
  data_inicio: string | null
  ativo: boolean
}

export interface HistoricoFundo {
  cnpj: string
  data: string
  valor_cota: number
  patrimonio_liq: number | null
  captacao: number | null
  resgates: number | null
  cotistas: number | null
}

export function getFundos() {
  return fetchAPI<{ data: Fundo[]; total: number }>('/fundos')
}

export function getHistoricoFundo(cnpj: string, limit = 252) {
  return fetchAPI<{ cnpj: string; data: HistoricoFundo[] }>(`/fundos/historico/${cnpj}?limit=${limit}`)
}

// ── Copilot ──────────────────────────────────────────────────
export interface RespostaCopilot {
  resposta: string
  fonte: string
  cached: boolean
}

export async function perguntarCopilot(pergunta: string): Promise<RespostaCopilot> {
  return fetchAPI('/copilot/pergunta', {
    method: 'POST',
    body: JSON.stringify({ pergunta }),
  })
}
