import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api } from './api'

const SELECTED_FEED_STORAGE_KEY = 'omens.selected-feed-id'

export interface ScoringFeed {
  id: string
  name: string
  icon: string
  isMain: boolean
  minScore: number
  reportIntervalHours: number
  reportAtHour: number
  systemPrompt: string
  promptLastRegenAt: string | null
  lastAutoReportAt?: string | null
  nextReportAt?: number | null
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [error, setError] = useState<string | null>(null)
  const hasData = useRef(false)
  const currentPathRef = useRef(path)
  const requestIdRef = useRef(0)

  const pathChanged = currentPathRef.current !== path
  const visibleData = pathChanged ? null : data
  const visibleError = pathChanged ? null : error
  const visibleLoading = !!path && (loading || pathChanged)

  useEffect(() => {
    if (currentPathRef.current === path) return
    currentPathRef.current = path
    requestIdRef.current += 1
    hasData.current = false
    setData(null)
    setError(null)
    setLoading(!!path)
  }, [path])

  const refetch = useCallback(() => {
    if (!path) {
      requestIdRef.current += 1
      hasData.current = false
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    const requestId = ++requestIdRef.current
    // Only show loading spinner on initial load, not on refetch
    if (!hasData.current) setLoading(true)
    setError(null)
    api<T>(path)
      .then((d) => {
        if (requestId !== requestIdRef.current) return
        setData(d)
        hasData.current = true
      })
      .catch((e) => {
        if (requestId !== requestIdRef.current) return
        setError(e.message)
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [path])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data: visibleData, loading: visibleLoading, error: visibleError, refetch }
}

function readSelectedFeedId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SELECTED_FEED_STORAGE_KEY)
}

export function useScoringFeeds(enabled = true) {
  const { data, loading, error, refetch } = useApi<{ feeds: ScoringFeed[] }>(enabled ? '/ai/feeds' : null)
  const [selectedFeedId, setSelectedFeedIdState] = useState<string | null>(() => readSelectedFeedId())

  useEffect(() => {
    if (!data?.feeds) return
    const saved = readSelectedFeedId()
    const next = data.feeds.find((feed) => feed.id === selectedFeedId)
      || data.feeds.find((feed) => feed.id === saved)
      || data.feeds.find((feed) => feed.isMain)
      || data.feeds[0]
      || null
    if (next && next.id !== selectedFeedId) setSelectedFeedIdState(next.id)
    if (next && typeof window !== 'undefined') window.localStorage.setItem(SELECTED_FEED_STORAGE_KEY, next.id)
  }, [data, selectedFeedId])

  const setSelectedFeedId = useCallback((feedId: string) => {
    setSelectedFeedIdState(feedId)
    if (typeof window !== 'undefined') window.localStorage.setItem(SELECTED_FEED_STORAGE_KEY, feedId)
  }, [])

  const feeds = data?.feeds || []
  const selectedFeed = feeds.find((feed) => feed.id === selectedFeedId) || feeds.find((feed) => feed.isMain) || feeds[0] || null

  return {
    feeds,
    selectedFeed,
    selectedFeedId: selectedFeed?.id || null,
    setSelectedFeedId,
    loading,
    error,
    refetch,
  }
}
