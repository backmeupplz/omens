import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

/** Generic polling hook. Uses refs to avoid stale closures.
 *  start/stop are stable and never change identity. */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  opts: {
    intervalMs: number
    shouldStop?: (data: T) => boolean
    onStop?: (data: T) => void
  },
) {
  const [data, setData] = useState<T | null>(null)
  const [polling, setPolling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fetcherRef = useRef(fetcher)
  const optsRef = useRef(opts)
  fetcherRef.current = fetcher
  optsRef.current = opts

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setPolling(false)
  }, [])

  const tick = useCallback(() => {
    fetcherRef.current()
      .then((d) => {
        setData(d)
        if (optsRef.current.shouldStop?.(d)) {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
          setPolling(false)
          optsRef.current.onStop?.(d)
        }
      })
      .catch(() => {})
  }, [])

  const start = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setPolling(true)
    // Use setTimeout(0) to ensure state update flushes before first tick
    setTimeout(() => {
      tick()
      intervalRef.current = setInterval(tick, optsRef.current.intervalMs)
    }, 0)
  }, [tick])

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return { data, polling, start, stop }
}
