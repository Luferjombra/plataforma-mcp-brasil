'use client'

import { useEffect, useState, useMemo } from 'react'
import { getNoticias, type Noticia } from '@/lib/api'
import { Newspaper, ExternalLink, RefreshCw, Filter } from 'lucide-react'

type Categoria = 'Todos' | 'Macro' | 'Renda Variável' | 'Renda Fixa' | 'Fundos'

const CATEGORIAS: { label: Categoria; cor: string }[] = [
  { label: 'Todos',          cor: 'bg-muted text-muted-foreground' },
  { label: 'Macro',          cor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { label: 'Renda Variável', cor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  { label: 'Renda Fixa',     cor: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  { label: 'Fundos',         cor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
]

function corCategoria(cat: string | null): string {
  return CATEGORIAS.find(c => c.label === cat)?.cor ?? CATEGORIAS[0].cor
}

function tempoRelativo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `há ${diffD}d`
  return d.toLocaleDateString('pt-BR')
}

export default function NoticiasPage() {
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Categoria>('Todos')
  const [ultimaAtt, setUltimaAtt] = useState<Date | null>(null)

  const carregar = async () => {
    try {
      setErro(null)
      const res = await getNoticias({ limit: 50 })
      setNoticias(res.data)
      setUltimaAtt(new Date())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar notícias')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 5 * 60_000) // refresh a cada 5min
    return () => clearInterval(id)
  }, [])

  const filtradas = useMemo(() => {
    if (filtro === 'Todos') return noticias
    return noticias.filter(n => n.categoria === filtro)
  }, [noticias, filtro])

  const contagemPorCat = useMemo(() => {
    const map: Record<string, number> = { Todos: noticias.length }
    for (const n of noticias) {
      if (n.categoria) map[n.categoria] = (map[n.categoria] ?? 0) + 1
    }
    return map
  }, [noticias])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="h-6 w-6" /> Notícias do Mercado
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Feed agregado de fontes financeiras brasileiras
            {ultimaAtt && (
              <> · atualizado há {Math.floor((Date.now() - ultimaAtt.getTime()) / 60000)}min</>
            )}
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-accent transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {CATEGORIAS.map(c => {
          const ativo = filtro === c.label
          const count = contagemPorCat[c.label] ?? 0
          return (
            <button
              key={c.label}
              onClick={() => setFiltro(c.label)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                ativo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {c.label} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Estado */}
      {erro && (
        <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}
      {loading && noticias.length === 0 && (
        <div className="grid gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}
      {!loading && filtradas.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          Nenhuma notícia encontrada nesta categoria.
        </div>
      )}

      {/* Lista */}
      <div className="grid gap-3">
        {filtradas.map(n => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group p-4 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {n.categoria && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${corCategoria(n.categoria)}`}>
                      {n.categoria}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{n.fonte}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{tempoRelativo(n.publicado_em)}</span>
                  {n.tickers_rel && n.tickers_rel.length > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <div className="flex gap-1">
                        {n.tickers_rel.slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] font-mono font-bold text-primary border border-primary/30 px-1.5 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">
                  {n.titulo}
                </h3>
                {n.resumo && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                    {n.resumo}
                  </p>
                )}
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
