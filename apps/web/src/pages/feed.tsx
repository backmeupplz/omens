import { useCallback, useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { useApi } from '../helpers/hooks'

// === Lightbox ===

function Lightbox({
  items,
  index,
  onClose,
}: {
  items: MediaItem[]
  index: number
  onClose: () => void
}) {
  const [cur, setCur] = useState(index)

  const prev = useCallback(
    () => setCur((c) => (c > 0 ? c - 1 : items.length - 1)),
    [items.length],
  )
  const next = useCallback(
    () => setCur((c) => (c < items.length - 1 ? c + 1 : 0)),
    [items.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  const item = items[cur]

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {items.length > 1 && (
        <button
          type="button"
          class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-zinc-800/80 p-2 text-zinc-200 hover:bg-zinc-700"
          onClick={(e) => { e.stopPropagation(); prev() }}
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {item.type === 'video' ? (
        <video
          src={item.url}
          controls
          autoPlay
          class="max-h-[90vh] max-w-[90vw] rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={`${item.url}?name=large`}
          alt=""
          class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {items.length > 1 && (
        <button
          type="button"
          class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-zinc-800/80 p-2 text-zinc-200 hover:bg-zinc-700"
          onClick={(e) => { e.stopPropagation(); next() }}
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      {items.length > 1 && (
        <span class="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-zinc-400">
          {cur + 1} / {items.length}
        </span>
      )}
    </div>
  )
}

interface MediaItem {
  type: 'photo' | 'video'
  url: string
  thumbnail: string
}

interface QuotedTweet {
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  content: string
  url: string
}

interface Tweet {
  id: string
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  authorBio: string | null
  content: string
  mediaUrls: string | null
  isRetweet: string | null
  quotedTweet: string | null // JSON string of QuotedTweet
  url: string
  likes: number
  retweets: number
  replies: number
  views: number
  publishedAt: string
}

interface FeedResponse {
  data: Tweet[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  const media: MediaItem[] = tweet.mediaUrls ? JSON.parse(tweet.mediaUrls) : []
  const quoted: QuotedTweet | null = tweet.quotedTweet ? JSON.parse(tweet.quotedTweet) : null
  const [lightbox, setLightbox] = useState<number | null>(null)

  return (
    <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-700 transition-colors">
      {lightbox !== null && (
        <Lightbox
          items={media.filter((m) => m.type === 'photo')}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {/* Retweet indicator */}
      {tweet.isRetweet && (
        <div class="flex items-center gap-1.5 text-xs text-zinc-500 mb-2 ml-10">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          @{tweet.isRetweet} reposted
        </div>
      )}

      <div class="flex gap-3">
        {/* Avatar */}
        {tweet.authorAvatar ? (
          <img
            src={tweet.authorAvatar}
            alt=""
            class="w-10 h-10 rounded-full shrink-0 bg-zinc-700"
            loading="lazy"
          />
        ) : (
          <div class="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
            {tweet.authorName.charAt(0).toUpperCase()}
          </div>
        )}

        <div class="min-w-0 flex-1">
          {/* Author line */}
          <div class="flex items-baseline gap-1 mb-0.5 group/author relative">
            <span class="font-semibold text-sm text-zinc-100 truncate">
              {tweet.authorName}
            </span>
            <span class="text-sm text-zinc-500 shrink-0">@{tweet.authorHandle}</span>
            {tweet.authorFollowers > 0 && (
              <span class="text-xs text-zinc-600 shrink-0">
                &middot; {fmt(tweet.authorFollowers)}
              </span>
            )}
            {tweet.publishedAt && (
              <span class="text-sm text-zinc-600 shrink-0">
                &middot; {timeAgo(tweet.publishedAt)}
              </span>
            )}
            {/* Bio tooltip */}
            {tweet.authorBio && (
              <div class="hidden group-hover/author:block absolute left-0 top-full mt-1 z-10 w-72 rounded-lg border border-zinc-700 bg-zinc-800 p-3 shadow-xl">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold text-sm text-zinc-100">{tweet.authorName}</span>
                  {tweet.authorFollowers > 0 && (
                    <span class="text-xs text-zinc-400">{fmt(tweet.authorFollowers)} followers</span>
                  )}
                </div>
                <p class="text-xs text-zinc-400 leading-relaxed">{tweet.authorBio}</p>
              </div>
            )}
          </div>

          {/* Content */}
          <p class="text-[15px] text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {tweet.content}
          </p>

          {/* Media thumbnails */}
          {media.length > 0 && (
            <div class="mt-2 flex gap-1.5 flex-wrap">
              {media.slice(0, 4).map((item, i) =>
                item.type === 'video' ? (
                  <a
                    key={item.thumbnail}
                    href={tweet.url}
                    target="_blank"
                    rel="noopener"
                    class="relative overflow-hidden rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={`${item.thumbnail}?name=small`}
                      alt=""
                      class={`object-cover ${media.length === 1 ? 'h-40 w-72' : 'h-28 w-28'}`}
                      loading="lazy"
                    />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg class="w-8 h-8 text-white/90" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </a>
                ) : (
                  <button
                    key={item.thumbnail}
                    type="button"
                    class="relative overflow-hidden rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setLightbox(i) }}
                  >
                    <img
                      src={`${item.thumbnail}?name=small`}
                      alt=""
                      class={`object-cover ${media.length === 1 ? 'h-40 w-72' : 'h-28 w-28'}`}
                      loading="lazy"
                    />
                  </button>
                ),
              )}
            </div>
          )}

          {/* Quoted tweet */}
          {quoted && (
            <a
              href={quoted.url}
              target="_blank"
              rel="noopener"
              class="mt-2 block rounded-xl border border-zinc-700 p-3 hover:border-zinc-500 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="flex items-center gap-2 mb-1">
                {quoted.authorAvatar && (
                  <img src={quoted.authorAvatar} alt="" class="w-5 h-5 rounded-full" />
                )}
                <span class="text-sm font-semibold text-zinc-200">{quoted.authorName}</span>
                <span class="text-xs text-zinc-500">@{quoted.authorHandle}</span>
              </div>
              <p class="text-sm text-zinc-400 line-clamp-3">{quoted.content}</p>
            </a>
          )}

          {/* Engagement */}
          <div class="flex items-center gap-5 mt-2 text-xs text-zinc-500">
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener"
              class="flex items-center gap-1 hover:text-blue-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {tweet.replies > 0 && fmt(tweet.replies)}
            </a>
            {tweet.retweets > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {fmt(tweet.retweets)}
              </span>
            )}
            {tweet.likes > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {fmt(tweet.likes)}
              </span>
            )}
            {tweet.views > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {fmt(tweet.views)}
              </span>
            )}
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener"
              class="ml-auto flex items-center gap-1 hover:text-zinc-300 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              View on X
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Feed() {
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const path = `/feed?limit=50&page=${page}`
  const { data, loading, error, refetch } = useApi<FeedResponse>(path)

  const refresh = async () => {
    setRefreshing(true)
    try {
      await api('/x/refresh', { method: 'POST' })
      refetch()
    } catch {
      // ignore
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div>
      <div class="mb-6 flex items-center gap-4">
        <h1 class="text-2xl font-bold">Feed</h1>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          class="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        {data?.pagination && (
          <span class="text-sm text-zinc-500">{data.pagination.total} posts</span>
        )}
      </div>

      {loading && <p class="text-zinc-500">Loading...</p>}
      {error && <p class="text-red-400">{error}</p>}

      {data?.data.length === 0 && !loading && (
        <p class="text-zinc-500">No posts yet. Click Refresh to fetch your X feed.</p>
      )}

      <div class="flex flex-col gap-2">
        {data?.data.map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} />
        ))}
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div class="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            class="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            Previous
          </button>
          <span class="text-sm text-zinc-500">
            Page {page} of {data.pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
            disabled={page >= data.pagination.totalPages}
            class="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
