import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api } from './api'

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasData = useRef(false)

  const refetch = useCallback(() => {
    // Only show loading spinner on initial load, not on refetch
    if (!hasData.current) setLoading(true)
    setError(null)
    api<T>(path)
      .then((d) => { setData(d); hasData.current = true })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
