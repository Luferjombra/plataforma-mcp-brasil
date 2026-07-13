'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { BriefcaseBusiness, Plus, Trash2, RefreshCw, Upload, Download } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getPosicoes, addPosicao, deletePosicao, getAnaliseCarteira, importarPosicoes } from '@/lib/api'
import type { Posicao, AnaliseCarteira, ImportacaoPosicoes } from '@/lib/api'
import {
  fmtBRL, fmtPct, fmtPP, fmtMetrica, getSessionId,
} from '@/lib/carteira'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonShimmer, EmptyState } from '@/components/DataStates'

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

// Mesmo padrão de card do sistema Clarity usado em /indicadores, /rv,
// /fundos, /status -- ver auditoria de design (achado: /carteira era a
// única página fora desse sistema).
const cardStyle: React.CSSProperties = {
  background: 'var(--cl-card)', border: '1px solid var(--cl-line)',
  borderRadius: 'var(--cl-radius)', padding: 'var(--cl-card-pad)',
  boxShadow: 'var(--cl-shadow)',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
  color: 'var(--cl-ink3)', margin: '0 0 14px',
}

const inputStyle: React.CSSProperties = {
  marginTop: 4, width: '100%', padding: '8px 10px', fontSize: 13,
  borderRadius: 'var(--cl-radius-xs)', border: '1px solid var(--cl-line)',
  background: 'var(--cl-bg)', color: 'var(--cl-ink)', outline: 'none',
}

const fieldLabel: React.CSSProperties = { fontSize: 11.5, color: 'var(--cl-ink3)' }

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

  // Importação em lote (Fase 1 do roadmap de carteira multi-corretora)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState<ImportacaoPosicoes | null>(null)
  const [erroImport, setErroImport] = useState<string | null>(null)

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

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setImportando(true); setErroImport(null); setResultadoImport(null)
    try {
      const res = await importarPosicoes(sessionId, arquivo)
      setResultadoImport(res)
      if (res.inseridas > 0) {
        await carregarPosicoes()
        await carregarAnalise()
      }
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : 'Erro ao importar arquivo')
    } finally {
      setImportando(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const baixarModelo = () => {
    const modelo = 'ticker,tipo,quantidade,preco_medio,data_entrada\n'
      + 'PETR4,acao,100,38.50,2024-03-10\n'
      + 'MXRF11,fii,251,10.20,\n'
    const blob = new Blob([modelo], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'modelo_carteira.csv'
    a.click()
    URL.revokeObjectURL(url)
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
    <div>
      <PageHeader
        title="Minha Carteira"
        description="Rastreamento de performance com métricas profissionais"
        action={
          <button
            onClick={() => { carregarPosicoes(); carregarAnalise() }}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 'var(--cl-radius-sm)',
              border: '1px solid var(--cl-line)', background: 'var(--cl-card)',
              color: 'var(--cl-ink)', fontSize: 12, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'cl-spin .8s linear infinite' : 'none' }} />
            Atualizar
          </button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {erro && (
          <div style={{
            padding: '12px 16px', borderRadius: 'var(--cl-radius-sm)',
            border: '1px solid rgba(217,56,56,.3)', background: 'var(--cl-down-soft)',
            color: 'var(--cl-down)', fontSize: 13,
          }}>
            {erro}
          </div>
        )}

        {/* Painel A + B */}
        <div className="cl-carteira-main">

          {/* Painel A — Formulário */}
          <div style={cardStyle}>
            <p style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Adicionar Posição
            </p>

            {erroForm && (
              <p style={{ fontSize: 12, color: 'var(--cl-down)', margin: '0 0 10px' }}>{erroForm}</p>
            )}

            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={fieldLabel}>Ticker</label>
                <input
                  value={form.ticker}
                  onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  placeholder="Ex: PETR4"
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <label style={fieldLabel}>Tipo</label>
                <select
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  style={inputStyle}
                >
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={fieldLabel}>Quantidade</label>
                  <input
                    type="number"
                    value={form.quantidade}
                    onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                    placeholder="100"
                    min="0"
                    step="any"
                    style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Preço médio (R$)</label>
                  <input
                    type="number"
                    value={form.preco_medio}
                    onChange={e => setForm(f => ({ ...f, preco_medio: e.target.value }))}
                    placeholder="38.50"
                    min="0"
                    step="any"
                    style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              <div>
                <label style={fieldLabel}>Data de entrada</label>
                <input
                  type="date"
                  value={form.data_entrada}
                  onChange={e => setForm(f => ({ ...f, data_entrada: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={salvando}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
                  background: 'var(--cl-navy)', color: '#fff', border: 'none',
                  borderRadius: 'var(--cl-radius-sm)',
                  cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1,
                }}
              >
                <Plus size={14} />
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </form>

            {/* Importação em lote (CSV) -- Fase 1 do roadmap de carteira
                multi-corretora: traz o extrato de outro banco/corretora
                (ex: BTG, XP) sem cadastrar posição por posição. */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--cl-line)' }}>
              <p style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Upload size={13} /> Importar de outra corretora
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportar}
                disabled={importando}
                style={{ display: 'none' }}
                id="import-csv-input"
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <label
                  htmlFor="import-csv-input"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '9px', fontSize: 12.5, fontWeight: 600,
                    background: 'var(--cl-card)', color: 'var(--cl-ink)',
                    border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius-sm)',
                    cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.6 : 1,
                  }}
                >
                  <Upload size={13} />
                  {importando ? 'Importando...' : 'Escolher CSV'}
                </label>
                <button
                  type="button"
                  onClick={baixarModelo}
                  title="Baixar modelo CSV"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '9px 12px', background: 'var(--cl-card)', color: 'var(--cl-ink3)',
                    border: '1px solid var(--cl-line)', borderRadius: 'var(--cl-radius-sm)', cursor: 'pointer',
                  }}
                >
                  <Download size={13} />
                </button>
              </div>

              <p style={{ fontSize: 10.5, color: 'var(--cl-ink3)', marginTop: 6 }}>
                Colunas: ticker,tipo,quantidade,preco_medio,data_entrada (tipo: acao/fii/etf; data opcional).
              </p>

              {erroImport && (
                <p style={{ fontSize: 12, color: 'var(--cl-down)', marginTop: 8 }}>{erroImport}</p>
              )}

              {resultadoImport && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <p style={{ color: resultadoImport.inseridas > 0 ? 'var(--cl-up)' : 'var(--cl-ink3)', fontWeight: 600 }}>
                    {resultadoImport.inseridas}/{resultadoImport.total_linhas} posições importadas
                  </p>
                  {resultadoImport.erros.length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, color: 'var(--cl-down)' }}>
                      {resultadoImport.erros.map(er => (
                        <li key={er.linha}>linha {er.linha}: {er.motivo}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Painel B — Tabela de posições */}
          <div style={cardStyle}>
            <p style={sectionLabel}>Posições abertas</p>

            {loading && posicoes.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => <SkeletonShimmer key={i} h={40} />)}
              </div>
            )}

            {!loading && posicoes.length === 0 && (
              <EmptyState msg="Nenhuma posição ainda" hint="Adicione sua primeira posição para começar a rastrear performance." />
            )}

            {posicoes.length > 0 && (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--cl-ink3)', borderBottom: '1px solid var(--cl-line)' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 8, paddingRight: 12 }}>Ticker</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 12, fontVariantNumeric: 'tabular-nums' }}>Qtd</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 12, fontVariantNumeric: 'tabular-nums' }}>PM</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 12, fontVariantNumeric: 'tabular-nums' }}>Atual</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 12, fontVariantNumeric: 'tabular-nums' }}>P&L R$</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8, fontVariantNumeric: 'tabular-nums' }}>P&L %</th>
                        <th style={{ paddingBottom: 8 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {posicoes.map(p => (
                        <tr key={p.id} className="cl-carteira-row" style={{ borderBottom: '1px solid var(--cl-line)' }}>
                          <td style={{ padding: '8px 12px 8px 0' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--cl-ink)' }}>{p.ticker}</span>
                            <span style={{ marginLeft: 6, fontSize: 9, textTransform: 'uppercase', color: 'var(--cl-ink3)' }}>{p.tipo}</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--cl-ink)' }}>
                            {p.quantidade.toLocaleString('pt-BR')}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--cl-ink)' }}>
                            {fmtBRL(p.preco_medio)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--cl-ink)' }}>
                            {p.preco_atual ? fmtBRL(p.preco_atual) : <span style={{ color: 'var(--cl-ink3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: p.pl_valor != null ? (p.pl_valor >= 0 ? 'var(--cl-up)' : 'var(--cl-down)') : 'var(--cl-ink3)' }}>
                            {p.pl_valor !== null ? fmtBRL(p.pl_valor) : '—'}
                          </td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: p.pl_pct != null ? (p.pl_pct >= 0 ? 'var(--cl-up)' : 'var(--cl-down)') : 'var(--cl-ink3)' }}>
                            {p.pl_pct !== null ? fmtPct(p.pl_pct) : '—'}
                          </td>
                          <td style={{ padding: '8px 0 8px 8px' }}>
                            <button
                              className="cl-row-delete"
                              onClick={() => handleDelete(p.id)}
                              title={confirmDelete === p.id ? 'Clique para confirmar remoção' : 'Remover posição'}
                              style={{
                                padding: 4, borderRadius: 6, border: 'none', background: 'transparent',
                                color: confirmDelete === p.id ? 'var(--cl-down)' : 'var(--cl-ink3)',
                                cursor: 'pointer',
                                opacity: confirmDelete === p.id ? 1 : undefined,
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cl-line)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--cl-ink3)' }}>{posicoes.length} posição(ões)</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--cl-ink)' }}>
                    Total: {fmtBRL(valorTotal)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Painel C — Resumo de performance */}
        {analise && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Seletor de período */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--cl-ink3)' }}>Período:</span>
              {PERIODOS.map(p => {
                const ativo = periodo === p.value
                return (
                  <button
                    key={p.value}
                    onClick={() => setPeriodo(p.value)}
                    style={{
                      padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 999,
                      border: ativo ? '1px solid var(--cl-navy)' : '1px solid var(--cl-line)',
                      background: ativo ? 'var(--cl-navy)' : 'var(--cl-card)',
                      color: ativo ? '#fff' : 'var(--cl-ink3)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}
              {loadingAnalise && <RefreshCw size={12} style={{ color: 'var(--cl-ink3)', animation: 'cl-spin .8s linear infinite' }} />}
            </div>

            {/* KPI cards */}
            <div className="cl-kpi4">
              {kpis.map(k => (
                <div key={k.label} style={cardStyle}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--cl-ink3)', margin: 0 }}>
                    {k.label}
                  </p>
                  <p style={{
                    fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '4px 0 0',
                    color: k.num != null ? (k.num >= 0 ? 'var(--cl-up)' : 'var(--cl-down)') : 'var(--cl-ink)',
                  }}>
                    {k.valor}
                  </p>
                </div>
              ))}
            </div>

            {/* Chart */}
            {analise.serie_carteira.length > 1 && (
              <div style={cardStyle}>
                <p style={{ ...sectionLabel, marginBottom: 20 }}>Evolução do valor da carteira</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={analise.serie_carteira} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gradCarteira" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--cl-up)" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="var(--cl-up)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
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
                      stroke="var(--cl-up)"
                      strokeWidth={2}
                      fill="url(#gradCarteira)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Métricas de risco */}
            <div style={cardStyle}>
              <p style={sectionLabel}>Métricas de risco</p>
              <div className="cl-risk5">
                {[
                  { label: 'Sharpe',   valor: fmtMetrica(analise.sharpe),               hint: '> 1 = bom' },
                  { label: 'Sortino',  valor: fmtMetrica(analise.sortino),              hint: '> 1 = bom' },
                  { label: 'Calmar',   valor: fmtMetrica(analise.calmar),               hint: '> 0.5 = bom' },
                  { label: 'Drawdown', valor: analise.drawdown_max !== null ? fmtPct(analise.drawdown_max * 100) : '—', hint: 'queda máx.' },
                  { label: 'Win Rate', valor: analise.win_rate !== null ? fmtPct(analise.win_rate * 100, 1) : '—', hint: 'dias positivos' },
                ].map(m => (
                  <div key={m.label}>
                    <p style={{ fontSize: 10, color: 'var(--cl-ink3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>{m.label}</p>
                    <p style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--cl-ink)', margin: '2px 0' }}>{m.valor}</p>
                    <p style={{ fontSize: 9.5, color: 'var(--cl-ink3)', margin: 0 }}>{m.hint}</p>
                  </div>
                ))}
              </div>
              {analise.posicoes_count > 0 && analise.sharpe === null && (
                <p style={{ fontSize: 10, color: 'var(--cl-ink3)', marginTop: 12 }}>
                  Métricas disponíveis após 22 pregões com dados históricos.
                </p>
              )}
            </div>
          </div>
        )}

        {!loading && posicoes.length === 0 && (
          <div style={{
            padding: 32, borderRadius: 'var(--cl-radius)', border: '1px dashed var(--cl-line)',
            textAlign: 'center',
          }}>
            <BriefcaseBusiness size={28} style={{ color: 'var(--cl-ink3)', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13, color: 'var(--cl-ink3)', margin: 0 }}>
              Adicione posições para ver análise de performance e métricas de risco.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
