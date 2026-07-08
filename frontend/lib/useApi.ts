'use client'

import { useCallback, useEffect, useEffectEvent, useState } from 'react'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Fetch com loading/error/data + guard contra resposta obsoleta, pro caso
 * comum de "1 fetch (ou Promise.all) disparado por deps, sem debounce nem
 * múltiplos loading states". Páginas com debounce, race guard próprio ou
 * fetches sequenciais dependentes (ex: /rv, /fundos, /rf) não encaixam
 * bem aqui — forçar um hook genérico nelas só realocaria a complexidade,
 * não removeria (ver R1 em backlog_auditoria_fase2.md).
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: React.DependencyList): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const reload = useCallback(() => setReloadTick(t => t + 1), [])

  // useEffectEvent (não useRef) -- sempre lê o `fetcher` mais recente sem
  // precisar declará-lo como dependência do efeito abaixo.
  const onFetch = useEffectEvent(() => fetcher())

  useEffect(() => {
    let cancelado = false
    setLoading(true); setError(null) // eslint-disable-line react-hooks/set-state-in-effect -- mesmo padrão já usado nas páginas que este hook substitui
    onFetch()
      .then(result => { if (!cancelado) setData(result) })
      .catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : 'Erro ao conectar na API') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadTick])

  return { data, loading, error, reload }
}
