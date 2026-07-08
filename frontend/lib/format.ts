/* Formatadores compartilhados (pt-BR) */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** R$ 1.234,56 — preços em geral */
export function formatBRL(v: number | null): string {
  if (v == null) return '—'
  return BRL.format(v)
}

/** R$ 1,23 — valor de cota de fundo (2 casas) */
export function formatCota(v: number | null): string {
  if (v == null) return '—'
  return BRL.format(v)
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

/** +1.23% / -1.23% — variação com sinal explícito (P&L da carteira,
 * variação de indicador em notícias). Diferente de `formatPct`: sem
 * sufixo "a.a." (nem toda variação é uma taxa anualizada) e sempre com
 * sinal, mesmo positivo. */
export function formatPctSinal(v: number | null, casas = 2): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(casas)}%`
}

/** Juro real anualizado via equação de Fisher: (nominal - inflação) / (1 + inflação/100).
 * NÃO trocar pela aproximação ingênua `nominal - inflação` — já causou um
 * bug de magnitude (chegava a mostrar 1359%) quando a inflação distorcia
 * o resultado da subtração simples. */
export function juroRealFisher(taxaNominal: number, inflacaoAnual: number): number {
  return +((taxaNominal - inflacaoAnual) / (1 + inflacaoAnual / 100)).toFixed(2)
}

/** 08/07 14:30 BRT — timestamp completo (ETL runs etc.), convertido para
 * horário de Brasília explicitamente. NÃO usar para strings "YYYY-MM-DD"
 * sem horário — ver `formatDataBR` para esse caso (evita bug de fuso). */
export function formatDataHoraBRT(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }) + ' BRT'
}

/** 08/07/2026 — reformata uma data "YYYY-MM-DD" (sem horário) via split de
 * string, não `new Date(...)`. `new Date("YYYY-MM-DD")` interpreta a
 * string como meia-noite UTC, que em fusos negativos (Brasil) exibe o dia
 * anterior — usar `formatDataHoraBRT` para timestamps completos, que já
 * fazem essa conversão de fuso corretamente via `timeZone`. */
export function formatDataBR(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
