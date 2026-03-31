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

// === Replies Modal ===

interface ReplyData {
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  content: string
  likes: number
  publishedAt: string
}

function RepliesModal({
  tweetId,
  onClose,
}: {
  tweetId: string
  onClose: () => void
}) {
  const [replies, setReplies] = useState<ReplyData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const fetchReplies = useCallback(
    (c?: string) => {
      const url = c ? `/x/replies/${tweetId}?cursor=${encodeURIComponent(c)}` : `/x/replies/${tweetId}`
      return api<{ replies: ReplyData[]; cursor: string | null }>(url)
    },
    [tweetId],
  )

  useEffect(() => {
    fetchReplies()
      .then((r) => {
        setReplies(r.replies)
        setCursor(r.cursor)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fetchReplies])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetchReplies(cursor)
      setReplies((prev) => [...prev, ...r.replies])
      setCursor(r.cursor)
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        class="w-full max-w-lg max-h-[80vh] rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between p-4 pb-2 border-b border-zinc-800">
          <h3 class="font-semibold text-zinc-100">Replies</h3>
          <button
            type="button"
            onClick={onClose}
            class="text-zinc-400 hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div class="overflow-y-auto flex-1 p-4 scrollbar-dark">
          {loading && <p class="text-zinc-500 text-sm py-8 text-center">Loading replies...</p>}
          {!loading && replies.length === 0 && (
            <p class="text-zinc-500 text-sm py-8 text-center">No replies yet.</p>
          )}
          <div class="space-y-4">
            {replies.map((r, i) => (
              <div key={i} class="flex gap-2.5">
                {r.authorAvatar ? (
                  <img src={r.authorAvatar} alt="" class="w-8 h-8 rounded-full shrink-0 bg-zinc-700" />
                ) : (
                  <div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                    {(r.authorName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-1 mb-0.5 flex-wrap">
                    <span class="text-sm font-semibold text-zinc-200">{r.authorName}</span>
                    {r.authorHandle && (
                      <span class="text-xs text-zinc-500">@{r.authorHandle}</span>
                    )}
                    {r.authorFollowers > 0 && (
                      <span class="text-xs text-zinc-600">&middot; {fmt(r.authorFollowers)}</span>
                    )}
                    {r.likes > 0 && (
                      <span class="text-xs text-zinc-600">&middot; {fmt(r.likes)} likes</span>
                    )}
                  </div>
                  <p class="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              class="mt-4 w-full rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more replies'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface QuotedTweet {
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  content: string
  media: MediaItem[] | null
  card: CardData | null
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
  card: string | null // JSON: {title, description, thumbnail, domain, url}
  quotedTweet: string | null
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

// === Link Cards ===

interface CardData {
  title: string
  description: string | null
  thumbnail: string | null
  domain: string
  url: string
}

function LinkCard({ data }: { data: CardData }) {
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener"
      class="mt-2 block rounded-xl border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {data.thumbnail && (
        <img src={data.thumbnail} alt="" class="w-full rounded-t-xl" loading="lazy" />
      )}
      <div class="p-2.5">
        <p class="text-sm font-medium text-zinc-200 line-clamp-2">{data.title}</p>
        {data.description && (
          <p class="text-xs text-zinc-400 mt-0.5 line-clamp-2">{data.description}</p>
        )}
        <p class="text-xs text-zinc-500 mt-0.5">{data.domain}</p>
      </div>
    </a>
  )
}

function OgEmbed({
  text,
  onLoaded,
}: {
  text: string
  onLoaded: () => void
}) {
  const [card, setCard] = useState<CardData | null>(null)

  useEffect(() => {
    const match = text.match(/https?:\/\/[^\s]+/)
    if (!match) return
    api<CardData | null>(`/og?url=${encodeURIComponent(match[0])}`)
      .then((data) => {
        if (data) {
          setCard(data)
          onLoaded()
        }
      })
      .catch(() => {})
  }, [text, onLoaded])

  if (!card) return null
  return <LinkCard data={card} />
}

const MAX_CHARS = 400

function linkify(text: string): preact.ComponentChildren[] {
  const parts: preact.ComponentChildren[] = []
  const urlRegex = /(https?:\/\/[^\s]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[0]
    parts.push(
      <a
        href={url}
        target="_blank"
        rel="noopener"
        class="text-blue-400 hover:underline"
        onClick={(e: Event) => e.stopPropagation()}
      >
        {url.replace(/^https?:\/\//, '')}
      </a>,
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function TweetContent({ text, hideUrls }: { text: string; hideUrls?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  let cleaned = text
  if (hideUrls) {
    cleaned = cleaned.replace(/\s*https?:\/\/\S+/g, '').trim()
  }
  const needsTruncation = cleaned.length > MAX_CHARS
  const display = needsTruncation && !expanded ? `${cleaned.slice(0, MAX_CHARS)}...` : cleaned

  return (
    <div>
      <p class="text-[15px] text-zinc-200 whitespace-pre-wrap leading-relaxed">
        {linkify(display)}
      </p>
      {needsTruncation && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          class="text-sm text-blue-400 hover:text-blue-300 mt-1"
        >
          {expanded ? 'Show less' : 'Show full post'}
        </button>
      )}
    </div>
  )
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  const media: MediaItem[] = tweet.mediaUrls ? JSON.parse(tweet.mediaUrls) : []
  const quoted: QuotedTweet | null = tweet.quotedTweet ? JSON.parse(tweet.quotedTweet) : null
  const cardRaw = tweet.card ? JSON.parse(tweet.card) : null
  const card = cardRaw?.title ? cardRaw : null
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [showReplies, setShowReplies] = useState(false)
  const [ogLoaded, setOgLoaded] = useState(false)
  const onOgLoaded = useCallback(() => setOgLoaded(true), [])

  return (
    <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-700 transition-colors">
      {lightbox !== null && (
        <Lightbox
          items={media.filter((m) => m.type === 'photo')}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {showReplies && (
        <RepliesModal
          tweetId={tweet.url.match(/status\/(\d+)/)?.[1] || tweet.tweetId}
          onClose={() => setShowReplies(false)}
        />
      )}
      {/* Author row: avatar + repost label + name */}
      <div class={`flex gap-2.5 mb-1 group/author relative ${tweet.isRetweet ? '' : 'items-center'}`}>
        {tweet.authorAvatar ? (
          <img
            src={tweet.authorAvatar}
            alt=""
            class="w-9 h-9 rounded-full shrink-0 bg-zinc-700"
            loading="lazy"
          />
        ) : (
          <div class="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
            {tweet.authorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div class="min-w-0">
          {tweet.isRetweet && (
            <div class="flex items-center gap-1 text-xs text-zinc-500 mb-0.5">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              @{tweet.isRetweet} reposted
            </div>
          )}
          <div class="flex items-baseline gap-1 flex-wrap">
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
          </div>
        </div>
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

      {/* Content — full width, no indent */}
      <TweetContent text={tweet.content} hideUrls={ogLoaded || !!card} />

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
          class="mt-2 block rounded-xl border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {quoted.media && quoted.media.length > 0 && (
            <img
              src={`${quoted.media[0].thumbnail}?name=small`}
              alt=""
              class="w-full max-h-48 object-cover"
              loading="lazy"
            />
          )}
          {!quoted.media?.length && quoted.card?.thumbnail && (
            <img
              src={quoted.card.thumbnail}
              alt=""
              class="w-full max-h-48 object-cover"
              loading="lazy"
            />
          )}
          <div class="p-3">
            <div class="flex items-center gap-2 mb-1">
              {quoted.authorAvatar && (
                <img src={quoted.authorAvatar} alt="" class="w-5 h-5 rounded-full" />
              )}
              <span class="text-sm font-semibold text-zinc-200">{quoted.authorName}</span>
              <span class="text-xs text-zinc-500">@{quoted.authorHandle}</span>
            </div>
            <p class="text-sm text-zinc-400 line-clamp-3">{quoted.content}</p>
            {quoted.card && (
              <div class="mt-1.5 text-xs text-zinc-500">
                {quoted.card.title && <p class="text-zinc-400 font-medium line-clamp-1">{quoted.card.title}</p>}
                {quoted.card.domain && <p>{quoted.card.domain}</p>}
              </div>
            )}
          </div>
        </a>
      )}

      {/* Link card — from API card data or OG fetch */}
      {card ? (
        <LinkCard data={card} />
      ) : (
        !quoted && media.length === 0 && <OgEmbed text={tweet.content} onLoaded={onOgLoaded} />
      )}

      {/* Engagement */}
      <div class="flex items-center gap-5 mt-2 text-xs text-zinc-500">
            <button
              type="button"
              class="flex items-center gap-1 hover:text-blue-400 transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowReplies(true) }}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {tweet.replies > 0 && fmt(tweet.replies)}
            </button>
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
  )
}

export function Feed({ onRefreshRef }: { onRefreshRef?: (fn: () => Promise<void>) => void }) {
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const path = `/feed?limit=50&page=${page}`
  const { data, loading, error, refetch } = useApi<FeedResponse>(path)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await api('/x/refresh', { method: 'POST' })
      refetch()
    } catch {
      // ignore
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  useEffect(() => {
    onRefreshRef?.(refresh)
  }, [refresh, onRefreshRef])

  return (
    <div>
      {loading && <p class="text-zinc-500 py-8 text-center">Loading...</p>}
      {error && <p class="text-red-400">{error}</p>}

      {data?.data.length === 0 && !loading && (
        <p class="text-zinc-500 py-8 text-center">No posts yet.</p>
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
