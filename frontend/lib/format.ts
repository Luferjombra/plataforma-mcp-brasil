/* Formatadores compartilhados (pt-BR) */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const BRL_COTA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 6,
})

/** R$ 1.234,56 — preços em geral */
export function formatBRL(v: number | null): string {
  if (v == null) return '—'
  return BRL.format(v)
}

/** R$ 1,234567 — valor de cota de fundo (6 casas) */
export function formatCota(v: number | null): string {
  if (v == null) return '—'
  return BRL_COTA.format(v)
}

/** R$ 1.2B / R$ 340M — valores grandes abreviados; null se < 1M */
export function formatCap(v: number | null): string | null {
  if (v == null) return null
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(0)}M`
  return null
}

/** R$ 1.25B / R$ 340.5M — patrimônio líquido de fundos */
export function formatMilhoes(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`
  return `R$ ${(v / 1e6).toFixed(1)}M`
}

/** 12.34% a.a. — taxas de renda fixa */
export function formatPct(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(2)}% a.a.`
}
