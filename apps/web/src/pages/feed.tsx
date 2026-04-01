import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { Countdown } from '../helpers/components'
import { fmt, safeParse, timeAgo } from '../helpers/format'
import { useApi } from '../helpers/hooks'
import { renderMarkdownLine } from '../helpers/markdown'
import { usePolling } from '../helpers/usePolling'
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
        class="w-full max-w-lg max-h-[80vh] rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col overflow-hidden mx-3"
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
                  <p class="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed break-words">{r.content}</p>
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
  replyToHandle: string | null
  replyToTweetId: string | null
  parentTweet: Tweet | null
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

// === Link Cards ===

interface CardData {
  title: string
  description: string | null
  thumbnail: string | null
  domain: string
  url: string
}

function LinkCard({ data, fallbackUrl }: { data: CardData; fallbackUrl?: string }) {
  const url = data.url || fallbackUrl || '#'
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      class="mt-2 block rounded-xl border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {data.thumbnail && (
        <img src={data.thumbnail} alt="" class="w-full max-w-full rounded-t-xl" loading="lazy" />
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
  const sizeClass = single ? 'max-h-72 w-full' : 'w-full h-32 sm:h-36'
  const fit = single ? 'object-contain' : 'object-cover'
  return (
    <div class={`mt-2 grid gap-1.5 overflow-hidden ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
          class="text-blue-400 hover:underline break-all"
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
    <div class="overflow-hidden">
      <p class="text-[15px] text-zinc-200 whitespace-pre-wrap leading-relaxed break-words">
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

function CopyShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      class="flex items-center gap-1 hover:text-zinc-300 transition-colors"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title="Copy share link"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      {copied ? <span class="text-white font-medium">Copied!</span> : 'Share'}
    </button>
  )
}

function TweetCard({ tweet, nudge, onNudge, score, minScore }: {
  tweet: Tweet
  nudge?: 'up' | 'down' | null
  onNudge?: (tweetId: string, direction: 'up' | 'down') => void
  score?: number | null
  minScore?: number
}) {
  const media: MediaItem[] = safeParse<MediaItem[]>(tweet.mediaUrls) ?? []
  const quoted = safeParse<QuotedTweet>(tweet.quotedTweet)
  const cardRaw = safeParse<CardData>(tweet.card)
  const card = cardRaw?.title ? cardRaw : null
  const quotedMedia: MediaItem[] = quoted?.media || []
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [quotedLightbox, setQuotedLightbox] = useState<number | null>(null)
  const [showReplies, setShowReplies] = useState(false)
  const [ogLoaded, setOgLoaded] = useState(false)
  const onOgLoaded = useCallback(() => setOgLoaded(true), [])

  return (
    <div class="overflow-hidden">
    {tweet.parentTweet && (
      <div class="rounded-t-xl border border-b-0 border-zinc-800 bg-zinc-950 px-3 sm:px-4 py-2.5 flex items-start gap-2.5 overflow-hidden">
        {tweet.parentTweet.authorAvatar && (
          <img src={tweet.parentTweet.authorAvatar} alt="" class="w-5 h-5 rounded-full mt-0.5 shrink-0" />
        )}
        <div class="min-w-0">
          <span class="text-xs text-zinc-500">
            <span class="font-medium text-zinc-400">{tweet.parentTweet.authorName}</span>
            {' '}@{tweet.parentTweet.authorHandle}
          </span>
          <p class="text-xs text-zinc-500 line-clamp-2 mt-0.5 break-words">{tweet.parentTweet.content}</p>
        </div>
      </div>
    )}
    <div class={`${tweet.parentTweet ? 'rounded-b-xl rounded-t-none' : 'rounded-xl'} border border-zinc-800 bg-zinc-900 px-3 sm:px-4 py-3 hover:border-zinc-700 transition-colors overflow-hidden`}>
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
          <div class="overflow-hidden">
            <div class="flex items-baseline gap-1 flex-wrap">
              <span class="font-semibold text-sm text-zinc-100 truncate max-w-[70%]">
                {tweet.authorName}
              </span>
              <span class="text-sm text-zinc-500 truncate">@{tweet.authorHandle}</span>
              {tweet.authorFollowers > 0 && (
                <span class="text-xs text-zinc-600 shrink-0">&middot; {fmt(tweet.authorFollowers)}</span>
              )}
              {tweet.publishedAt && (
                <span class="text-sm text-zinc-600 shrink-0">&middot; {timeAgo(tweet.publishedAt)}</span>
              )}
            </div>
          </div>
        </div>
        {/* Bio tooltip */}
        {tweet.authorBio && (
          <div class="hidden sm:group-hover/author:block absolute left-0 top-full mt-1 z-10 w-64 sm:w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-700 bg-zinc-800 p-3 shadow-xl">
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

      {/* Reply context */}
      {tweet.replyToHandle && !tweet.parentTweet && (
        <p class="text-xs text-zinc-500 mb-1">Replying to <span class="text-emerald-500">@{tweet.replyToHandle}</span></p>
      )}

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
          <p class="text-sm text-zinc-400 line-clamp-3 break-words">{quoted.content}</p>
          <MediaGrid media={quoted.media || []} linkUrl={quoted.url} onPhotoClick={setQuotedLightbox} />
          {quoted.card && <LinkCard data={quoted.card} fallbackUrl={quoted.url} />}
        </div>
      )}

      {/* Link card — from API card data or OG fetch */}
      {card ? (
        <LinkCard data={card} fallbackUrl={tweet.url} />
      ) : (
        !quoted && media.length === 0 && <OgEmbed text={tweet.content} onLoaded={onOgLoaded} />
      )}

      {/* Engagement */}
      <div class="flex flex-wrap items-center justify-between gap-y-1 mt-2 text-xs text-zinc-500">
            <span class="flex items-center gap-3">
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
            </span>
            <span class="flex items-center gap-2">
              {onNudge && (
                <span class="flex items-center gap-0.5">
                  <button
                    type="button"
                    class={`p-0.5 rounded transition-colors ${nudge === 'up' ? 'text-emerald-400' : 'hover:text-emerald-400'}`}
                    onClick={(e) => { e.stopPropagation(); onNudge(tweet.id, 'up') }}
                    title="Show more like this"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={nudge === 'up' ? '2.5' : '1.5'}>
                      <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class={`p-0.5 rounded transition-colors ${nudge === 'down' ? 'text-red-400' : 'hover:text-red-400'}`}
                    onClick={(e) => { e.stopPropagation(); onNudge(tweet.id, 'down') }}
                    title="Show less like this"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={nudge === 'down' ? '2.5' : '1.5'}>
                      <path d="M12 5v14m0 0l6-6m-6 6l-6-6" />
                    </svg>
                  </button>
                </span>
              )}
              {score != null && (
                <span class={`text-[10px] font-medium px-1 py-0.5 rounded-sm ${minScore != null && score < minScore ? 'text-red-500' : score >= 70 ? 'text-emerald-500' : score >= 50 ? 'text-yellow-500' : 'text-zinc-600'}`}>
                  {score}
                </span>
              )}
              <CopyShareButton url={`${window.location.origin}/${tweet.authorHandle}/status/${tweet.url.match(/status\/(\d+)/)?.[1] || tweet.tweetId}`} />
              <a
                href={tweet.url}
                target="_blank"
                rel="noopener"
                class="flex items-center gap-1 hover:text-zinc-300 transition-colors whitespace-nowrap"
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
    </div>
  )
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
      const wasSet = next.get(tweetId) === direction
      if (wasSet) {
        next.delete(tweetId)
        api(`/ai/nudge/${tweetId}`, { method: 'DELETE' }).catch(() => {
          // Revert: re-apply the nudge we just removed
          setNudges((p) => { const r = new Map(p); r.set(tweetId, direction); return r })
          setFeedback('Failed to save feedback')
          setTimeout(() => setFeedback(null), 3000)
        })
      } else {
        const prevDirection = next.get(tweetId)
        next.set(tweetId, direction)
        api('/ai/nudge', { method: 'POST', body: JSON.stringify({ tweetId, direction }) }).catch(() => {
          // Revert to previous state
          setNudges((p) => {
            const r = new Map(p)
            if (prevDirection) r.set(tweetId, prevDirection)
            else r.delete(tweetId)
            return r
          })
          setFeedback('Failed to save feedback')
          setTimeout(() => setFeedback(null), 3000)
        })
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
  id: string
  content: string
  model: string
  tweetCount: number
  tweetRefs: string[]
  refTweets: Tweet[]
  createdAt: string
}

function renderReportContent(
  text: string,
  refTweets: Map<string, Tweet>,
): preact.ComponentChildren[] {
  const cleaned = text.replace(/\\([^\\])/g, '$1')
  const result: preact.ComponentChildren[] = []

  for (const [i, line] of cleaned.split('\n').entries()) {
    const tweetMatch = line.match(/\[\[tweet:([^\]]+)\]\]/)
    if (tweetMatch) {
      const tweet = refTweets.get(tweetMatch[1])
      result.push(tweet
        ? <div key={`t-${i}`} class="my-1.5 overflow-hidden max-w-full"><TweetCard tweet={tweet} /></div>
        : <div key={`t-${i}`} class="my-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 italic overflow-hidden">Referenced post is no longer available</div>
      )
      continue
    }
    result.push(renderMarkdownLine(line, i))
  }

  return result
}

function ElapsedTime({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.floor((now - since) / 1000)
  return <span class="text-xs text-zinc-600 tabular-nums">{Math.floor(s / 60)}:{(s % 60).toString().padStart(2, '0')}</span>
}

function AiReportView() {
  const { data: settings, loading: settingsLoading, refetch: refetchSettings } = useApi<{ configured: boolean; reportIntervalHours?: number; reportAtHour?: number }>('/ai/settings')
  const { data, loading, refetch } = useApi<{ report: AiReportData | null }>('/ai/report')
  const { data: pastData } = useApi<{ reports: Array<{ id: string; model: string; tweetCount: number; createdAt: string }> }>('/ai/reports')
  const [generating, setGenerating] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [streamTweets, setStreamTweets] = useState<Map<string, Tweet>>(new Map())
  const [genStatus, setGenStatus] = useState('Generating...')
  const [genStartedAt, setGenStartedAt] = useState(0)
  const [genTweetCount, setGenTweetCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [viewingReportId, setViewingReportId] = useState<string | null>(null)
  const [viewingReport, setViewingReport] = useState<AiReportData | null>(null)
  const [showPastReports, setShowPastReports] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const abortRef = useRef<AbortController | null>(null)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  /** Connect to SSE stream and accumulate content */
  const connectStream = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    fetch('/api/ai/report-stream', { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        let buf = ''
        let completed = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') {
              completed = true
              setGenerating(false)
              setStreamContent('')
              refetchRef.current()
              return
            }
            if (data.startsWith('[ERROR]')) {
              completed = true
              setGenerating(false)
              setStreamContent('')
              setError(data.slice(8))
              return
            }
            try {
              const json = JSON.parse(data)
              if (json.tweets) {
                const map = new Map<string, Tweet>()
                for (const t of json.tweets) map.set(t.id, t)
                setStreamTweets(map)
              }
              if (json.status) setGenStatus(json.status)
              if (json.content) setStreamContent(json.content)
              else if (json.chunk) setStreamContent((prev) => prev + json.chunk)
            } catch {}
          }
        }
        // Stream ended without [DONE] or [ERROR] — connection was cut short
        if (!completed) {
          setGenerating(false)
          setStreamContent('')
          setError('Connection lost during report generation')
        }
      })
      .catch((e) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setGenerating(false)
        setStreamContent('')
        setError(e instanceof Error ? e.message : 'Connection lost during report generation')
      })
  }, [])

  // Check if report is already generating on mount
  useEffect(() => {
    api<{ generating: boolean; tweetCount: number; status: string | null; startedAt: string | null; error: string | null }>('/ai/report-status')
      .then((s) => {
        if (s.error) { setError(s.error); return }
        if (s.generating) {
          setGenerating(true)
          setGenTweetCount(s.tweetCount)
          setGenStatus(s.status || 'Generating...')
          setGenStartedAt(s.startedAt ? new Date(s.startedAt).getTime() : Date.now())
          connectStream()
        }
      })
      .catch(() => {})
    return () => abortRef.current?.abort()
  }, [])

  const generate = async () => {
    setGenerating(true)
    setStreamContent('')
    setStreamTweets(new Map())
    setGenStatus('Starting...')
    setGenStartedAt(Date.now())
    setError(null)
    try {
      await api('/ai/report', { method: 'POST' })
      connectStream()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report')
      setGenerating(false)
    }
  }

  const viewPastReport = async (id: string) => {
    // If selecting the current latest report, just go back to it
    if (data?.report && data.report.id === id) {
      setViewingReportId(null)
      setViewingReport(null)
      setShowPastReports(false)
      return
    }
    try {
      const res = await api<{ report: AiReportData }>(`/ai/report/${id}`)
      setViewingReport(res.report)
      setViewingReportId(id)
      setShowPastReports(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    }
  }

  const backToLatest = () => {
    setViewingReportId(null)
    setViewingReport(null)
  }

  if (settingsLoading || loading) return <p class="text-zinc-500 py-8 text-center">Loading...</p>
  if (!settings?.configured) return <AiSection onSave={refetchSettings} />

  const activeReport = viewingReportId ? viewingReport : data?.report
  const refTweetMap = new Map<string, Tweet>()
  if (activeReport?.refTweets) {
    for (const t of activeReport.refTweets) refTweetMap.set(t.id, t)
  }

  return (
    <div>
      {error && <p class="text-red-400 text-sm text-center mb-3">{error}</p>}

      {generating && (
        <div class="mb-4">
          <div class="flex items-center gap-2 text-sm text-zinc-400 mb-2">
            <svg class="w-4 h-4 animate-spin shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{genStatus}</span>
            {genStartedAt > 0 && <ElapsedTime since={genStartedAt} />}
          </div>
          {streamContent && (
            <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 sm:px-5 py-4 sm:py-5 overflow-hidden">
              {renderReportContent(streamContent, streamTweets)}
            </div>
          )}
        </div>
      )}

      {activeReport && (
        <div>

      {/* Past reports dropdown with pagination */}
      {showPastReports && pastData && (() => {
        const PAGE_SIZE = 5
        const reports = pastData.reports
        const totalPages = Math.ceil(reports.length / PAGE_SIZE)
        const visible = reports.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE)
        return (
          <div class="mb-3 rounded-lg border border-zinc-800 bg-zinc-900">
            <div class="divide-y divide-zinc-800">
              {visible.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => viewPastReport(r.id)}
                  class={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors ${viewingReportId === r.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'}`}
                >
                  <div class="flex items-center justify-between">
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                    <span class="text-xs text-zinc-600">{r.tweetCount} posts</span>
                  </div>
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div class="flex items-center justify-center gap-3 px-3 py-2 border-t border-zinc-800">
                <button type="button" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage <= 1}
                  class="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30">Prev</button>
                <span class="text-xs text-zinc-600">{historyPage}/{totalPages}</span>
                <button type="button" onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))} disabled={historyPage >= totalPages}
                  class="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30">Next</button>
              </div>
            )}
          </div>
        )
      })()}
          <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 sm:px-5 py-4 sm:py-5 overflow-hidden">
            <div class="flex items-center justify-between gap-2 mb-3 text-xs text-zinc-500">
              <span>{new Date(activeReport.createdAt).toLocaleString()} &middot; {activeReport.tweetCount} posts{!viewingReportId && settings?.reportIntervalHours && settings.reportIntervalHours > 0 ? (() => {
                  let nextMs: number
                  if (settings.reportIntervalHours >= 24 && settings.reportAtHour != null) {
                    const now = new Date()
                    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), settings.reportAtHour))
                    nextMs = today.getTime() <= Date.now() ? today.getTime() + 86_400_000 : today.getTime()
                  } else {
                    nextMs = new Date(activeReport.createdAt).getTime() + settings.reportIntervalHours * 3_600_000
                  }
                  return <Countdown targetMs={nextMs} format="hm" prefix=" &middot; next in " />
                })() : null}</span>
              <span class="flex items-center gap-1.5 shrink-0">
                <CopyShareButton url={`${window.location.origin}/report/${viewingReportId || activeReport.id}`} />
                {pastData && pastData.reports.length > 1 && (
                  <button type="button" onClick={() => setShowPastReports(!showPastReports)}
                    class={`hover:text-zinc-300 ${showPastReports ? 'text-zinc-300' : ''}`}
                    title="Report history">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
                {viewingReportId && (
                  <button type="button" onClick={backToLatest} class="hover:text-zinc-300" title="Back to latest">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating}
                  class="hover:text-zinc-300 disabled:opacity-50"
                  title={generating ? 'Generating...' : 'Generate new report'}
                >
                  <svg class={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </span>
            </div>
            {renderReportContent(activeReport.content, refTweetMap)}
          </div>
        </div>
      )}

      {!activeReport && !generating && (
        <div class="flex flex-col items-center justify-center py-24">
          <svg class="w-12 h-12 text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <p class="text-zinc-400 mb-4">Generate an AI report from your last 24 hours of posts</p>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            Generate report
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
    <div class="mt-6 flex items-center justify-center gap-2 sm:gap-4">
      <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
        class="rounded bg-zinc-800 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm hover:bg-zinc-700 disabled:opacity-50 whitespace-nowrap">Previous</button>
      <span class="text-xs sm:text-sm text-zinc-500 whitespace-nowrap">Page {page} of {totalPages}</span>
      <button type="button" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
        class="rounded bg-zinc-800 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm hover:bg-zinc-700 disabled:opacity-50 whitespace-nowrap">Next</button>
    </div>
  )
}

// === Exported Pages ===

export function AiReportPage() {
  return <AiReportView />
}

function useAiSettings(): { minScore: number; configured: boolean } {
  const { data } = useApi<{ configured: boolean; minScore?: number }>('/ai/settings')
  return { minScore: data?.minScore ?? 50, configured: data?.configured ?? false }
}

export function FilteredFeed({ onRefreshRef }: { onRefreshRef?: (fn: () => Promise<void>) => void }) {
  const { nudges, onNudge, feedback } = useNudges()
  const { minScore, configured: aiConfigured } = useAiSettings()
  const [page, setPage] = useState(1)
  const [feedKey, setFeedKey] = useState(0) // bump to re-fetch feed
  const { data, loading, error } = useApi<FeedResponse>(`/ai/filtered-feed?limit=50&page=${page}&_=${feedKey}`)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [fetchingPosts, setFetchingPosts] = useState(false)
  const [showScoringDetails, setShowScoringDetails] = useState(false)
  const [newReady, setNewReady] = useState(0)
  const baselineRef = useRef<number | null>(null)
  const jobSizeRef = useRef<number>(0)

  interface ScoringStatus { total: number; scored: number; pending: number; aboveThreshold: number; active: boolean; batch: number; totalBatches: number; log: string[] }

  const scoring = usePolling<ScoringStatus>(
    () => api<ScoringStatus>('/ai/scoring-status'),
    {
      intervalMs: 2000,
      shouldStop: (st) => {
        // Stop when scoring was active (jobSize captured) and is now done
        if (st.active && jobSizeRef.current === 0) jobSizeRef.current = st.pending
        if (st.active && baselineRef.current === null) baselineRef.current = st.aboveThreshold
        return !st.active && jobSizeRef.current > 0
      },
      onStop: (st) => {
        const newAbove = baselineRef.current !== null ? st.aboveThreshold - baselineRef.current : 0
        if (newAbove > 0) setNewReady(newAbove)
        jobSizeRef.current = 0
        baselineRef.current = null
      },
    },
  )

  const st = scoring.data
  const scoringActive = scoring.polling
  const pendingCount = st?.pending ?? 0
  const scoringBatch = st?.batch ?? 0
  const scoringTotalBatches = st?.totalBatches ?? 0
  const scoringDetails = st ? { total: st.total, scored: st.scored, pending: st.pending, aboveThreshold: st.aboveThreshold } : null
  const scoringLog = st?.log ?? []

  // Check initial scoring status on mount
  useEffect(() => {
    if (!aiConfigured) return
    api<ScoringStatus>('/ai/scoring-status')
      .then((s) => {
        if (s.active || s.pending > 0) {
          if (s.pending > 0 && !s.active) api('/ai/filter', { method: 'POST' }).catch(() => {})
          scoring.start()
        }
      })
      .catch(() => {})
    return scoring.stop
  }, [aiConfigured])

  const refresh = useCallback(async () => {
    setFetchingPosts(true)
    try {
      const res = await api<{ ok: boolean; count: number }>('/x/refresh', { method: 'POST' })
      if (res.count === 0) return
      scoring.start()
    } catch (e) {
      setFilterError(e instanceof Error ? e.message : 'Failed to refresh')
    } finally {
      setFetchingPosts(false)
    }
  }, [])

  useEffect(() => {
    onRefreshRef?.(refresh)
    return scoring.stop
  }, [refresh, onRefreshRef])

  const showNewPosts = () => {
    setNewReady(0)
    baselineRef.current = null
    setPage(1)
    setFeedKey((k) => k + 1)
  }

  return (
    <div>
      {feedback && (
        <div class="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-200 shadow-lg">
          {feedback}
        </div>
      )}

      {/* Scoring progress */}
      {scoringActive && (() => {
        const jobSize = jobSizeRef.current || pendingCount
        const done = Math.max(0, jobSize - pendingCount)
        const pct = jobSize > 0 ? (done / jobSize) * 100 : 0
        return (
          <div class="mb-3 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3">
            <div class="flex items-center justify-between text-sm mb-2">
              <div class="flex items-center gap-2 text-zinc-300">
                <svg class="w-4 h-4 animate-spin shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                {scoringTotalBatches > 0
                  ? `Scoring batch ${scoringBatch} of ${scoringTotalBatches}`
                  : 'Scoring posts...'}
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-zinc-400 tabular-nums">{done} / {jobSize} new posts</span>
                <button
                  type="button"
                  class="text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={() => setShowScoringDetails((v) => !v)}
                >
                  {showScoringDetails ? 'Hide' : 'Details'}
                </button>
              </div>
            </div>
            <div class="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {showScoringDetails && scoringDetails && (
              <>
                <div class="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span class="text-zinc-500">Total posts</span>
                  <span class="text-zinc-300 text-right tabular-nums">{scoringDetails.total}</span>
                  <span class="text-zinc-500">Scored</span>
                  <span class="text-zinc-300 text-right tabular-nums">{scoringDetails.scored}</span>
                  <span class="text-zinc-500">Pending</span>
                  <span class="text-zinc-300 text-right tabular-nums">{scoringDetails.pending}</span>
                  <span class="text-zinc-500">Above threshold</span>
                  <span class="text-emerald-400 text-right tabular-nums">{scoringDetails.aboveThreshold}</span>
                  {scoringTotalBatches > 0 && (
                    <>
                      <span class="text-zinc-500">Current batch</span>
                      <span class="text-zinc-300 text-right tabular-nums">{scoringBatch} / {scoringTotalBatches}</span>
                    </>
                  )}
                </div>
                {scoringLog.length > 0 && (
                  <div class="mt-2 pt-2 border-t border-zinc-800 space-y-0.5 max-h-32 overflow-y-auto scrollbar-dark">
                    {scoringLog.map((entry, i) => (
                      <p key={i} class="text-[11px] text-zinc-500 font-mono break-all">{entry}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

      {/* New posts pill — fixed below navbar */}
      {newReady > 0 && (
        <div class="fixed top-14 left-0 right-0 z-40 flex justify-center pt-2 pointer-events-none">
          <button
            type="button"
            onClick={showNewPosts}
            class="rounded-full bg-emerald-600 px-4 py-1.5 text-xs text-white font-medium hover:bg-emerald-500 transition-colors shadow-lg pointer-events-auto"
          >
            Show {newReady} new post{newReady !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {loading && <p class="text-zinc-500 py-8 text-center">Loading...</p>}
      {filterError && <p class="text-red-400 text-sm text-center mb-2">{filterError}</p>}
      {error && <p class="text-red-400 text-center">{error}</p>}

      {data?.data.length === 0 && !loading && pendingCount === 0 && (
        <div class="flex flex-col items-center justify-center py-20">
          <svg class="w-10 h-10 text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          {!aiConfigured ? (
            <>
              <p class="text-zinc-400 mb-4">Set up an AI provider to filter your feed</p>
              <a href="/settings" class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
                Go to Settings
              </a>
            </>
          ) : (
            <>
              <p class="text-zinc-400 mb-4">No posts to show yet. Fetch your feed first.</p>
              <button type="button" onClick={refresh} disabled={fetchingPosts}
                class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
                {fetchingPosts ? 'Fetching...' : 'Fetch posts'}
              </button>
            </>
          )}
        </div>
      )}

      <div class="flex flex-col gap-2">
        {data?.data.map((tweet: any) => (
          <TweetCard key={tweet.id} tweet={tweet} nudge={nudges.get(tweet.id) || null} onNudge={onNudge} score={tweet.score} minScore={minScore} />
        ))}
      </div>
      {data?.pagination && <Pagination page={page} totalPages={data.pagination.totalPages} onPage={setPage} />}
    </div>
  )
}

export function Feed({ onRefreshRef }: { onRefreshRef?: (fn: () => Promise<void>) => void }) {
  const { nudges, onNudge, feedback } = useNudges()
  const { minScore } = useAiSettings()
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
          {refreshCount !== null ? (refreshCount > 0 ? `+${refreshCount} posts` : 'Nothing new') : feedback}
        </div>
      )}
      {loading && <p class="text-zinc-500 py-8 text-center">Loading...</p>}
      {refreshError && <p class="text-red-400 text-sm text-center mb-2">{refreshError}</p>}
      {error && <p class="text-red-400 text-center">{error}</p>}

      {data?.data.length === 0 && !loading && (
        <div class="flex flex-col items-center justify-center py-20">
          <svg class="w-10 h-10 text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
          </svg>
          <p class="text-zinc-400 mb-4">No posts yet. Fetch your X feed to get started.</p>
          <button type="button" onClick={refresh} disabled={refreshing}
            class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
            {refreshing ? 'Fetching...' : 'Fetch posts'}
          </button>
        </div>
      )}

      <div class="flex flex-col gap-2">
        {data?.data.map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} nudge={nudges.get(tweet.id) || null} onNudge={onNudge} score={(tweet as any).score} minScore={minScore} />
        ))}
      </div>
      {data?.pagination && <Pagination page={page} totalPages={data.pagination.totalPages} onPage={setPage} />}
    </div>
  )
}
