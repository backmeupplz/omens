import { useEffect, useRef, useState } from 'preact/hooks'

/** Generic polling hook with stable references. No stale closures. */
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
  const pollingRef = useRef(false)
  fetcherRef.current = fetcher
  optsRef.current = opts

  // Stable stop — never changes identity
  const stopRef = useRef(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    pollingRef.current = false
    setPolling(false)
  })

  const tickRef = useRef(() => {
    fetcherRef.current()
      .then((d) => {
        setData(d)
        if (optsRef.current.shouldStop?.(d)) {
          stopRef.current()
          optsRef.current.onStop?.(d)
        }
      })
      .catch(() => {})
  })

  // Stable start — never changes identity
  const startRef = useRef(() => {
    stopRef.current()
    pollingRef.current = true
    setPolling(true)
    tickRef.current() // immediate first fetch
    intervalRef.current = setInterval(() => tickRef.current(), optsRef.current.intervalMs)
  })

  // Cleanup on unmount
  useEffect(() => () => stopRef.current(), [])

  return { data, polling, start: startRef.current, stop: stopRef.current }
}
