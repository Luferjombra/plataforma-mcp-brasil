'use client'

import { useEffect, useState, useCallback } from 'react'
import { BriefcaseBusiness, Plus, Trash2, RefreshCw } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { getPosicoes, addPosicao, deletePosicao, getAnaliseCarteira } from '@/lib/api'
import type { Posicao, AnaliseCarteira } from '@/lib/api'
import {
  fmtBRL, fmtPct, fmtPP, corPL, fmtMetrica, getSessionId,
} from '@/lib/carteira'

type Periodo = 21 | 63 | 252
const PERIODOS: { label: string; value: Periodo }[] = [
  { label: '1M', value: 21 },
  { label: '3M', value: 63 },
  { label: '1A', value: 252 },
]

const TIPOS = [
  { value: 'acao', label: 'Ação' },
  { value: 'fii',  label: 'FII' },
  { value: 'etf',  label: 'ETF' },
]

export default function CarteiraPage() {
  const [sessionId] = useState(() => getSessionId())
  const [posicoes, setPosicoes]     = useState<Posicao[]>([])
  const [analise, setAnalise]       = useState<AnaliseCarteira | null>(null)
  const [valorTotal, setValorTotal] = useState(0)
  const [periodo, setPeriodo]       = useState<Periodo>(252)
  const [loading, setLoading]       = useState(true)
  const [loadingAnalise, setLoadingAnalise] = useState(false)
  const [erro, setErro]             = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    ticker: '', tipo: 'acao', quantidade: '', preco_medio: '', data_entrada: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const carregarPosicoes = useCallback(async () => {
    try {
      setErro(null)
      const res = await getPosicoes(sessionId)
      setPosicoes(res.data)
      setValorTotal(res.valor_total)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar posições')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  const carregarAnalise = useCallback(async () => {
    setLoadingAnalise(true)
    try {
      const res = await getAnaliseCarteira(sessionId, periodo)
      setAnalise(res)
    } catch {
      setAnalise(null)
    } finally {
      setLoadingAnalise(false)
    }
  }, [sessionId, periodo])

  useEffect(() => {
    carregarPosicoes()
  }, [carregarPosicoes])

  useEffect(() => {
    carregarAnalise()
  }, [carregarAnalise])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroForm(null)
    const qtd = parseFloat(form.quantidade)
    const pm  = parseFloat(form.preco_medio)
    if (!form.ticker || isNaN(qtd) || isNaN(pm) || qtd <= 0 || pm <= 0) {
      setErroForm('Preencha ticker, quantidade e preço médio válidos.')
      return
    }
    setSalvando(true)
    try {
      await addPosicao(sessionId, {
        ticker:      form.ticker.toUpperCase().trim(),
        tipo:        form.tipo,
        quantidade:  qtd,
        preco_medio: pm,
        data_entrada: form.data_entrada || undefined,
      })
      setForm({ ticker: '', tipo: 'acao', quantidade: '', preco_medio: '', data_entrada: '' })
      await carregarPosicoes()
      await carregarAnalise()
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Erro ao adicionar posição')
    } finally {
      setSalvando(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    try {
      await deletePosicao(sessionId, id)
      await carregarPosicoes()
      await carregarAnalise()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao remover posição')
    }
  }

  const kpis = analise ? [
    { label: 'P&L Total',      valor: fmtBRL(analise.pl_total),              num: analise.pl_total },
    { label: 'Rentabilidade',  valor: fmtPct(analise.rentabilidade_pct),      num: analise.rentabilidade_pct },
    { label: 'vs CDI',         valor: analise.vs_cdi_pp !== null ? fmtPP(analise.vs_cdi_pp) : '—', num: analise.vs_cdi_pp },
    { label: 'vs IBOV',        valor: analise.vs_ibov_pp !== null ? fmtPP(analise.vs_ibov_pp) : '—', num: analise.vs_ibov_pp },
  ] : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BriefcaseBusiness className="h-6 w-6" /> Minha Carteira
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rastreamento de performance com métricas profissionais
          </p>
        </div>
        <button
          onClick={() => { carregarPosicoes(); carregarAnalise() }}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-accent transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}

      {/* Painel A + B */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Painel A — Formulário */}
        <div className="lg:col-span-1">
          <div className="p-4 rounded-lg border border-border bg-card space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Adicionar Posição
            </p>

            {erroForm && (
              <p className="text-xs text-red-500">{erroForm}</p>
            )}

            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Ticker</label>
                <input
                  value={form.ticker}
                  onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  placeholder="Ex: PETR4"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Quantidade</label>
                  <input
                    type="number"
                    value={form.quantidade}
                    onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                    placeholder="100"
                    min="0"
                    step="any"
                    className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Preço médio (R$)</label>
                  <input
                    type="number"
                    value={form.preco_medio}
                    onChange={e => setForm(f => ({ ...f, preco_medio: e.target.value }))}
                    placeholder="38.50"
                    min="0"
                    step="any"
                    className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Data de entrada</label>
                <input
                  type="date"
                  value={form.data_entrada}
                  onChange={e => setForm(f => ({ ...f, data_entrada: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={salvando}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </form>
          </div>
        </div>

        {/* Painel B — Tabela de posições */}
        <div className="lg:col-span-2">
          <div className="p-4 rounded-lg border border-border bg-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Posições abertas
            </p>

            {loading && posicoes.length === 0 && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 rounded border border-border bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {!loading && posicoes.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                Adicione sua primeira posição para começar a rastrear performance.
              </div>
            )}

            {posicoes.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="text-left pb-2 pr-3">Ticker</th>
                        <th className="text-right pb-2 pr-3 tabular-nums">Qtd</th>
                        <th className="text-right pb-2 pr-3 tabular-nums">PM</th>
                        <th className="text-right pb-2 pr-3 tabular-nums">Atual</th>
                        <th className="text-right pb-2 pr-3 tabular-nums">P&L R$</th>
                        <th className="text-right pb-2 tabular-nums">P&L %</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {posicoes.map(p => (
                        <tr key={p.id} className="group">
                          <td className="py-2 pr-3">
                            <span className="font-mono font-bold text-xs">{p.ticker}</span>
                            <span className="ml-1.5 text-[9px] uppercase text-muted-foreground">{p.tipo}</span>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs">
                            {p.quantidade.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs">
                            {fmtBRL(p.preco_medio)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs">
                            {p.preco_atual ? fmtBRL(p.preco_atual) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`py-2 pr-3 text-right tabular-nums text-xs font-medium ${corPL(p.pl_valor)}`}>
                            {p.pl_valor !== null ? fmtBRL(p.pl_valor) : '—'}
                          </td>
                          <td className={`py-2 text-right tabular-nums text-xs font-medium ${corPL(p.pl_pct)}`}>
                            {p.pl_pct !== null ? fmtPct(p.pl_pct) : '—'}
                          </td>
                          <td className="py-2 pl-2">
                            <button
                              onClick={() => handleDelete(p.id)}
                              title={confirmDelete === p.id ? 'Clique para confirmar remoção' : 'Remover posição'}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 ${
                                confirmDelete === p.id ? 'opacity-100 text-red-500' : 'text-muted-foreground hover:text-red-500'
                              }`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs">
                  <span className="text-muted-foreground">{posicoes.length} posição(ões)</span>
                  <span className="font-semibold tabular-nums">
                    Total: {fmtBRL(valorTotal)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Painel C — Resumo de performance */}
      {analise && (
        <div className="space-y-4">
          {/* Seletor de período */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Período:</span>
            {PERIODOS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={`px-3 py-1 text-xs rounded-full border transition ${
                  periodo === p.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {p.label}
              </button>
            ))}
            {loadingAnalise && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(k => (
              <div key={k.label} className="p-4 rounded-lg border border-border bg-card">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </p>
                <p className={`text-2xl font-bold tabular-nums mt-1 ${corPL(k.num)}`}>
                  {k.valor}
                </p>
              </div>
            ))}
          </div>

          {/* Chart */}
          {analise.serie_carteira.length > 1 && (
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Evolução do valor da carteira
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={analise.serie_carteira} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradCarteira" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="data"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={v => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v) => [typeof v === 'number' ? fmtBRL(v) : '—', 'Carteira']}
                    labelFormatter={l => `Data: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="valor"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradCarteira)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Métricas de risco */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Métricas de risco
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Sharpe',   valor: fmtMetrica(analise.sharpe),               hint: '> 1 = bom' },
                { label: 'Sortino',  valor: fmtMetrica(analise.sortino),              hint: '> 1 = bom' },
                { label: 'Calmar',   valor: fmtMetrica(analise.calmar),               hint: '> 0.5 = bom' },
                { label: 'Drawdown', valor: analise.drawdown_max !== null ? fmtPct(analise.drawdown_max * 100) : '—', hint: 'queda máx.' },
                { label: 'Win Rate', valor: analise.win_rate !== null ? fmtPct(analise.win_rate * 100, 1) : '—', hint: 'dias positivos' },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">{m.valor}</p>
                  <p className="text-[9px] text-muted-foreground">{m.hint}</p>
                </div>
              ))}
            </div>
            {analise.posicoes_count > 0 && analise.sharpe === null && (
              <p className="text-[10px] text-muted-foreground mt-3">
                Métricas disponíveis após 22 pregões com dados históricos.
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && posicoes.length === 0 && (
        <div className="p-6 rounded-lg border border-dashed border-border text-center">
          <BriefcaseBusiness className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Adicione posições para ver análise de performance e métricas de risco.
          </p>
        </div>
      )}
    </div>
  )
}
