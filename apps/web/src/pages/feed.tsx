import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api, API_BASE } from '../helpers/api'
import { Countdown } from '../helpers/components'
import { fmt, safeParse, timeAgo } from '../helpers/format'
import { useApi } from '../helpers/hooks'
import { renderMarkdownLine } from '../helpers/markdown'
import { AiSection } from './settings'

function videoProxyUrl(url: string): string {
  return `${API_BASE}/media/video?url=${encodeURIComponent(url)}`
}

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
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
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
      {item.type !== 'photo' ? (
        <video
          src={videoProxyUrl(item.url)}
          controls={item.type === 'video'}
          autoPlay
          loop={item.type === 'gif'}
          muted={item.type === 'gif'}
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
  type: 'photo' | 'video' | 'gif'
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
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
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

// === Thread Modal ===

interface ThreadTweet {
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  content: string
  media: MediaItem[] | null
  card: CardData | null
  quotedTweet: {
    authorName: string
    authorHandle: string
    authorAvatar: string | null
    content: string
    media: MediaItem[] | null
    card: CardData | null
    url: string
  } | null
  url: string
  likes: number
  retweets: number
  replies: number
  views: number
  publishedAt: string
}

function ThreadModal({
  tweetId,
  onClose,
}: {
  tweetId: string
  onClose: () => void
}) {
  const [tweets, setTweets] = useState<ThreadTweet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ tweets: ThreadTweet[] }>(`/x/thread/${tweetId}`)
      .then((r) => setTweets(r.tweets))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load thread'))
      .finally(() => setLoading(false))
  }, [tweetId])

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
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div
        class="w-full max-w-lg max-h-[80vh] rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col overflow-hidden mx-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between p-4 pb-2 border-b border-zinc-800">
          <h3 class="font-semibold text-zinc-100">Thread</h3>
          <button
            type="button"
            onClick={onClose}
            class="text-zinc-400 hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div class="overflow-y-auto flex-1 p-4 scrollbar-dark">
          {loading && <p class="text-zinc-500 text-sm py-8 text-center">Loading thread...</p>}
          {error && <p class="text-red-400 text-sm py-8 text-center">{error}</p>}
          {!loading && !error && tweets.length === 0 && (
            <p class="text-zinc-500 text-sm py-8 text-center">No thread found.</p>
          )}
          {tweets.map((t, i) => (
            <ThreadTweetItem key={t.tweetId} tweet={t} isLast={i === tweets.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ThreadTweetItem({ tweet, isLast }: { tweet: ThreadTweet; isLast: boolean }) {
  const media: MediaItem[] = tweet.media || []
  const [lightbox, setLightbox] = useState<number | null>(null)

  return (
    <div class="relative flex gap-3">
      {/* Vertical thread line */}
      <div class="flex flex-col items-center shrink-0">
        {tweet.authorAvatar ? (
          <img src={tweet.authorAvatar} alt="" class="w-8 h-8 rounded-full bg-zinc-700" loading="lazy" />
        ) : (
          <div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400">
            {(tweet.authorName || '?').charAt(0).toUpperCase()}
          </div>
        )}
        {!isLast && <div class="w-0.5 flex-1 bg-zinc-700 mt-1 mb-1" />}
      </div>
      <div class="min-w-0 flex-1 pb-4">
        <div class="flex items-baseline gap-1 flex-wrap mb-0.5">
          <span class="text-sm font-semibold text-zinc-200">{tweet.authorName}</span>
          <span class="text-xs text-zinc-500">@{tweet.authorHandle}</span>
          {tweet.publishedAt && (
            <span class="text-xs text-zinc-600">&middot; {timeAgo(tweet.publishedAt)}</span>
          )}
        </div>
        <TweetContent text={tweet.content} hideUrls={!!tweet.card} />
        {media.length > 0 && (
          <>
            {lightbox !== null && (
              <Lightbox
                items={media.filter((m) => m.type === 'photo')}
                index={lightbox}
                onClose={() => setLightbox(null)}
              />
            )}
            <MediaGrid media={media} onPhotoClick={setLightbox} />
          </>
        )}
        {tweet.quotedTweet && (
          <div class="mt-2 rounded-xl border border-zinc-700 overflow-hidden p-2.5">
            <div class="flex items-center gap-2 mb-1">
              {tweet.quotedTweet.authorAvatar && (
                <img src={tweet.quotedTweet.authorAvatar} alt="" class="w-4 h-4 rounded-full" />
              )}
              <span class="text-xs font-semibold text-zinc-300">{tweet.quotedTweet.authorName}</span>
              <span class="text-xs text-zinc-500">@{tweet.quotedTweet.authorHandle}</span>
            </div>
            <p class="text-xs text-zinc-400 line-clamp-3 break-words">{tweet.quotedTweet.content}</p>
          </div>
        )}
        {tweet.card && <LinkCard data={tweet.card} fallbackUrl={tweet.url} tweetUrl={tweet.url} />}
        <div class="flex items-center gap-3 mt-1.5 text-xs text-zinc-600">
          {tweet.replies > 0 && <span>{fmt(tweet.replies)} replies</span>}
          {tweet.retweets > 0 && <span>{fmt(tweet.retweets)} RTs</span>}
          {tweet.likes > 0 && <span>{fmt(tweet.likes)} likes</span>}
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

export interface Tweet {
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

/** Remove standalone parent tweets when their same-author self-reply is also in the feed */
function dedupThreads(tweets: Tweet[]): Tweet[] {
  const selfReplyParentIds = new Set<string>()
  for (const t of tweets) {
    if (t.replyToTweetId && t.replyToHandle === t.authorHandle) {
      selfReplyParentIds.add(t.replyToTweetId)
    }
  }
  return tweets.filter((t) => !selfReplyParentIds.has(t.tweetId))
}

// === Link Cards ===

interface CardData {
  title: string
  description: string | null
  thumbnail: string | null
  domain: string
  url: string
}

// === Article Modal ===

interface ArticleRichBlock {
  type: 'paragraph' | 'heading' | 'image' | 'tweet' | 'list' | 'blockquote' | 'divider'
  text?: string
  level?: number
  url?: string
  tweetId?: string
  ordered?: boolean
  items?: Array<{ text: string; format?: ArticleRichBlock['format'] }>
  format?: Array<{ start: number; end: number; type: string; href?: string }>
}

interface ArticleData {
  title: string
  coverImage: string | null
  body: string
  richContent: ArticleRichBlock[] | null
  authorName: string
  authorHandle: string
  authorAvatar: string | null
}

function applyFormat(text: string, format?: ArticleRichBlock['format']): preact.ComponentChildren {
  if (!format || format.length === 0) return text

  // Collect all boundary points and the styles active at each segment
  const points = new Set<number>()
  points.add(0)
  points.add(text.length)
  for (const f of format) {
    points.add(Math.max(0, f.start))
    points.add(Math.min(text.length, f.end))
  }
  const sorted = [...points].sort((a, b) => a - b)

  const parts: preact.ComponentChildren[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start >= end) continue
    const segment = text.slice(start, end)

    // Find all formats active over this segment
    const active = format.filter((f) => f.start <= start && f.end >= end)
    const link = active.find((f) => f.type === 'link' && f.href)
    const bold = active.some((f) => f.type === 'bold')
    const italic = active.some((f) => f.type === 'italic')

    let node: preact.ComponentChildren = segment
    if (bold) node = <strong class="font-semibold">{node}</strong>
    if (italic) node = <em>{node}</em>
    if (link) node = <a href={link.href} target="_blank" rel="noopener" class="text-blue-400 hover:underline">{node}</a>

    parts.push(node)
  }
  return <>{parts}</>
}

/** Render embedded tweet using the full TweetCard from the feed */
function EmbeddedTweet({ tweetId }: { tweetId: string }) {
  const [tweet, setTweet] = useState<Tweet | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ tweets: Array<any> }>(`/x/thread/${tweetId}`)
      .then((r) => {
        const t = r.tweets?.[0]
        if (t) {
          setTweet({
            id: t.tweetId, tweetId: t.tweetId,
            authorName: t.authorName, authorHandle: t.authorHandle,
            authorAvatar: t.authorAvatar, authorFollowers: t.authorFollowers || 0,
            authorBio: null, content: t.content,
            mediaUrls: t.media ? JSON.stringify(t.media) : null,
            isRetweet: null, card: t.card ? JSON.stringify(t.card) : null,
            quotedTweet: t.quotedTweet ? JSON.stringify(t.quotedTweet) : null,
            replyToHandle: null, replyToTweetId: null, parentTweet: null,
            url: t.url, likes: t.likes || 0, retweets: t.retweets || 0,
            replies: t.replies || 0, views: 0, publishedAt: t.publishedAt || '',
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tweetId])

  if (loading) return <div class="my-3 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-500 animate-pulse">Loading post...</div>
  if (!tweet) {
    return (
      <a href={`https://x.com/i/status/${tweetId}`} target="_blank" rel="noopener"
        class="my-3 block rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-400 hover:border-zinc-500 transition-colors">
        View post on X
      </a>
    )
  }
  return <div class="my-3"><TweetCard tweet={tweet} /></div>
}

/** Rich-format plain text: URLs become links, _italic_, **bold**, and x.com tweet URLs become embedded tweets */
function articleFormatText(text: string): preact.ComponentChildren[] {
  const parts: preact.ComponentChildren[] = []
  // Match URLs, _italic_, **bold** — in order of priority
  const regex = /(https?:\/\/[^\s]+)|\*\*(.+?)\*\*|_([^_\s][^_]*[^_\s])_/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[1]) {
      // URL
      parts.push(
        <a href={match[1]} target="_blank" rel="noopener" class="text-blue-400 hover:underline break-all">{match[1].replace(/^https?:\/\//, '')}</a>,
      )
    } else if (match[2]) {
      // **bold**
      parts.push(<strong class="font-semibold text-zinc-100">{match[2]}</strong>)
    } else if (match[3]) {
      // _italic_
      parts.push(<em class="italic">{match[3]}</em>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

/** Check if a paragraph is an embedded tweet URL */
function isTweetUrl(text: string): string | null {
  const m = text.trim().match(/^https?:\/\/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/)
  return m ? m[1] : null
}

/** Render plain text body with paragraph splitting, formatting, and embedded tweets */
function ArticleBodyPlainText({ body }: { body: string }) {
  const paragraphs = body.split(/\n\n+/)
  return (
    <div>
      {paragraphs.map((p, i) => {
        const trimmed = p.trim()
        if (!trimmed) return null

        // Detect embedded tweet URLs (standalone x.com/twitter.com status links)
        const tweetId = isTweetUrl(trimmed)
        if (tweetId) {
          return <EmbeddedTweet key={i} tweetId={tweetId} />
        }

        // Detect heading-like lines (all uppercase, short-ish, no period at end)
        const isHeading = trimmed.length < 200 && trimmed === trimmed.toUpperCase() && !trimmed.endsWith('.') && /[A-Z]/.test(trimmed)
        if (isHeading) {
          return <h3 key={i} class="text-lg font-bold text-zinc-100 mt-6 mb-2">{trimmed}</h3>
        }

        // Detect subheading-like lines (Title Case, short, no period)
        const isSubheading = trimmed.length < 150 && !trimmed.endsWith('.') && /^[A-Z]/.test(trimmed) && trimmed.split(/\s+/).length <= 15 && /^[A-Z][^.!?]*[^.!?\s]$/.test(trimmed) && trimmed !== trimmed.toUpperCase() && /[A-Z].*\b[A-Z]/.test(trimmed)
        if (isSubheading) {
          return <h3 key={i} class="text-lg font-semibold text-zinc-100 mt-5 mb-1.5">{articleFormatText(trimmed)}</h3>
        }

        return <p key={i} class="text-[15px] text-zinc-300 leading-relaxed mb-3">{articleFormatText(trimmed)}</p>
      })}
    </div>
  )
}

function ArticleModal({
  tweetId,
  cardData,
  onClose,
}: {
  tweetId: string
  cardData: CardData
  onClose: () => void
}) {
  const [article, setArticle] = useState<ArticleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ article: ArticleData }>(`/x/article/${tweetId}`)
      .then((r) => setArticle(r.article))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load article'))
      .finally(() => setLoading(false))
  }, [tweetId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const renderBlock = (block: ArticleRichBlock, i: number) => {
    switch (block.type) {
      case 'heading':
        return block.level === 1
          ? <h2 key={i} class="text-xl font-bold text-zinc-100 mt-6 mb-2">{applyFormat(block.text || '', block.format)}</h2>
          : block.level === 3
            ? <h4 key={i} class="text-base font-semibold text-zinc-200 mt-4 mb-1">{applyFormat(block.text || '', block.format)}</h4>
            : <h3 key={i} class="text-lg font-semibold text-zinc-100 mt-5 mb-1.5">{applyFormat(block.text || '', block.format)}</h3>
      case 'image':
        return <img key={i} src={block.url} alt="" class="w-full rounded-lg my-4" loading="lazy" />
      case 'blockquote':
        return <blockquote key={i} class="border-l-2 border-zinc-600 pl-4 my-3 text-zinc-400 italic">{applyFormat(block.text || '', block.format)}</blockquote>
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag key={i} class={`${block.ordered ? 'list-decimal' : 'list-disc'} list-inside my-3 space-y-1.5 text-zinc-300`}>
            {block.items?.map((item, j) => <li key={j}>{applyFormat(item.text, item.format)}</li>)}
          </Tag>
        )
      }
      case 'divider':
        return <hr key={i} class="border-zinc-700 my-6" />
      case 'tweet':
        return <EmbeddedTweet key={i} tweetId={block.tweetId!} />
      default:
        return <p key={i} class="text-[15px] text-zinc-300 leading-relaxed mb-3">{applyFormat(block.text || '', block.format)}</p>
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/80 overflow-y-auto py-8 px-3"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div
        class="w-full max-w-2xl rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 class="font-semibold text-zinc-100 text-sm">Article</h3>
          <div class="flex items-center gap-3">
            <a href={cardData.url} target="_blank" rel="noopener"
              class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open on X
            </a>
            <button type="button" onClick={onClose} class="text-zinc-400 hover:text-zinc-200 text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Content */}
        <div class="overflow-y-auto flex-1 scrollbar-dark" style={{ maxHeight: 'calc(90vh - 56px)' }}>
          {loading && <p class="text-zinc-500 text-sm py-12 text-center">Loading article...</p>}
          {error && (
            <div class="py-12 px-4 text-center">
              <p class="text-red-400 text-sm mb-3">{error}</p>
              <a href={cardData.url} target="_blank" rel="noopener" class="text-sm text-blue-400 hover:underline">Open on X instead</a>
            </div>
          )}
          {article && (
            <div>
              {/* Cover image */}
              {(article.coverImage || cardData.thumbnail) && (
                <img src={article.coverImage || cardData.thumbnail!} alt="" class="w-full" loading="lazy" />
              )}
              <div class="px-5 py-5">
                {/* Author */}
                <div class="flex items-center gap-2.5 mb-4">
                  {article.authorAvatar && (
                    <img src={article.authorAvatar} alt="" class="w-8 h-8 rounded-full" />
                  )}
                  <div>
                    <span class="text-sm font-semibold text-zinc-200">{article.authorName}</span>
                    <span class="text-sm text-zinc-500 ml-1.5">@{article.authorHandle}</span>
                  </div>
                </div>

                {/* Title */}
                <h1 class="text-2xl font-bold text-zinc-100 leading-tight mb-4">{article.title}</h1>

                {/* Body */}
                {article.richContent ? (
                  <div>{article.richContent.map(renderBlock)}</div>
                ) : article.body ? (
                  <ArticleBodyPlainText body={article.body} />
                ) : cardData.description ? (
                  <p class="text-[15px] text-zinc-400">{cardData.description}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LinkCard({ data, fallbackUrl, tweetUrl }: { data: CardData; fallbackUrl?: string; tweetUrl?: string }) {
  const url = data.url || fallbackUrl || '#'
  const [showArticle, setShowArticle] = useState(false)

  // Detect X article cards
  const isXArticle = data.domain === 'x.com' || data.domain === 'twitter.com'
  const tweetIdMatch = isXArticle ? (tweetUrl || url).match(/status\/(\d+)/) : null
  const articleTweetId = tweetIdMatch?.[1] || null

  if (isXArticle && articleTweetId) {
    return (
      <>
        {showArticle && (
          <ArticleModal
            tweetId={articleTweetId}
            cardData={data}
            onClose={() => setShowArticle(false)}
          />
        )}
        <button
          type="button"
          class="mt-2 block w-full text-left rounded-xl border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); setShowArticle(true) }}
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
        </button>
      </>
    )
  }

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

function InlineVideo({ item, sizeClass, fit }: { item: MediaItem; sizeClass: string; fit: string }) {
  const isGif = item.type === 'gif'
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (v && isGif) {
      v.muted = true
      v.play().catch(() => {})
    }
  }, [isGif])

  if (playing || isGif) {
    return (
      <div class="relative overflow-hidden rounded-lg border border-zinc-700 bg-black">
        <video
          ref={isGif ? videoRef : undefined}
          src={videoProxyUrl(item.url)}
          poster={`${item.thumbnail}?name=medium`}
          controls={!isGif}
          autoPlay
          loop={isGif}
          muted={isGif}
          playsinline
          class={`${fit} ${sizeClass}`}
          onClick={(e) => e.stopPropagation()}
        />
        {isGif && (
          <span class="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            GIF
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      class="relative overflow-hidden rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
      onClick={(e) => { e.stopPropagation(); setPlaying(true) }}
    >
      <img
        src={`${item.thumbnail}?name=medium`}
        alt=""
        class={`${fit} ${sizeClass}`}
        loading="lazy"
      />
      <div class="absolute inset-0 flex items-center justify-center bg-black/30">
        <svg class="w-10 h-10 text-white/90 drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </button>
  )
}

function MediaGrid({
  media,
  onPhotoClick,
}: {
  media: MediaItem[]
  onPhotoClick?: (index: number) => void
}) {
  if (media.length === 0) return null
  const single = media.length === 1
  const sizeClass = single ? 'max-h-72 w-full' : 'w-full h-32 sm:h-36'
  const fit = single ? 'object-contain' : 'object-cover'
  return (
    <div class={`mt-2 grid gap-1.5 overflow-hidden ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {media.slice(0, 4).map((item, i) =>
        item.type !== 'photo' ? (
          <InlineVideo key={item.thumbnail} item={item} sizeClass={sizeClass} fit={fit} />
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

// === Tweet Detail Modal ===

function TweetDetailModal({
  tweet,
  onClose,
  nudge,
  onNudge,
  score,
  minScore,
}: {
  tweet: Tweet
  onClose: () => void
  nudge?: 'up' | 'down' | null
  onNudge?: (tweetId: string, direction: 'up' | 'down') => void
  score?: number | null
  minScore?: number
}) {
  const [replies, setReplies] = useState<ReplyData[]>([])
  const [repliesLoading, setRepliesLoading] = useState(true)
  const [repliesCursor, setRepliesCursor] = useState<string | null>(null)
  const [repliesError, setRepliesError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // For self-threads with inline parent, fetch replies for the parent (it has the actual discussion)
  const isThread = tweet.replyToHandle === tweet.authorHandle && !!tweet.parentTweet
  const replyTarget = isThread && tweet.parentTweet ? tweet.parentTweet : tweet
  const tweetIdForReplies = replyTarget.url.match(/status\/(\d+)/)?.[1] || replyTarget.tweetId

  const fetchReplies = useCallback(
    (c?: string) => {
      const url = c ? `/x/replies/${tweetIdForReplies}?cursor=${encodeURIComponent(c)}` : `/x/replies/${tweetIdForReplies}`
      return api<{ replies: ReplyData[]; cursor: string | null }>(url)
    },
    [tweetIdForReplies],
  )

  useEffect(() => {
    fetchReplies()
      .then((r) => { setReplies(r.replies); setRepliesCursor(r.cursor) })
      .catch((e) => setRepliesError(e instanceof Error ? e.message : 'Failed to load replies'))
      .finally(() => setRepliesLoading(false))
  }, [fetchReplies])

  const loadMoreReplies = async () => {
    if (!repliesCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetchReplies(repliesCursor)
      setReplies((prev) => [...prev, ...r.replies])
      setRepliesCursor(r.cursor)
    } catch (e) {
      setRepliesError(e instanceof Error ? e.message : 'Failed to load more replies')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/80 overflow-y-auto py-8 px-3"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div class="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <TweetCard tweet={tweet} nudge={nudge} onNudge={onNudge} score={score} minScore={minScore} embedded />

        {/* Replies section */}
        <div class="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <h4 class="text-sm font-semibold text-zinc-300 mb-3">Replies</h4>
          {repliesLoading && <p class="text-zinc-500 text-sm py-4 text-center">Loading replies...</p>}
          {repliesError && <p class="text-red-400 text-sm py-4 text-center">{repliesError}</p>}
          {!repliesLoading && !repliesError && replies.length === 0 && (
            <p class="text-zinc-600 text-sm py-4 text-center">No replies yet.</p>
          )}
          <div class="space-y-3">
            {replies.map((r, i) => (
              <div key={i} class="flex gap-2.5">
                {r.authorAvatar ? (
                  <img src={r.authorAvatar} alt="" class="w-7 h-7 rounded-full shrink-0 bg-zinc-700" />
                ) : (
                  <div class="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                    {(r.authorName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-1 mb-0.5 flex-wrap">
                    <span class="text-sm font-semibold text-zinc-200">{r.authorName}</span>
                    {r.authorHandle && <span class="text-xs text-zinc-500">@{r.authorHandle}</span>}
                    {r.authorFollowers > 0 && <span class="text-xs text-zinc-600">&middot; {fmt(r.authorFollowers)}</span>}
                    {r.likes > 0 && <span class="text-xs text-zinc-600">&middot; {fmt(r.likes)} likes</span>}
                  </div>
                  <p class="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed break-words">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
          {repliesCursor && (
            <button type="button" onClick={loadMoreReplies} disabled={loadingMore}
              class="mt-3 w-full rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50">
              {loadingMore ? 'Loading...' : 'Load more replies'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function TweetCard({ tweet, nudge, onNudge, score, minScore, embedded }: {
  tweet: Tweet
  nudge?: 'up' | 'down' | null
  onNudge?: (tweetId: string, direction: 'up' | 'down') => void
  score?: number | null
  minScore?: number
  embedded?: boolean
}) {
  const media: MediaItem[] = safeParse<MediaItem[]>(tweet.mediaUrls) ?? []
  const quoted = safeParse<QuotedTweet>(tweet.quotedTweet)
  const cardRaw = safeParse<CardData>(tweet.card)
  const card = cardRaw?.title ? cardRaw : null
  const quotedMedia: MediaItem[] = quoted?.media || []
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [quotedLightbox, setQuotedLightbox] = useState<number | null>(null)
  const [parentLightbox, setParentLightbox] = useState<number | null>(null)
  const [showReplies, setShowReplies] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [ogLoaded, setOgLoaded] = useState(false)
  const isThread = tweet.replyToHandle === tweet.authorHandle
  const parentMedia: MediaItem[] = isThread && tweet.parentTweet ? safeParse<MediaItem[]>(tweet.parentTweet.mediaUrls) ?? [] : []
  const parentCardRaw = isThread && tweet.parentTweet ? safeParse<CardData>(tweet.parentTweet.card) : null
  const parentCard = parentCardRaw?.title ? parentCardRaw : null
  const parentQuoted = isThread && tweet.parentTweet ? safeParse<QuotedTweet>(tweet.parentTweet.quotedTweet) : null
  const parentIsThread = tweet.parentTweet ? tweet.parentTweet.replyToHandle === tweet.parentTweet.authorHandle : false
  const showThreadButton = isThread && (!tweet.parentTweet || parentIsThread)
  const onOgLoaded = useCallback(() => setOgLoaded(true), [])

  return (
    <div>
    {!embedded && showDetail && (
      <TweetDetailModal
        tweet={tweet}
        onClose={() => setShowDetail(false)}
        nudge={nudge}
        onNudge={onNudge}
        score={score}
        minScore={minScore}
      />
    )}
    {tweet.parentTweet && !isThread && (
      <div class="rounded-t-xl border border-b-0 border-zinc-800 bg-zinc-950 px-3 sm:px-4 py-2.5 flex items-start gap-2.5 overflow-hidden">
        {tweet.parentTweet.authorAvatar && (
          <img src={tweet.parentTweet.authorAvatar} alt="" class="w-5 h-5 rounded-full mt-0.5 shrink-0" />
        )}
        <div class="min-w-0">
          <span class="text-xs text-zinc-500">
            <span class="font-medium text-zinc-400">{tweet.parentTweet.authorName}</span>
            {' '}@{tweet.parentTweet.authorHandle}
          </span>
          <div class="text-xs text-zinc-500 mt-0.5">
            <TweetContent text={tweet.parentTweet.content} />
          </div>
        </div>
      </div>
    )}
    <div
      class={`${tweet.parentTweet && !isThread ? 'rounded-b-xl rounded-t-none' : 'rounded-xl'} border border-zinc-800 bg-zinc-900 px-3 sm:px-4 py-3 hover:border-zinc-700 transition-colors${embedded ? '' : ' cursor-pointer'}`}
      onClick={embedded ? undefined : () => {
        if (lightbox !== null || quotedLightbox !== null || parentLightbox !== null || showReplies || showThread) return
        setShowDetail(true)
      }}
    >
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
      {showReplies && (() => {
        const replyTarget = isThread && tweet.parentTweet ? tweet.parentTweet : tweet
        return (
          <RepliesModal
            tweetId={replyTarget.url.match(/status\/(\d+)/)?.[1] || replyTarget.tweetId}
            onClose={() => setShowReplies(false)}
          />
        )
      })()}
      {showThread && (
        <ThreadModal
          tweetId={tweet.url.match(/status\/(\d+)/)?.[1] || tweet.tweetId}
          onClose={() => setShowThread(false)}
        />
      )}
      {/* Inline thread parent */}
      {parentLightbox !== null && (
        <Lightbox
          items={parentMedia.filter((m) => m.type === 'photo')}
          index={parentLightbox}
          onClose={() => setParentLightbox(null)}
        />
      )}
      {isThread && tweet.parentTweet && (
        <div class="pb-2 mb-2 border-b border-zinc-800">
          <div class="flex items-center gap-2 mb-1">
            {tweet.parentTweet.authorAvatar ? (
              <img src={tweet.parentTweet.authorAvatar} alt="" class="w-5 h-5 rounded-full bg-zinc-700" loading="lazy" />
            ) : (
              <div class="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                {(tweet.parentTweet.authorName || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <span class="text-sm font-semibold text-zinc-200">{tweet.parentTweet.authorName}</span>
            <span class="text-xs text-zinc-500">@{tweet.parentTweet.authorHandle}</span>
            {tweet.parentTweet.publishedAt && (
              <span class="text-xs text-zinc-600">&middot; {timeAgo(tweet.parentTweet.publishedAt)}</span>
            )}
          </div>
          <TweetContent text={tweet.parentTweet.content} hideUrls={!!parentCard} />
          {parentMedia.length > 0 && <MediaGrid media={parentMedia} onPhotoClick={setParentLightbox} />}
          {parentQuoted && (
            <div class="mt-2 rounded-xl border border-zinc-700 overflow-hidden p-2.5 cursor-default" onClick={(e) => e.stopPropagation()}>
              <div class="flex items-center gap-2 mb-1">
                {parentQuoted.authorAvatar && <img src={parentQuoted.authorAvatar} alt="" class="w-4 h-4 rounded-full" />}
                <span class="text-xs font-semibold text-zinc-300">{parentQuoted.authorName}</span>
                <span class="text-xs text-zinc-500">@{parentQuoted.authorHandle}</span>
              </div>
              <p class="text-xs text-zinc-400 line-clamp-3 break-words">{parentQuoted.content}</p>
            </div>
          )}
          {parentCard ? (
            <LinkCard data={parentCard} fallbackUrl={tweet.parentTweet.url} tweetUrl={tweet.parentTweet.url} />
          ) : (
            parentMedia.length === 0 && !parentQuoted && <OgEmbed text={tweet.parentTweet.content} onLoaded={() => {}} />
          )}
          {/* Parent engagement */}
          <div class="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            <button
              type="button"
              class="flex items-center gap-1 hover:text-blue-400 transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowReplies(true) }}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {tweet.parentTweet.replies > 0 && fmt(tweet.parentTweet.replies)}
            </button>
            {tweet.parentTweet.retweets > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {fmt(tweet.parentTweet.retweets)}
              </span>
            )}
            {tweet.parentTweet.likes > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {fmt(tweet.parentTweet.likes)}
              </span>
            )}
            {tweet.parentTweet.views > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {fmt(tweet.parentTweet.views)}
              </span>
            )}
          </div>
        </div>
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
      <MediaGrid media={media} onPhotoClick={setLightbox} />

      {/* Quoted tweet */}
      {quoted && (
        <div
          class="mt-2 rounded-xl border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-colors p-3 cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center gap-2 mb-1">
            {quoted.authorAvatar && (
              <img src={quoted.authorAvatar} alt="" class="w-5 h-5 rounded-full" />
            )}
            <span class="text-sm font-semibold text-zinc-200">{quoted.authorName}</span>
            <span class="text-xs text-zinc-500">@{quoted.authorHandle}</span>
          </div>
          <div class="text-sm text-zinc-400">
            <TweetContent text={quoted.content} hideUrls={!!quoted.card} />
          </div>
          <MediaGrid media={quoted.media || []} onPhotoClick={setQuotedLightbox} />
          {quoted.card && <LinkCard data={quoted.card} fallbackUrl={quoted.url} tweetUrl={quoted.url} />}
        </div>
      )}

      {/* Link card — from API card data or OG fetch */}
      {card ? (
        <LinkCard data={card} fallbackUrl={tweet.url} tweetUrl={tweet.url} />
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
            {showThreadButton && (
              <button
                type="button"
                class="flex items-center gap-1 hover:text-emerald-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowThread(true) }}
                title="View thread"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 2v20" />
                  <circle cx="12" cy="5.5" r="2.5" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="18.5" r="2.5" fill="currentColor" stroke="none" />
                </svg>
              </button>
            )}
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
  const { data: settings, loading: settingsLoading, refetch: refetchSettings } = useApi<{ configured: boolean; reportIntervalHours?: number; reportAtHour?: number; nextReportAt?: number | null }>('/ai/settings')
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

    fetch(`${API_BASE}/ai/report-stream`, { credentials: 'include', signal: controller.signal })
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
              <span>{new Date(activeReport.createdAt).toLocaleString()} &middot; {activeReport.tweetCount} posts{!viewingReportId && settings?.nextReportAt ? (
                  <Countdown targetMs={settings.nextReportAt} format="hm" prefix=" &middot; next in " />
                ) : null}</span>
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

// === Load More + End of Feed ===

const FEED_LIMIT = 50

function usePaginatedFeed(url: string, resetKey: number) {
  const [allTweets, setAllTweets] = useState<Tweet[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (p: number, reset: boolean) => {
    if (reset) { setLoading(true); setError(null) }
    else setLoadingMore(true)
    try {
      const res = await api<FeedResponse>(`${url}${url.includes('?') ? '&' : '?'}limit=${FEED_LIMIT}&page=${p}`)
      setAllTweets(prev => {
        if (reset) return res.data
        const ids = new Set(prev.map(t => t.id))
        return [...prev, ...res.data.filter(t => !ids.has(t.id))]
      })
      setTotal(res.pagination.total)
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [url])

  useEffect(() => { loadPage(1, true) }, [resetKey, loadPage])

  const remaining = Math.max(0, total - allTweets.length)
  const loadMore = useCallback(() => loadPage(page + 1, false), [loadPage, page])

  return { allTweets, loading, loadingMore, error, remaining, loadMore }
}

function LoadMore({ remaining, loading, onLoad }: { remaining: number; loading: boolean; onLoad: () => void }) {
  if (remaining <= 0) return null
  return (
    <div class="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        class="rounded-lg bg-zinc-800 border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
            Loading...
          </span>
        ) : (
          `Load more (${remaining} remaining)`
        )}
      </button>
    </div>
  )
}

function EndOfFeed() {
  return (
    <div class="mt-10 mb-6 flex flex-col items-center select-none">
      <pre class="text-zinc-700 text-[10px] leading-tight font-mono">{`
        .  *  .  *  .
     *                *
    .    _________    .
    *   /         \\   *
    .  |  () _ ()  |  .
    *  |    (_)    |  *
    .   \\_________/   .
     *                *
        .  *  .  *  .
      `}</pre>
      <p class="text-zinc-600 text-xs mt-2">You've seen all the omens.</p>
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
  const [feedKey, setFeedKey] = useState(0) // bump to re-fetch feed
  const { allTweets, loading, loadingMore, error, remaining, loadMore } = usePaginatedFeed('/ai/filtered-feed', feedKey)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [fetchingPosts, setFetchingPosts] = useState(false)
  const [showScoringDetails, setShowScoringDetails] = useState(false)
  const [newReady, setNewReady] = useState(0)
  const [scoringPolling, setScoringPolling] = useState(false)
  const [scoringData, setScoringData] = useState<ScoringStatus | null>(null)
  const [scoringBaseline, setScoringBaseline] = useState<number | null>(null)
  const [scoringWasActive, setScoringWasActive] = useState(false)

  interface ScoringStatus { total: number; scored: number; pending: number; aboveThreshold: number; active: boolean; batch: number; totalBatches: number; log: string[] }

  // Single effect drives the polling interval based on scoringPolling state
  useEffect(() => {
    if (!scoringPolling) return
    const poll = () => {
      api<ScoringStatus>('/ai/scoring-status').then((st) => {
        setScoringData(st)
        if (st.active) {
          setScoringWasActive(true)
          setScoringBaseline((prev) => prev ?? st.aboveThreshold)
        } else if (st.pending === 0 || scoringWasActive) {
          // Done — stop polling
          setScoringPolling(false)
        }
      }).catch(() => {})
    }
    poll() // immediate
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [scoringPolling, scoringWasActive])

  // When polling stops with wasActive, compute new posts
  useEffect(() => {
    if (!scoringPolling && scoringWasActive && scoringData) {
      const newAbove = scoringBaseline !== null ? scoringData.aboveThreshold - scoringBaseline : 0
      if (newAbove > 0) setNewReady(newAbove)
      setScoringBaseline(null)
      setScoringWasActive(false)
    }
  }, [scoringPolling, scoringWasActive, scoringData, scoringBaseline])

  const scoringActive = scoringPolling
  const st = scoringData
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
          setScoringPolling(true)
        }
      })
      .catch(() => {})
  }, [aiConfigured])

  const refresh = useCallback(async () => {
    setFetchingPosts(true)
    try {
      await api<{ ok: boolean; count: number }>('/x/refresh', { method: 'POST' })
      setScoringPolling(true)
    } catch (e) {
      setFilterError(e instanceof Error ? e.message : 'Failed to refresh')
    } finally {
      setFetchingPosts(false)
    }
  }, [])

  useEffect(() => {
    onRefreshRef?.(refresh)
  }, [refresh, onRefreshRef])

  // Cleanup polling on unmount only
  useEffect(() => () => setScoringPolling(false), [])

  const showNewPosts = () => {
    setNewReady(0)
    setScoringBaseline(null)
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
        // Progress based on batch completion, not total scored ratio
        const pct = scoringTotalBatches > 0 ? ((scoringBatch - 1) / scoringTotalBatches) * 100 : 0
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
                <span class="text-xs text-zinc-400 tabular-nums">{pendingCount} pending</span>
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

      {allTweets.length === 0 && !loading && pendingCount === 0 && (
        <div class="flex flex-col items-center justify-center py-20">
          <svg class="w-10 h-10 text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          {!aiConfigured ? (
            <AiSection onSave={() => window.location.reload()} />
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
        {allTweets.length > 0 && dedupThreads(allTweets).map((tweet: any) => (
          <TweetCard key={tweet.id} tweet={tweet} nudge={nudges.get(tweet.id) || null} onNudge={onNudge} score={tweet.score} minScore={minScore} />
        ))}
      </div>
      <LoadMore remaining={remaining} loading={loadingMore} onLoad={loadMore} />
      {remaining === 0 && allTweets.length > 0 && !loading && <EndOfFeed />}
    </div>
  )
}

export function Feed({ onRefreshRef }: { onRefreshRef?: (fn: () => Promise<void>) => void }) {
  const { nudges, onNudge, feedback } = useNudges()
  const { minScore } = useAiSettings()
  const [feedKey, setFeedKey] = useState(0)
  const { allTweets, loading, loadingMore, error, remaining, loadMore } = usePaginatedFeed('/feed', feedKey)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    setRefreshCount(null)
    try {
      const res = await api<{ ok: boolean; count: number }>('/x/refresh', { method: 'POST' })
      setRefreshCount(res.count)
      setFeedKey((k) => k + 1)
      setTimeout(() => setRefreshCount(null), 4000)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Failed to refresh feed')
    } finally {
      setRefreshing(false)
    }
  }, [])

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

      {allTweets.length === 0 && !loading && (
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
        {allTweets.length > 0 && dedupThreads(allTweets).map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} nudge={nudges.get(tweet.id) || null} onNudge={onNudge} score={(tweet as any).score} minScore={minScore} />
        ))}
      </div>
      <LoadMore remaining={remaining} loading={loadingMore} onLoad={loadMore} />
      {remaining === 0 && allTweets.length > 0 && !loading && <EndOfFeed />}
    </div>
  )
}
