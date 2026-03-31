import { useCallback, useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { useApi } from '../helpers/hooks'
import { AiSection } from './settings'

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
  const [error, setError] = useState<string | null>(null)
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load replies'))
      .finally(() => setLoading(false))
  }, [fetchReplies])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetchReplies(cursor)
      setReplies((prev) => [...prev, ...r.replies])
      setCursor(r.cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more replies')
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
          {error && <p class="text-red-400 text-sm py-8 text-center">{error}</p>}
          {!loading && !error && replies.length === 0 && (
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

// === Shared Media Grid ===

function MediaGrid({
  media,
  linkUrl,
  onPhotoClick,
}: {
  media: MediaItem[]
  linkUrl: string
  onPhotoClick?: (index: number) => void
}) {
  if (media.length === 0) return null
  const single = media.length === 1
  const sizeClass = single ? 'max-h-72 w-full' : 'h-28 w-28'
  const fit = single ? 'object-contain' : 'object-cover'
  return (
    <div class={`mt-2 flex gap-1.5 flex-wrap ${single ? '' : ''}`}>
      {media.slice(0, 4).map((item, i) =>
        item.type === 'video' ? (
          <a
            key={item.thumbnail}
            href={linkUrl}
            target="_blank"
            rel="noopener"
            class="relative overflow-hidden rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`${item.thumbnail}?name=medium`}
              alt=""
              class={`${fit} ${sizeClass}`}
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
            onClick={(e) => { e.stopPropagation(); onPhotoClick?.(i) }}
          >
            <img
              src={`${item.thumbnail}?name=medium`}
              alt=""
              class={`${fit} ${sizeClass}`}
              loading="lazy"
            />
          </button>
        ),
      )}
    </div>
  )
}

const MAX_CHARS = 400

function linkify(text: string): preact.ComponentChildren[] {
  const parts: preact.ComponentChildren[] = []
  const regex = /(https?:\/\/[^\s]+)|(@[\w]{1,15})/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[1]) {
      parts.push(
        <a
          href={match[1]}
          target="_blank"
          rel="noopener"
          class="text-blue-400 hover:underline"
          onClick={(e: Event) => e.stopPropagation()}
        >
          {match[1].replace(/^https?:\/\//, '')}
        </a>,
      )
    } else {
      parts.push(
        <a
          href={`https://x.com/${match[2].slice(1)}`}
          target="_blank"
          rel="noopener"
          class="text-blue-400 hover:underline"
          onClick={(e: Event) => e.stopPropagation()}
        >
          {match[2]}
        </a>,
      )
    }
    lastIndex = match.index + match[0].length
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

function TweetCard({ tweet, nudge, onNudge, score }: {
  tweet: Tweet
  nudge?: 'up' | 'down' | null
  onNudge?: (tweetId: string, direction: 'up' | 'down') => void
  score?: number | null
}) {
  const media: MediaItem[] = tweet.mediaUrls ? JSON.parse(tweet.mediaUrls) : []
  const quoted: QuotedTweet | null = tweet.quotedTweet ? JSON.parse(tweet.quotedTweet) : null
  const cardRaw = tweet.card ? JSON.parse(tweet.card) : null
  const card = cardRaw?.title ? cardRaw : null
  const quotedMedia: MediaItem[] = quoted?.media || []
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [quotedLightbox, setQuotedLightbox] = useState<number | null>(null)
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
      {quotedLightbox !== null && (
        <Lightbox
          items={quotedMedia.filter((m) => m.type === 'photo')}
          index={quotedLightbox}
          onClose={() => setQuotedLightbox(null)}
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
      <MediaGrid media={media} linkUrl={tweet.url} onPhotoClick={setLightbox} />

      {/* Quoted tweet */}
      {quoted && (
        <div
          class="mt-2 rounded-xl border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-colors p-3"
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
          <MediaGrid media={quoted.media || []} linkUrl={quoted.url} onPhotoClick={setQuotedLightbox} />
          {quoted.card && <LinkCard data={quoted.card} />}
        </div>
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
            <span class="ml-auto flex items-center gap-3">
              {onNudge && (
                <span class="flex items-center gap-1">
                  <button
                    type="button"
                    class={`p-0.5 rounded transition-colors ${nudge === 'up' ? 'text-emerald-400' : 'hover:text-emerald-400'}`}
                    onClick={(e) => { e.stopPropagation(); onNudge(tweet.id, 'up') }}
                    title="Show more like this"
                  >
                    <svg class="w-3.5 h-3.5" fill={nudge === 'up' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.037.15.091.529.02 1.076-.207 1.559L12.75 15.5H9.236a2 2 0 01-1.897-1.368l-1.029-3.09A1 1 0 017.262 10H10.5l-1.27-4.574A1 1 0 0110.192 4h.358a1 1 0 01.948.684l1.128 3.316h3.349a2 2 0 011.5.674z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class={`p-0.5 rounded transition-colors ${nudge === 'down' ? 'text-red-400' : 'hover:text-red-400'}`}
                    onClick={(e) => { e.stopPropagation(); onNudge(tweet.id, 'down') }}
                    title="Show less like this"
                  >
                    <svg class="w-3.5 h-3.5" fill={nudge === 'down' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path d="M16.5 9h-2.25M8.476 18.75c-.011-.05-.028-.1-.037-.15-.091-.529-.02-1.076.207-1.559L13.25 8.5h3.514a2 2 0 011.897 1.368l1.029 3.09A1 1 0 0118.738 14H15.5l1.27 4.574A1 1 0 0115.808 20h-.358a1 1 0 01-.948-.684l-1.128-3.316h-3.349a2 2 0 01-1.5-.674z" />
                    </svg>
                  </button>
                </span>
              )}
              {score != null && (
                <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded ${score >= 70 ? 'bg-emerald-900/40 text-emerald-400' : score >= 50 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-zinc-800 text-zinc-500'}`}>
                  {score}
                </span>
              )}
              <a
                href={tweet.url}
                target="_blank"
                rel="noopener"
                class="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View on X
              </a>
            </span>
      </div>
    </div>
  )
}

// === AI Report ===

interface AiReport {
  content: string
  model: string
  tweetCount: number
  createdAt: string
}

function simpleMarkdown(text: string): preact.ComponentChildren[] {
  return text.split('\n').map((line, i) => {
    // Bold
    let processed: preact.ComponentChildren = line.replace(
      /\*\*(.+?)\*\*/g, '\x01$1\x02',
    )
    const parts: preact.ComponentChildren[] = []
    const str = processed as string
    let last = 0
    for (let j = 0; j < str.length; j++) {
      if (str[j] === '\x01') {
        if (j > last) parts.push(str.slice(last, j))
        const end = str.indexOf('\x02', j + 1)
        if (end !== -1) {
          parts.push(<strong key={`${i}-${j}`} class="text-zinc-100">{str.slice(j + 1, end)}</strong>)
          last = end + 1
          j = end
        }
      }
    }
    if (last < str.length) parts.push(str.slice(last))

    // Headers
    if (line.startsWith('### ')) {
      return <h4 key={i} class="text-sm font-bold text-zinc-100 mt-3 mb-1">{parts.length > 0 ? parts : line.slice(4)}</h4>
    }
    if (line.startsWith('## ')) {
      return <h3 key={i} class="text-base font-bold text-zinc-100 mt-4 mb-1">{parts.length > 0 ? parts : line.slice(3)}</h3>
    }
    if (line.startsWith('# ')) {
      return <h2 key={i} class="text-lg font-bold text-zinc-100 mt-4 mb-2">{parts.length > 0 ? parts : line.slice(2)}</h2>
    }
    // List items
    if (line.match(/^[-*]\s/)) {
      return <li key={i} class="text-sm text-zinc-300 ml-4 list-disc">{parts.length > 0 ? parts : line.slice(2)}</li>
    }
    if (line.match(/^\d+\.\s/)) {
      return <li key={i} class="text-sm text-zinc-300 ml-4 list-decimal">{parts.length > 0 ? parts : line.replace(/^\d+\.\s/, '')}</li>
    }
    // Empty line
    if (line.trim() === '') return <br key={i} />
    // Normal paragraph
    return <p key={i} class="text-sm text-zinc-300 leading-relaxed">{parts.length > 0 ? parts : line}</p>
  })
}

// === Nudge Hook ===

function useNudges() {
  const [nudges, setNudges] = useState<Map<string, 'up' | 'down'>>(new Map())
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    api<{ nudges: Array<{ tweetId: string; direction: 'up' | 'down' }> }>('/ai/nudges')
      .then((r) => {
        const map = new Map<string, 'up' | 'down'>()
        for (const n of r.nudges) map.set(n.tweetId, n.direction as 'up' | 'down')
        setNudges(map)
      })
      .catch(() => {})
  }, [])

  const onNudge = useCallback((tweetId: string, direction: 'up' | 'down') => {
    setNudges((prev) => {
      const next = new Map(prev)
      if (next.get(tweetId) === direction) {
        next.delete(tweetId)
        api(`/ai/nudge/${tweetId}`, { method: 'DELETE' }).catch(() => {})
      } else {
        next.set(tweetId, direction)
        api('/ai/nudge', { method: 'POST', body: JSON.stringify({ tweetId, direction }) }).catch(() => {})
      }
      return next
    })
    setFeedback(direction === 'up' ? 'Will show more like this' : 'Will show less like this')
    setTimeout(() => setFeedback(null), 2000)
  }, [])

  return { nudges, onNudge, feedback }
}

// === AI Report with Inline Tweets ===

interface AiReportData {
  content: string
  model: string
  tweetCount: number
  tweetRefs: string[]
  refTweets: Tweet[]
  createdAt: string
}

function processBold(text: string, lineKey: number): preact.ComponentChildren[] {
  const processed = text.replace(/\*\*(.+?)\*\*/g, '\x01$1\x02')
  const parts: preact.ComponentChildren[] = []
  let last = 0
  for (let j = 0; j < processed.length; j++) {
    if (processed[j] === '\x01') {
      if (j > last) parts.push(processed.slice(last, j))
      const end = processed.indexOf('\x02', j + 1)
      if (end !== -1) {
        parts.push(<strong key={`${lineKey}-${j}`} class="text-zinc-100">{processed.slice(j + 1, end)}</strong>)
        last = end + 1
        j = end
      }
    }
  }
  if (last < processed.length) parts.push(processed.slice(last))
  return parts
}

function renderReportContent(
  text: string,
  refTweets: Map<string, Tweet>,
): preact.ComponentChildren[] {
  const lines = text.split('\n')
  const result: preact.ComponentChildren[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Inline tweet embed
    const tweetMatch = line.match(/\[\[tweet:([^\]]+)\]\]/)
    if (tweetMatch) {
      const tweet = refTweets.get(tweetMatch[1])
      if (tweet) {
        result.push(<div key={`t-${i}`} class="my-2"><TweetCard tweet={tweet} /></div>)
      }
      continue
    }

    // Determine line type and strip prefix
    let content: preact.ComponentChildren[]
    if (line.startsWith('### ')) {
      content = processBold(line.slice(4), i)
      result.push(<h4 key={i} class="text-sm font-bold text-zinc-100 mt-3 mb-1">{content}</h4>)
    } else if (line.startsWith('## ')) {
      content = processBold(line.slice(3), i)
      result.push(<h3 key={i} class="text-base font-bold text-zinc-100 mt-4 mb-1">{content}</h3>)
    } else if (line.startsWith('# ')) {
      content = processBold(line.slice(2), i)
      result.push(<h2 key={i} class="text-lg font-bold text-zinc-100 mt-4 mb-2">{content}</h2>)
    } else if (line.match(/^[-*]\s/)) {
      content = processBold(line.slice(2), i)
      result.push(<li key={i} class="text-sm text-zinc-300 ml-4 list-disc">{content}</li>)
    } else if (line.match(/^\d+\.\s/)) {
      content = processBold(line.replace(/^\d+\.\s/, ''), i)
      result.push(<li key={i} class="text-sm text-zinc-300 ml-4 list-decimal">{content}</li>)
    } else if (line.trim() === '') {
      result.push(<br key={i} />)
    } else {
      content = processBold(line, i)
      result.push(<p key={i} class="text-sm text-zinc-300 leading-relaxed">{content}</p>)
    }
  }

  return result
}

function AiReportView() {
  const { data: settings, loading: settingsLoading, refetch: refetchSettings } = useApi<{ configured: boolean }>('/ai/settings')
  const { data, loading, refetch } = useApi<{ report: AiReportData | null }>('/ai/report')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      await api('/ai/report', { method: 'POST' })
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  if (settingsLoading || loading) return <p class="text-zinc-500 py-8 text-center">Loading...</p>
  if (!settings?.configured) return <AiSection onSave={refetchSettings} />

  const report = data?.report
  const refTweetMap = new Map<string, Tweet>()
  if (report?.refTweets) {
    for (const t of report.refTweets) refTweetMap.set(t.id, t)
  }

  return (
    <div>
      {error && <p class="text-red-400 text-sm text-center mb-3">{error}</p>}
      {report ? (
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-zinc-500">
            <span>{report.model} — {report.tweetCount} posts (last 24h)</span>
            <span>{new Date(report.createdAt).toLocaleString()}</span>
          </div>
          <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            {renderReportContent(report.content, refTweetMap)}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            class="rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Regenerate report'}
          </button>
        </div>
      ) : (
        <div class="text-center py-12">
          <p class="text-zinc-400 mb-4">Generate an AI report to surface the most important items from your last 24 hours.</p>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {generating ? 'Generating report...' : 'Generate AI report'}
          </button>
        </div>
      )}
    </div>
  )
}

// === Pagination ===

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div class="mt-6 flex items-center justify-center gap-4">
      <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
        class="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50">Previous</button>
      <span class="text-sm text-zinc-500">Page {page} of {totalPages}</span>
      <button type="button" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
        class="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50">Next</button>
    </div>
  )
}

// === Exported Pages ===

export function AiReportPage() {
  return <AiReportView />
}

export function FilteredFeed() {
  const { nudges, onNudge, feedback } = useNudges()
  const [page, setPage] = useState(1)
  const { data, loading, error, refetch } = useApi<FeedResponse>(`/ai/filtered-feed?limit=50&page=${page}`)
  const [filtering, setFiltering] = useState(false)
  const [filterError, setFilterError] = useState<string | null>(null)

  const runFilter = async () => {
    setFiltering(true)
    setFilterError(null)
    try {
      await api('/ai/filter', { method: 'POST' })
      refetch()
    } catch (e) {
      setFilterError(e instanceof Error ? e.message : 'Failed to filter feed')
    } finally {
      setFiltering(false)
    }
  }

  return (
    <div>
      {feedback && (
        <div class="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-200 shadow-lg">
          {feedback}
        </div>
      )}
      {loading && <p class="text-zinc-500 py-8 text-center">Loading...</p>}
      {filterError && <p class="text-red-400 text-sm text-center mb-2">{filterError}</p>}
      {error && <p class="text-red-400 text-center">{error}</p>}

      <div class="flex items-center justify-between mb-3">
        <span class="text-xs text-zinc-500">Showing posts scored 50+ by AI</span>
        <button
          type="button"
          onClick={runFilter}
          disabled={filtering}
          class="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50"
        >
          {filtering ? 'Filtering...' : 'Re-filter feed'}
        </button>
      </div>

      {data?.data.length === 0 && !loading && (
        <div class="text-center py-12">
          <p class="text-zinc-400 mb-4">No scored posts yet. Run the AI filter to score your feed.</p>
          <button type="button" onClick={runFilter} disabled={filtering}
            class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
            {filtering ? 'Filtering...' : 'Filter my feed'}
          </button>
        </div>
      )}

      <div class="flex flex-col gap-2">
        {data?.data.map((tweet: any) => (
          <TweetCard key={tweet.id} tweet={tweet} nudge={nudges.get(tweet.id) || null} onNudge={onNudge} score={tweet.score} />
        ))}
      </div>
      {data?.pagination && <Pagination page={page} totalPages={data.pagination.totalPages} onPage={setPage} />}
    </div>
  )
}

export function Feed({ onRefreshRef }: { onRefreshRef?: (fn: () => Promise<void>) => void }) {
  const { nudges, onNudge, feedback } = useNudges()
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState<number | null>(null)
  const { data, loading, error, refetch } = useApi<FeedResponse>(`/feed?limit=50&page=${page}`)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    setRefreshCount(null)
    try {
      const res = await api<{ ok: boolean; count: number }>('/x/refresh', { method: 'POST' })
      setRefreshCount(res.count)
      refetch()
      // Also trigger AI filtering in background
      api('/ai/filter', { method: 'POST' }).catch(() => {})
      setTimeout(() => setRefreshCount(null), 4000)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Failed to refresh feed')
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  useEffect(() => {
    onRefreshRef?.(refresh)
  }, [refresh, onRefreshRef])

  return (
    <div>
      {(feedback || refreshCount !== null) && (
        <div class="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-200 shadow-lg">
          {refreshCount !== null ? `+${refreshCount} posts` : feedback}
        </div>
      )}
      {loading && <p class="text-zinc-500 py-8 text-center">Loading...</p>}
      {refreshError && <p class="text-red-400 text-sm text-center mb-2">{refreshError}</p>}
      {error && <p class="text-red-400 text-center">{error}</p>}

      {data?.data.length === 0 && !loading && (
        <p class="text-zinc-500 py-8 text-center">No posts yet.</p>
      )}

      <div class="flex flex-col gap-2">
        {data?.data.map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} nudge={nudges.get(tweet.id) || null} onNudge={onNudge} />
        ))}
      </div>
      {data?.pagination && <Pagination page={page} totalPages={data.pagination.totalPages} onPage={setPage} />}
    </div>
  )
}
