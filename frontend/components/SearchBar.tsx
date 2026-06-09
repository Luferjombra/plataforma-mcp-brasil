'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, TrendingUp, Landmark, Briefcase, Loader2 } from 'lucide-react'
import { searchAtivos, type SearchResult } from '@/lib/api'

const SETOR_COLORS: Record<string, string> = {
  'Financeiro': '#3b82f6',
  'Petróleo e Gás': '#f97316',
  'Mineração': '#84cc16',
  'Energia': '#eab308',
  'Fundos Imobiliários': '#14b8a6',
}

const INDEXADOR_COLORS: Record<string, string> = {
  SELIC: '#10b981', IPCA: '#3b82f6', IPCAS: '#6366f1',
  PRE: '#f59e0b', PRES: '#f97316', EDUCA: '#8b5cf6', OTHER: '#6b7280',
}

function dot(color: string) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}

export function SearchBar({ placeholder = 'Buscar ativo, título ou fundo...' }: { placeholder?: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); setLoading(false); return }
    setLoading(true)
    try {
      const r = await searchAtivos(q)
      setResults(r)
    } catch {
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults(null); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, doSearch])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const hasResults = results && (results.rv.length + results.rf.length + results.fundos.length) > 0
  const showDropdown = open && query.trim().length > 0

  function navigate(path: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(path)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className={`flex items-center gap-2 h-9 px-3 rounded-lg border transition-colors ${
        open
          ? 'border-primary bg-background ring-1 ring-primary/30'
          : 'border-border bg-muted/40 hover:border-border/80'
      }`}>
        {loading
          ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
          : <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        }
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus() }}>
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {!hasResults && !loading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum resultado para <strong>&ldquo;{query}&rdquo;</strong>
            </div>
          )}

          {results && results.rv.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 py-2 bg-muted/30 border-b border-border/50">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Renda Variável
                </p>
              </div>
              {results.rv.map(a => (
                <button
                  key={a.ticker}
                  onClick={() => navigate(`/rv?ticker=${a.ticker}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {dot(SETOR_COLORS[a.setor] ?? '#6b7280')}
                    <span className="font-semibold text-sm">{a.ticker}</span>
                    <span className="text-xs text-muted-foreground truncate">{a.nome}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 ml-2">
                    {a.tipo === 'FII' ? 'FII' : 'Ação'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {results && results.rf.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 py-2 bg-muted/30 border-b border-border/50">
                <Landmark className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Renda Fixa
                </p>
              </div>
              {results.rf.map(t => (
                <button
                  key={t.codigo}
                  onClick={() => navigate(`/rf?codigo=${encodeURIComponent(t.codigo)}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {dot(INDEXADOR_COLORS[t.indexador] ?? '#6b7280')}
                    <span className="font-semibold text-sm truncate">{t.nome_display}</span>
                  </div>
                  {t.taxa_atual != null && (
                    <span
                      className="text-xs font-bold tabular-nums shrink-0 ml-2"
                      style={{ color: INDEXADOR_COLORS[t.indexador] ?? '#6b7280' }}
                    >
                      {t.taxa_atual.toFixed(2)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {results && results.fundos.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 py-2 bg-muted/30 border-b border-border/50">
                <Briefcase className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Fundos
                </p>
              </div>
              {results.fundos.map(f => (
                <button
                  key={f.cnpj}
                  onClick={() => navigate(`/fundos?cnpj=${f.cnpj}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {dot('#8b5cf6')}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{f.nome_fundo}</p>
                      <p className="text-[10px] text-muted-foreground">{f.gestor}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 ml-2">
                    {f.tipo_fundo}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
