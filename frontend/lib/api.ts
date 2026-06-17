const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export class APIError extends Error {
  constructor(public status: number, public detail: string | null, path: string) {
    super(detail ?? `API error ${status}: ${path}`)
  }
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail: string | null = null
    try { detail = (await res.json())?.detail ?? null } catch { /* corpo não-JSON */ }
    throw new APIError(res.status, detail, path)
  }
  return res.json()
}

// Indicadores
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

// Renda Variavel
export interface Ativo {
  ticker: string
  nome: string
  setor: string
  tipo: string
  market_cap: number | null
  ativo: boolean
  status: string
  preco_atual: number | null
  var_dia_pct: number | null
  data_preco: string | null
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

// Fundos
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
  return fetchAPI<{ cnpj: string; data: HistoricoFundo[] }>(`/fundos/historico/${encodeURIComponent(cnpj)}?limit=${limit}`)
}

// Renda Fixa
export interface TituloRF {
  codigo: string
  nome: string
  nome_display: string
  indexador: string
  tipo_curto: string
  cor: string
  data_vencimento: string | null
  ativo: boolean
  taxa_atual: number | null
  pu_atual: number | null
  data_taxa: string | null
}

export interface HistoricoRF {
  codigo: string
  data: string
  taxa_mercado: number | null
  pu_mercado: number | null
  taxa_compra: number | null
  pu_compra: number | null
}

export function getTitulosRF() {
  return fetchAPI<{ data: TituloRF[]; total: number; data_referencia: string | null }>('/rf/titulos')
}

export function getHistoricoRF(codigo: string, limit = 252) {
  return fetchAPI<{ codigo: string; data: HistoricoRF[] }>(`/rf/historico/${encodeURIComponent(codigo)}?limit=${limit}`)
}

// Copilot
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

// Noticias
export interface Noticia {
  id: number
  titulo: string
  resumo: string | null
  url: string
  fonte: string | null
  categoria: string | null
  tickers_rel: string[] | null
  publicado_em: string | null
  ingerido_em: string | null
}

export function getNoticias(opts?: { categoria?: string; ticker?: string; limit?: number }) {
  const params = new URLSearchParams({ limit: String(opts?.limit ?? 30) })
  if (opts?.categoria) params.set('categoria', opts.categoria)
  if (opts?.ticker) params.set('ticker', opts.ticker)
  return fetchAPI<{ data: Noticia[]; total: number }>(`/noticias?${params}`)
}

// ETL Health
export type EtlStatus = 'ok' | 'stale' | 'error' | 'running' | 'unknown'

export interface EtlJob {
  job: string
  status_raw: string | null
  status: EtlStatus
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null
  rows_upserted: number | null
  error_msg: string | null
}

export interface EtlSummary {
  total: number
  ok: number
  stale: number
  error: number
  running: number
  unknown: number
  checked_at: string
}

export interface EtlHealth {
  jobs: EtlJob[]
  summary: EtlSummary
}

export function getEtlHealth() {
  return fetchAPI<EtlHealth>('/health/etl')
}

// Busca global
export interface SearchResult {
  q: string
  rv: Array<{ ticker: string; nome: string; setor: string; tipo: string }>
  rf: Array<{ codigo: string; nome_display: string; indexador: string; taxa_atual: number | null; data_vencimento: string | null }>
  fundos: Array<{ cnpj: string; nome_fundo: string; gestor: string; tipo_fundo: string }>
  total: number
}

export function searchAtivos(q: string) {
  return fetchAPI<SearchResult>(`/search?q=${encodeURIComponent(q)}&limit=5`)
}
