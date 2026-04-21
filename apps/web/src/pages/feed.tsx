import { createPortal } from 'preact/compat'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter-preact'
import { api, API_BASE } from '../helpers/api'
import { FeedTabs } from '../helpers/components'
import { FeedLeadArticle, NewspaperFeedShell } from '../helpers/feed-shell'
import { decodeEntities, fmt, safeParse, timeAgo } from '../helpers/format'
import { useApi, useScoringFeeds } from '../helpers/hooks'
import { NewspaperRouteControls, NewspaperShell, useNewspaperActive } from '../helpers/newspaper-shell'
import { SetupStateBlock } from '../helpers/setup-state'
import { Spinner } from '../helpers/spinner'
import { AiSection } from './settings'

function videoProxyUrl(url: string): string {
  return `${API_BASE}/video?url=${encodeURIComponent(url)}`
}

function imgProxy(url: string): string
function imgProxy(url: string | null): string | undefined
function imgProxy(url: string | null): string | undefined {
  if (!url) return undefined
  if (url.includes('pbs.twimg.com')) return `${API_BASE}/avatar?url=${encodeURIComponent(url)}`
  return url
}

function lightboxImageUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'pbs.twimg.com') {
      parsed.searchParams.set('name', 'large')
      return imgProxy(parsed.toString()) || parsed.toString()
    }
    return imgProxy(url) || url
  } catch {
    return imgProxy(url) || url
  }
}

function mediaThumbnailUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'pbs.twimg.com') {
      parsed.searchParams.set('name', 'medium')
      return imgProxy(parsed.toString()) || parsed.toString()
    }
    return imgProxy(url) || url
  } catch {
    return imgProxy(url) || url
  }
}

function withFeedId(path: string, feedId?: string | null) {
  if (!feedId) return path
  return `${path}${path.includes('?') ? '&' : '?'}feedId=${encodeURIComponent(feedId)}`
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
  const [loaded, setLoaded] = useState(false)

  const prev = useCallback(
    () => { setLoaded(false); setCur((c) => (c > 0 ? c - 1 : items.length - 1)) },
    [items.length],
  )
  const next = useCallback(
    () => { setLoaded(false); setCur((c) => (c < items.length - 1 ? c + 1 : 0)) },
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

  const lightbox = (
    <div
      class="np-overlay fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      {items.length > 1 && (
        <button
          type="button"
          class="np-lightbox-nav absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2"
          onClick={(e) => { e.stopPropagation(); prev() }}
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {!loaded && (
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg class="np-lightbox-spinner w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
      {item.type !== 'photo' ? (
        <video
          src={videoProxyUrl(item.url)}
          controls={item.type === 'video'}
          autoPlay
          loop={item.type === 'gif'}
          muted={item.type === 'gif'}
          class={`max-h-[90vh] max-w-[90vw] rounded-lg transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
          onLoadedData={() => setLoaded(true)}
        />
      ) : (
        <img
          src={lightboxImageUrl(item.url)}
          alt=""
          class={`max-h-[90vh] max-w-[90vw] rounded-lg object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
          onLoad={() => setLoaded(true)}
        />
      )}
      {items.length > 1 && (
        <button
          type="button"
          class="np-lightbox-nav absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2"
          onClick={(e) => { e.stopPropagation(); next() }}
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      {items.length > 1 && (
        <span class="np-lightbox-counter absolute bottom-4 left-1/2 -translate-x-1/2 text-sm">
          {cur + 1} / {items.length}
        </span>
      )}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(lightbox, document.body) : lightbox
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

  const modal = (
    <div
      class="np-overlay fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div
        class="np-overlay-panel mx-3 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="np-overlay-header flex items-center justify-between p-4 pb-2">
          <h3 class="np-overlay-title">Replies</h3>
          <button
            type="button"
            onClick={onClose}
            class="np-overlay-close text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div class="overflow-y-auto flex-1 p-4 scrollbar-dark">
          {loading && <Spinner />}
          {error && <p class="np-alert np-alert-error py-3 text-center">{error}</p>}
          {!loading && !error && replies.length === 0 && (
            <p class="np-overlay-empty py-8 text-sm">No replies yet.</p>
          )}
          <div class="space-y-4">
            {replies.map((r, i) => (
              <div key={i} class="flex gap-2.5">
                {r.authorAvatar ? (
                  <img src={imgProxy(r.authorAvatar)} alt="" class="w-8 h-8 rounded-full shrink-0" />
                ) : (
                  <div class="np-avatar-fallback flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {(r.authorName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-1 mb-0.5 flex-wrap">
                    <span class="np-copy-strong text-sm font-semibold">{r.authorName}</span>
                    {r.authorHandle && (
                      <span class="np-copy-muted text-xs">@{r.authorHandle}</span>
                    )}
                    {r.authorFollowers > 0 && (
                      <span class="np-copy-muted text-xs">&middot; {fmt(r.authorFollowers)}</span>
                    )}
                    {r.likes > 0 && (
                      <span class="np-copy-muted text-xs">&middot; {fmt(r.likes)} likes</span>
                    )}
                  </div>
                  <p class="np-copy-subtle whitespace-pre-wrap break-words text-sm leading-relaxed">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              class="np-button np-button-secondary mt-4 w-full disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more replies'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}

// === Thread Modal ===

interface RemoteTweet {
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  authorBio: string | null
  content: string
  media: MediaItem[] | null
  isRetweet: string | null
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
  replyToHandle: string | null
  replyToTweetId: string | null
  publishedAt: string
}

function ThreadModal({
  tweetId,
  onClose,
}: {
  tweetId: string
  onClose: () => void
}) {
  const [tweets, setTweets] = useState<RemoteTweet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ tweets: RemoteTweet[] }>(`/x/thread/${tweetId}`)
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

  const modal = (
    <div
      class="np-overlay fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div
        class="np-overlay-panel mx-3 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="np-overlay-header flex items-center justify-between p-4 pb-2">
          <h3 class="np-overlay-title">Thread</h3>
          <button
            type="button"
            onClick={onClose}
            class="np-overlay-close text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div class="overflow-y-auto flex-1 p-4 scrollbar-dark">
          {loading && <Spinner />}
          {error && <p class="np-alert np-alert-error py-3 text-center">{error}</p>}
          {!loading && !error && tweets.length === 0 && (
            <p class="np-overlay-empty py-8 text-sm">No thread found.</p>
          )}
          {tweets.map((t, i) => (
            <ThreadTweetItem key={t.tweetId} tweet={t} isLast={i === tweets.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}

function ThreadTweetItem({ tweet, isLast }: { tweet: RemoteTweet; isLast: boolean }) {
  const media: MediaItem[] = tweet.media || []
  const [lightbox, setLightbox] = useState<number | null>(null)

  return (
    <div class="relative flex gap-3">
      {/* Vertical thread line */}
      <div class="flex flex-col items-center shrink-0">
        {tweet.authorAvatar ? (
          <img src={imgProxy(tweet.authorAvatar)} alt="" class="h-8 w-8 rounded-full" loading="lazy" />
        ) : (
          <div class="np-avatar-fallback flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold">
            {(tweet.authorName || '?').charAt(0).toUpperCase()}
          </div>
        )}
        {!isLast && <div class="np-thread-line mt-1 mb-1 w-0.5 flex-1" />}
      </div>
      <div class="min-w-0 flex-1 pb-4">
        <div class="flex items-baseline gap-1 flex-wrap mb-0.5">
          <span class="np-copy-strong text-sm font-semibold">{tweet.authorName}</span>
          <span class="np-copy-muted text-xs">@{tweet.authorHandle}</span>
          {tweet.publishedAt && (
            <span class="np-copy-muted text-xs">&middot; {timeAgo(tweet.publishedAt)}</span>
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
        {tweet.quotedTweet && <QuotedTweetPreview quoted={tweet.quotedTweet} compact />}
        {tweet.card && <LinkCard data={tweet.card} fallbackUrl={tweet.url} tweetUrl={tweet.url} />}
        <div class="np-copy-muted mt-1.5 flex items-center gap-3 text-xs">
          {tweet.replies > 0 && <span>{fmt(tweet.replies)} replies</span>}
          {tweet.retweets > 0 && <span>{fmt(tweet.retweets)} RTs</span>}
          {tweet.likes > 0 && <span>{fmt(tweet.likes)} likes</span>}
        </div>
      </div>
    </div>
  )
}

function RemoteTweetDetailModal({
  tweetId,
  onClose,
}: {
  tweetId: string
  onClose: () => void
}) {
  const [data, setData] = useState<TweetConversationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<TweetConversationData>(`/x/conversation/${tweetId}`)
      .then((response) => setData(response))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load post'))
      .finally(() => setLoading(false))
  }, [tweetId])

  const hydratedTweet = useMemo(() => {
    if (!data?.tweet) return null
    return remoteTweetToTweet(data.tweet, buildParentTweetChain(data.ancestors))
  }, [data])

  useEffect(() => {
    if (hydratedTweet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hydratedTweet, onClose])

  useEffect(() => {
    if (hydratedTweet) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [hydratedTweet])

  if (hydratedTweet) {
    const detailModal = (
      <TweetDetailModal
        tweet={hydratedTweet}
        onClose={onClose}
        forceExpandedText
        threadTweetId={tweetId}
        forceShowThreadButton={(data?.thread.length || 0) > 1}
      />
    )
    return typeof document !== 'undefined' ? createPortal(detailModal, document.body) : detailModal
  }

  const modal = (
    <div
      class="np-post-modal fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-3"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div class="np-post-modal-body w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div class="np-post-modal-replies rounded-xl px-4 py-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h4 class="np-copy-strong text-sm font-semibold">Post</h4>
            <button
              type="button"
              onClick={onClose}
              class="np-overlay-close text-xl leading-none"
            >
              &times;
            </button>
          </div>
          {loading && <Spinner class="py-6" />}
          {error && <p class="np-alert np-alert-error py-3 text-center">{error}</p>}
          {!loading && !error && <p class="np-overlay-empty py-4 text-sm">Post not found.</p>}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}

function QuotedTweetPreview({
  quoted,
  compact,
  forceExpandedText,
  onExpandRequest,
}: {
  quoted: QuotedTweet
  compact?: boolean
  forceExpandedText?: boolean
  onExpandRequest?: () => void
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const tweetId = extractTweetIdFromUrl(quoted.url)
  const interactive = !!tweetId

  return (
    <>
      {!compact && lightbox !== null && (
        <Lightbox
          items={(quoted.media || []).filter((item) => item.type === 'photo')}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {showDetail && tweetId && (
        <RemoteTweetDetailModal
          tweetId={tweetId}
          onClose={() => setShowDetail(false)}
        />
      )}
      <div
        class={`${compact ? 'np-inline-card mt-2 p-2.5' : 'np-post-quote mt-2 rounded-xl p-3'} overflow-hidden ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (interactive) setShowDetail(true)
        }}
        onKeyDown={(e) => {
          if (!interactive) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            setShowDetail(true)
          }
        }}
      >
        <div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {quoted.authorAvatar && (
            <img
              src={imgProxy(quoted.authorAvatar)}
              alt=""
              class={compact ? 'h-4 w-4 rounded-full shrink-0' : 'h-5 w-5 rounded-full shrink-0'}
            />
          )}
          <span class={`${compact ? 'np-copy-subtle text-xs font-semibold' : 'np-copy-strong text-sm font-semibold'} break-all`}>
            {quoted.authorName}
          </span>
          <span class={`${compact ? 'np-copy-muted text-xs' : 'np-copy-muted text-xs'} break-all`}>
            @{quoted.authorHandle}
          </span>
        </div>
        {compact ? (
          <p class="np-copy-muted line-clamp-3 break-words text-xs">{quoted.content}</p>
        ) : (
          <>
            <div class="np-copy-subtle text-sm">
              <TweetContent
                text={quoted.content}
                hideUrls={!!quoted.card}
                forceExpanded={forceExpandedText}
                onExpandRequest={onExpandRequest}
              />
            </div>
            <MediaGrid media={quoted.media || []} onPhotoClick={setLightbox} />
            {quoted.card && <LinkCard data={quoted.card} fallbackUrl={quoted.url} tweetUrl={quoted.url} />}
          </>
        )}
      </div>
    </>
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

interface TweetConversationData {
  tweet: RemoteTweet | null
  ancestors: RemoteTweet[]
  thread: RemoteTweet[]
}

interface RedditFeedPayload {
  id: string
  redditPostId: string
  fullname: string
  subreddit: string
  authorName: string | null
  title: string
  body: string | null
  thumbnailUrl: string | null
  previewUrl: string | null
  media: string | null
  domain: string | null
  permalink: string
  url: string
  score: number
  commentCount: number
  over18: boolean
  spoiler: boolean
  isSelf: boolean
  linkFlairText: string | null
  postHint: string | null
  publishedAt: string | null
}

export type TimelineItem =
  | {
      id: string
      provider: 'x'
      entityType: 'x_post'
      score: number | null
      publishedAt: string | null
      payload: Tweet
    }
  | {
      id: string
      provider: 'reddit'
      entityType: 'reddit_post'
      score: number | null
      publishedAt: string | null
      payload: RedditFeedPayload
    }

interface FeedResponse<T> {
  data: T[]
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

function getSelfThreadAncestors(tweet: Tweet): Tweet[] {
  const chain: Tweet[] = []
  const seen = new Set<string>([tweet.tweetId])
  let current: Tweet | null = tweet

  while (
    current.parentTweet
    && current.replyToHandle === current.authorHandle
    && current.parentTweet.authorHandle === current.authorHandle
    && !seen.has(current.parentTweet.tweetId)
  ) {
    chain.unshift(current.parentTweet)
    seen.add(current.parentTweet.tweetId)
    current = current.parentTweet
  }

  return chain
}

function extractTweetIdFromUrl(url: string | null | undefined): string | null {
  return url?.match(/status\/(\d+)/)?.[1] || null
}

function remoteTweetToTweet(tweet: RemoteTweet, parentTweet: Tweet | null): Tweet {
  return {
    id: `remote:${tweet.tweetId}`,
    tweetId: tweet.tweetId,
    authorName: tweet.authorName,
    authorHandle: tweet.authorHandle,
    authorAvatar: tweet.authorAvatar,
    authorFollowers: tweet.authorFollowers,
    authorBio: tweet.authorBio,
    content: tweet.content,
    mediaUrls: tweet.media ? JSON.stringify(tweet.media) : null,
    isRetweet: tweet.isRetweet,
    card: tweet.card ? JSON.stringify(tweet.card) : null,
    quotedTweet: tweet.quotedTweet ? JSON.stringify(tweet.quotedTweet) : null,
    replyToHandle: tweet.replyToHandle,
    replyToTweetId: tweet.replyToTweetId,
    parentTweet,
    url: tweet.url,
    likes: tweet.likes,
    retweets: tweet.retweets,
    replies: tweet.replies,
    views: tweet.views,
    publishedAt: tweet.publishedAt,
  }
}

function buildParentTweetChain(ancestors: RemoteTweet[]): Tweet | null {
  let parentTweet: Tweet | null = null
  for (const ancestor of ancestors) {
    parentTweet = remoteTweetToTweet(ancestor, parentTweet)
  }
  return parentTweet
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

/** Split text on \n and interleave <br> */
function textWithBreaks(text: string): preact.ComponentChildren {
  if (!text.includes('\n')) return text
  const lines = text.split('\n')
  const out: preact.ComponentChildren[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push(<br />)
    if (lines[i]) out.push(lines[i])
  }
  return <>{out}</>
}

function applyFormat(text: string, format?: ArticleRichBlock['format']): preact.ComponentChildren {
  if (!format || format.length === 0) return textWithBreaks(text)

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

    let node: preact.ComponentChildren = textWithBreaks(segment)
    if (bold) node = <strong class="font-semibold">{node}</strong>
    if (italic) node = <em>{node}</em>
    if (link) node = <a href={link.href} target="_blank" rel="noopener" class="np-link-accent">{node}</a>

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

  if (loading) return <div class="my-3"><Spinner class="py-3" /></div>
  if (!tweet) {
    return (
      <a href={`https://x.com/i/status/${tweetId}`} target="_blank" rel="noopener"
        class="np-inline-card np-link-muted my-3 block px-4 py-3 text-sm">
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
        <a href={match[1]} target="_blank" rel="noopener" class="np-link-accent break-all">{match[1].replace(/^https?:\/\//, '')}</a>,
      )
    } else if (match[2]) {
      // **bold**
      parts.push(<strong class="np-copy-strong font-semibold">{match[2]}</strong>)
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
  const paragraphs = body.split(/\n/)
  return (
    <div class="np-post-shell">
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
          return <h3 key={i} class="np-copy-strong mt-6 mb-2 text-lg font-bold">{trimmed}</h3>
        }

        // Detect subheading-like lines (Title Case, short, no period)
        const isSubheading = trimmed.length < 150 && !trimmed.endsWith('.') && /^[A-Z]/.test(trimmed) && trimmed.split(/\s+/).length <= 15 && /^[A-Z][^.!?]*[^.!?\s]$/.test(trimmed) && trimmed !== trimmed.toUpperCase() && /[A-Z].*\b[A-Z]/.test(trimmed)
        if (isSubheading) {
          return <h3 key={i} class="np-copy-strong mt-5 mb-1.5 text-lg font-semibold">{articleFormatText(trimmed)}</h3>
        }

        return <p key={i} class="np-copy-subtle mb-3 text-[15px] leading-relaxed">{articleFormatText(trimmed)}</p>
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    // Try public cached article first, fall back to authenticated X fetch
    api<{ article: ArticleData }>(`/article/${tweetId}`)
      .catch(() => api<{ article: ArticleData }>(`/x/article/${tweetId}`))
      .then((r) => setArticle(r.article))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load article'))
      .finally(() => setLoading(false))
  }, [tweetId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (lightboxUrl) setLightboxUrl(null); else onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lightboxUrl])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const renderBlock = (block: ArticleRichBlock, i: number) => {
    switch (block.type) {
      case 'heading':
        return block.level === 1
          ? <h2 key={i} class="np-copy-strong mt-6 mb-2 text-xl font-bold">{applyFormat(block.text || '', block.format)}</h2>
          : block.level === 3
            ? <h4 key={i} class="np-copy-subtle mt-4 mb-1 text-base font-semibold">{applyFormat(block.text || '', block.format)}</h4>
            : <h3 key={i} class="np-copy-strong mt-5 mb-1.5 text-lg font-semibold">{applyFormat(block.text || '', block.format)}</h3>
      case 'image':
        return <img key={i} src={imgProxy(block.url!)} alt="" class="w-full rounded-lg my-4 cursor-pointer" loading="lazy" onClick={() => setLightboxUrl(imgProxy(block.url!))} />
      case 'blockquote':
        return <blockquote key={i} class="np-article-quote my-3 pl-4 italic">{applyFormat(block.text || '', block.format)}</blockquote>
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag key={i} class={`np-copy-subtle ${block.ordered ? 'list-decimal' : 'list-disc'} my-3 list-inside space-y-1.5`}>
            {block.items?.map((item, j) => <li key={j}>{applyFormat(item.text, item.format)}</li>)}
          </Tag>
        )
      }
      case 'divider':
        return <hr key={i} class="np-divider my-6" />
      case 'tweet':
        return <EmbeddedTweet key={i} tweetId={block.tweetId!} />
      default:
        return <p key={i} class="np-copy-subtle mb-3 text-[15px] leading-relaxed">{applyFormat(block.text || '', block.format)}</p>
    }
  }

  const modal = (
    <div
      class="np-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-3 cursor-default"
      onClick={(e: Event) => { e.stopPropagation(); if (!lightboxUrl) onClose() }}
    >
      <div
        class="np-overlay-panel flex w-full max-w-2xl flex-col overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="np-overlay-header flex items-center justify-between px-4 py-3 shrink-0">
          <h3 class="np-overlay-title text-sm">Article</h3>
          <div class="flex items-center gap-3">
            <a href={cardData.url} target="_blank" rel="noopener"
              class="np-link-muted flex items-center gap-1 text-xs">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open on X
            </a>
            <button type="button" onClick={onClose} class="np-overlay-close text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Content */}
        <div class="overflow-y-auto flex-1 scrollbar-dark" style={{ maxHeight: 'calc(90vh - 56px)' }}>
          {loading && <Spinner />}
          {error && (
            <div class="py-12 px-4 text-center">
              <p class="np-alert np-alert-error mb-3 text-sm">{error}</p>
              <a href={cardData.url} target="_blank" rel="noopener" class="np-link-accent text-sm">Open on X instead</a>
            </div>
          )}
          {article && (
            <div>
              {/* Cover image */}
              {(article.coverImage || cardData.thumbnail) && (
                <img src={imgProxy(article.coverImage || cardData.thumbnail!)} alt="" class="w-full cursor-pointer" loading="lazy"
                  onClick={() => setLightboxUrl(imgProxy(article.coverImage || cardData.thumbnail!))} />
              )}
              <div class="px-5 py-5">
                {/* Author */}
                <div class="flex items-center gap-2.5 mb-4">
                  {article.authorAvatar && (
                    <img src={imgProxy(article.authorAvatar)} alt="" class="w-8 h-8 rounded-full" />
                  )}
                  <div>
                    <span class="np-copy-strong text-sm font-semibold">{article.authorName}</span>
                    <span class="np-copy-muted ml-1.5 text-sm">@{article.authorHandle}</span>
                  </div>
                </div>

                {/* Title */}
                <h1 class="np-copy-strong mb-4 text-2xl font-bold leading-tight">{article.title}</h1>

                {/* Body */}
                {article.richContent ? (
                  <div>{article.richContent.map(renderBlock)}</div>
                ) : article.body ? (
                  <ArticleBodyPlainText body={article.body} />
                ) : cardData.description ? (
                  <p class="np-copy-subtle text-[15px]">{cardData.description}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
      {lightboxUrl && (
        <div class="np-overlay fixed inset-0 z-[60] flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); setLightboxUrl(null) }}>
          <img src={lightboxUrl} alt="" class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}

function LinkCard({ data, fallbackUrl, tweetUrl }: { data: CardData; fallbackUrl?: string; tweetUrl?: string }) {
  const url = data.url || fallbackUrl || '#'
  const [showArticle, setShowArticle] = useState(false)
  const [hideThumbnail, setHideThumbnail] = useState(false)
  const title = decodeEntities(data.title)
  const description = data.description ? decodeEntities(data.description) : null
  const thumbnail = data.thumbnail ? decodeEntities(data.thumbnail) : null

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
          class="np-post-link-card mt-2 block w-full overflow-hidden rounded-xl text-left transition-colors"
          onClick={(e) => { e.stopPropagation(); setShowArticle(true) }}
        >
          {thumbnail && !hideThumbnail && (
            <div class="np-link-thumb">
              <img
                src={imgProxy(thumbnail)}
                alt=""
                class="w-full h-full object-cover rounded-t-xl"
                loading="lazy"
                onError={() => setHideThumbnail(true)}
              />
            </div>
          )}
          <div class="p-2.5">
            <p class="np-link-card-title line-clamp-2 text-sm font-medium">{title}</p>
            {description && (
              <p class="np-link-card-body mt-0.5 line-clamp-2 text-xs">{description}</p>
            )}
            <p class="np-link-card-domain mt-0.5 text-xs">{data.domain}</p>
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
      class="np-post-link-card mt-2 block overflow-hidden rounded-xl transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {thumbnail && !hideThumbnail && (
        <div class="np-link-thumb">
          <img
            src={imgProxy(thumbnail)}
            alt=""
            class="w-full h-full object-cover rounded-t-xl"
            loading="lazy"
            onError={() => setHideThumbnail(true)}
          />
        </div>
      )}
      <div class="p-2.5">
        <p class="np-link-card-title line-clamp-2 text-sm font-medium">{title}</p>
        {description && (
          <p class="np-link-card-body mt-0.5 line-clamp-2 text-xs">{description}</p>
        )}
        <p class="np-link-card-domain mt-0.5 text-xs">{data.domain}</p>
      </div>
    </a>
  )
}

function OgEmbed({
  text,
  url,
  onLoaded,
  onResolved,
}: {
  text: string
  url?: string
  onLoaded: () => void
  onResolved?: (found: boolean) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<CardData | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [visible, setVisible] = useState(false)
  const targetUrl = url || text.match(/https?:\/\/[^\s]+/)?.[0] || null

  useEffect(() => {
    const node = rootRef.current
    if (!node || !targetUrl) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '320px 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    if (!targetUrl || !visible) return
    setAttempted(true)
    api<CardData | null>(`/og?url=${encodeURIComponent(targetUrl)}`)
      .then((data) => {
        if (data) {
          setCard(data)
          onLoaded()
          onResolved?.(true)
        } else {
          onResolved?.(false)
        }
      })
      .catch(() => onResolved?.(false))
  }, [targetUrl, visible, onLoaded, onResolved])

  if (!card) {
    return attempted ? (
      <div ref={rootRef} class="np-skeleton-shell mt-2 overflow-hidden rounded-xl border">
        <div class="np-link-thumb np-skeleton" />
        <div class="p-2.5 space-y-1.5">
          <div class="np-skeleton-line h-4 w-[78%] rounded" />
          <div class="np-skeleton-line h-3 w-full rounded opacity-80" />
          <div class="np-skeleton-line h-3 w-[68%] rounded opacity-60" />
        </div>
      </div>
    ) : <div ref={rootRef} class="mt-2 h-px w-full" />
  }
  return <LinkCard data={card} />
}

// === Shared Media Grid ===

function InlineVideo({ item, frameClass, fit }: { item: MediaItem; frameClass: string; fit: string }) {
  const isGif = item.type === 'gif'
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const posterUrl = mediaThumbnailUrl(item.thumbnail)

  useEffect(() => {
    const v = videoRef.current
    if (v && isGif) {
      v.muted = true
      v.play().catch(() => {})
    }
  }, [isGif])

  if (playing || isGif) {
    return (
      <div
        class={`np-media-frame relative overflow-hidden rounded-lg border ${frameClass}`}
      >
        {!loaded && (
          <img
            src={posterUrl}
            alt=""
            class={`${fit} absolute inset-0 h-full w-full`}
            loading="lazy"
          />
        )}
        <video
          ref={isGif ? videoRef : undefined}
          src={videoProxyUrl(item.url)}
          poster={posterUrl}
          controls={!isGif}
          autoPlay
          loop={isGif}
          muted={isGif}
          playsinline
          preload="metadata"
          class={`${fit} absolute inset-0 h-full w-full transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
          onLoadedData={() => setLoaded(true)}
        />
        {isGif && (
          <span class="np-media-badge absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-semibold">
            GIF
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      class={`np-media-frame relative overflow-hidden rounded-lg border transition-colors ${frameClass}`}
      onClick={(e) => { e.stopPropagation(); setPlaying(true) }}
    >
      <img
        src={posterUrl}
        alt=""
        class={`${fit} absolute inset-0 h-full w-full`}
        loading="lazy"
      />
      <div class="np-media-play absolute inset-0 flex items-center justify-center">
        <svg class="w-10 h-10 drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
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
  const frameClass = single ? 'w-full aspect-[4/3] sm:aspect-[16/10]' : 'w-full h-32 sm:h-36'
  const fit = single ? 'object-contain' : 'object-cover'
  return (
    <div class={`np-post-media mt-2 grid gap-1.5 overflow-hidden ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {media.slice(0, 4).map((item, i) =>
        item.type !== 'photo' ? (
          <InlineVideo key={item.thumbnail} item={item} frameClass={frameClass} fit={fit} />
        ) : (
          <MediaPhotoTile
            key={item.url}
            item={item}
            frameClass={frameClass}
            fit={fit}
            onClick={() => onPhotoClick?.(i)}
          />
        ),
      )}
    </div>
  )
}

function MediaPhotoTile({
  item,
  frameClass,
  fit,
  onClick,
}: {
  item: MediaItem
  frameClass: string
  fit: string
  onClick?: () => void
}) {
  const thumbnailSrc = mediaThumbnailUrl(item.thumbnail)
  const fullSrc = lightboxImageUrl(item.url)
  const [src, setSrc] = useState(thumbnailSrc)

  useEffect(() => {
    setSrc(thumbnailSrc)
  }, [thumbnailSrc])

  return (
    <button
      type="button"
      class={`np-media-frame relative overflow-hidden rounded-lg border transition-colors ${frameClass}`}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <img
        src={src}
        alt=""
        class={`${fit} absolute inset-0 h-full w-full`}
        loading="lazy"
        onError={() => {
          if (src !== fullSrc) setSrc(fullSrc)
        }}
      />
    </button>
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
          class="np-link-accent break-all"
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
          class="np-link-accent"
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

function TweetContent({
  text,
  hideUrls,
  forceExpanded,
  onExpandRequest,
  className,
}: {
  text: string
  hideUrls?: boolean
  forceExpanded?: boolean
  onExpandRequest?: () => void
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  let cleaned = text
  if (hideUrls) {
    cleaned = cleaned.replace(/\s*https?:\/\/\S+/g, '').trim()
  }
  const lines = cleaned.split('\n')
  const tooManyLines = lines.length > 10
  const tooManyChars = cleaned.length > MAX_CHARS
  const needsTruncation = tooManyChars || tooManyLines
  const isExpanded = forceExpanded || expanded
  let display = cleaned
  if (needsTruncation && !isExpanded) {
    if (tooManyLines) display = lines.slice(0, 10).join('\n') + '...'
    if (tooManyChars && display.length > MAX_CHARS) display = display.slice(0, MAX_CHARS) + '...'
  }

  return (
    <div class={`np-post-content overflow-hidden ${className || ''}`}>
      <p class="np-copy-strong whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {linkify(display)}
      </p>
      {needsTruncation && !forceExpanded && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (onExpandRequest) onExpandRequest()
            else setExpanded(!expanded)
          }}
          class="np-link-accent mt-1 text-sm"
        >
          {expanded ? 'Show less' : 'Show full post'}
        </button>
      )}
    </div>
  )
}

function ConversationContextTweet({
  tweet,
  onShowReplies,
  forceExpandedText,
  onExpandRequest,
}: {
  tweet: Tweet
  onShowReplies?: () => void
  forceExpandedText?: boolean
  onExpandRequest?: () => void
}) {
  const media: MediaItem[] = safeParse<MediaItem[]>(tweet.mediaUrls) ?? []
  const cardRaw = safeParse<CardData>(tweet.card)
  const card = cardRaw?.title ? cardRaw : null
  const quoted = safeParse<QuotedTweet>(tweet.quotedTweet)
  const [lightbox, setLightbox] = useState<number | null>(null)

  return (
    <div class="np-post-thread mb-2 border-b pb-2">
      {lightbox !== null && (
        <Lightbox
          items={media.filter((item) => item.type === 'photo')}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      <div class="flex items-center gap-2 mb-1">
        {tweet.authorAvatar ? (
          <img src={imgProxy(tweet.authorAvatar)} alt="" class="h-5 w-5 rounded-full" loading="lazy" />
        ) : (
          <div class="np-avatar-fallback flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
            {(tweet.authorName || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <span class="np-copy-strong text-sm font-semibold">{tweet.authorName}</span>
        <span class="np-copy-muted text-xs">@{tweet.authorHandle}</span>
        {tweet.publishedAt && (
          <span class="np-copy-muted text-xs">&middot; {timeAgo(tweet.publishedAt)}</span>
        )}
      </div>

      <TweetContent
        text={tweet.content}
        hideUrls={!!card}
        forceExpanded={forceExpandedText}
        onExpandRequest={onExpandRequest}
      />

      {media.length > 0 && <MediaGrid media={media} onPhotoClick={setLightbox} />}

      {quoted && <QuotedTweetPreview quoted={quoted} compact />}

      {card ? (
        <LinkCard data={card} fallbackUrl={tweet.url} tweetUrl={tweet.url} />
      ) : (
        media.length === 0 && !quoted && <OgEmbed text={tweet.content} onLoaded={() => {}} />
      )}

      <div class="np-copy-muted mt-2 flex items-center gap-3 text-xs">
        {onShowReplies && (
          <button
            type="button"
            class="np-action-accent flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation()
              onShowReplies()
            }}
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {tweet.replies > 0 && fmt(tweet.replies)}
          </button>
        )}
        {!onShowReplies && tweet.replies > 0 && <span>{fmt(tweet.replies)} replies</span>}
        {tweet.retweets > 0 && <span>{fmt(tweet.retweets)} RTs</span>}
        {tweet.likes > 0 && <span>{fmt(tweet.likes)} likes</span>}
        {tweet.views > 0 && <span>{fmt(tweet.views)} views</span>}
      </div>
    </div>
  )
}

function CopyShareButton({ url, iconOnly }: { url: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [burstId, setBurstId] = useState(0)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    }
  }, [])

  return (
    <button
      type="button"
      class="np-copy-share relative flex items-center gap-1 overflow-visible"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(url)
        setCopied(true)
        setBurstId((id) => id + 1)
        if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = window.setTimeout(() => {
          setCopied(false)
          resetTimerRef.current = null
        }, 1500)
      }}
      title="Copy share link"
    >
      {burstId > 0 && (
        <span key={burstId} class="share-burst-icon" aria-hidden="true">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </span>
      )}
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      {!iconOnly && (copied ? <span class="np-copy-strong font-medium">Copied!</span> : 'Share')}
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
  forceExpandedText,
  threadTweetId,
  forceShowThreadButton,
}: {
  tweet: Tweet
  onClose: () => void
  nudge?: 'up' | 'down' | null
  onNudge?: (tweetId: string, direction: 'up' | 'down') => void
  score?: number | null
  minScore?: number
  forceExpandedText?: boolean
  threadTweetId?: string
  forceShowThreadButton?: boolean
}) {
  const [replies, setReplies] = useState<ReplyData[]>([])
  const [repliesLoading, setRepliesLoading] = useState(true)
  const [repliesCursor, setRepliesCursor] = useState<string | null>(null)
  const [repliesError, setRepliesError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const selfThreadAncestors = getSelfThreadAncestors(tweet)
  const replyTarget = selfThreadAncestors[0] ?? tweet
  const tweetIdForReplies = extractTweetIdFromUrl(replyTarget.url) || replyTarget.tweetId

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
      class="np-post-modal fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-3"
      onClick={(e: Event) => { e.stopPropagation(); onClose() }}
    >
      <div class="np-post-modal-body w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <TweetCard
          tweet={tweet}
          nudge={nudge}
          onNudge={onNudge}
          score={score}
          minScore={minScore}
          embedded
          forceExpandedText={forceExpandedText}
          threadTweetId={threadTweetId}
          forceShowThreadButton={forceShowThreadButton}
        />

        {/* Replies section */}
        <div class="np-post-modal-replies mt-2 rounded-xl px-4 py-3">
          <h4 class="np-copy-strong mb-3 text-sm font-semibold">Replies</h4>
          {repliesLoading && <Spinner class="py-4" />}
          {repliesError && <p class="np-alert np-alert-error py-3 text-center">{repliesError}</p>}
          {!repliesLoading && !repliesError && replies.length === 0 && (
            <p class="np-overlay-empty py-4 text-sm">No replies yet.</p>
          )}
          <div class="space-y-3">
            {replies.map((r, i) => (
              <div key={i} class="flex gap-2.5">
                {r.authorAvatar ? (
                  <img src={imgProxy(r.authorAvatar)} alt="" class="h-7 w-7 shrink-0 rounded-full" />
                ) : (
                  <div class="np-avatar-fallback flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {(r.authorName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-1 mb-0.5 flex-wrap">
                    <span class="np-copy-strong text-sm font-semibold">{r.authorName}</span>
                    {r.authorHandle && <span class="np-copy-muted text-xs">@{r.authorHandle}</span>}
                    {r.authorFollowers > 0 && <span class="np-copy-muted text-xs">&middot; {fmt(r.authorFollowers)}</span>}
                    {r.likes > 0 && <span class="np-copy-muted text-xs">&middot; {fmt(r.likes)} likes</span>}
                  </div>
                  <p class="np-copy-subtle whitespace-pre-wrap break-words text-sm leading-relaxed">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
          {repliesCursor && (
            <button type="button" onClick={loadMoreReplies} disabled={loadingMore}
              class="np-button np-button-secondary mt-3 w-full disabled:opacity-50">
              {loadingMore ? 'Loading...' : 'Load more replies'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function TweetCard({ tweet, nudge, onNudge, score, minScore, embedded, expandBehavior, forceExpandedText, threadTweetId, forceShowThreadButton }: {
  tweet: Tweet
  nudge?: 'up' | 'down' | null
  onNudge?: (tweetId: string, direction: 'up' | 'down') => void
  score?: number | null
  minScore?: number
  embedded?: boolean
  expandBehavior?: 'inline' | 'detail'
  forceExpandedText?: boolean
  threadTweetId?: string
  forceShowThreadButton?: boolean
}) {
  const media: MediaItem[] = safeParse<MediaItem[]>(tweet.mediaUrls) ?? []
  const quoted = safeParse<QuotedTweet>(tweet.quotedTweet)
  const cardRaw = safeParse<CardData>(tweet.card)
  const card = cardRaw?.title ? cardRaw : null
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [showReplies, setShowReplies] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [showReplyContextDetail, setShowReplyContextDetail] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showDetailExpanded, setShowDetailExpanded] = useState(false)
  const [ogLoaded, setOgLoaded] = useState(false)
  const isSelfThread = tweet.replyToHandle === tweet.authorHandle
  const selfThreadAncestors = isSelfThread ? getSelfThreadAncestors(tweet) : []
  const contextTweets = selfThreadAncestors.length > 0
    ? selfThreadAncestors
    : (tweet.parentTweet ? [tweet.parentTweet] : [])
  const contextRepliesHandler = selfThreadAncestors.length > 0 ? () => setShowReplies(true) : undefined
  const replyTarget = selfThreadAncestors[0] ?? tweet
  const replyCount = replyTarget.replies
  const replyContextTweetId = extractTweetIdFromUrl(tweet.url) || tweet.tweetId
  const threadTargetTweetId = threadTweetId || extractTweetIdFromUrl(tweet.url) || tweet.tweetId
  const showThreadButton = !!threadTargetTweetId && (forceShowThreadButton || isSelfThread)
  const onOgLoaded = useCallback(() => setOgLoaded(true), [])
  const openDetail = useCallback((expandedText = false) => {
    if (embedded) return
    setShowDetailExpanded(expandedText)
    setShowDetail(true)
  }, [embedded])
  const closeDetail = useCallback(() => {
    setShowDetail(false)
    setShowDetailExpanded(false)
  }, [])
  const onExpandRequest = !embedded && expandBehavior === 'detail' ? () => openDetail(true) : undefined
  const detailModal = !embedded && showDetail && typeof document !== 'undefined'
    ? createPortal(
      <TweetDetailModal
        tweet={tweet}
        onClose={closeDetail}
        nudge={nudge}
        onNudge={onNudge}
        score={score}
        minScore={minScore}
        forceExpandedText={showDetailExpanded}
        threadTweetId={threadTargetTweetId}
        forceShowThreadButton={showThreadButton}
      />,
      document.body,
    )
    : null

  return (
    <div>
    {detailModal}
    <div
      class={`np-post rounded-xl px-3 py-3 transition-colors sm:px-4${embedded ? '' : ' cursor-pointer'}`}
      onClick={embedded ? undefined : () => {
        if (lightbox !== null || showReplies || showThread) return
        openDetail(false)
      }}
    >
      {lightbox !== null && (
        <Lightbox
          items={media.filter((m) => m.type === 'photo')}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {showReplies && (() => {
        return (
          <RepliesModal
            tweetId={extractTweetIdFromUrl(replyTarget.url) || replyTarget.tweetId}
            onClose={() => setShowReplies(false)}
          />
        )
      })()}
      {showThread && threadTargetTweetId && (
        <ThreadModal
          tweetId={threadTargetTweetId}
          onClose={() => setShowThread(false)}
        />
      )}
      {showReplyContextDetail && replyContextTweetId && (
        <RemoteTweetDetailModal
          tweetId={replyContextTweetId}
          onClose={() => setShowReplyContextDetail(false)}
        />
      )}
      {contextTweets.map((contextTweet, index) => (
        <ConversationContextTweet
          key={contextTweet.tweetId}
          tweet={contextTweet}
          onShowReplies={index === 0 ? contextRepliesHandler : undefined}
          forceExpandedText={forceExpandedText}
          onExpandRequest={onExpandRequest}
        />
      ))}

      {tweet.isRetweet && (
        <div class="np-copy-muted mb-1 flex items-center gap-1 text-xs">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          @{tweet.isRetweet} reposted
        </div>
      )}

      {/* Author row: avatar + name */}
      <div class="np-post-author flex items-center gap-2.5 mb-1 group/author relative">
        {tweet.authorAvatar ? (
          <img
            src={imgProxy(tweet.authorAvatar)}
            alt=""
            class="h-9 w-9 shrink-0 rounded-full"
            loading="lazy"
          />
        ) : (
          <div class="np-avatar-fallback flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
            {tweet.authorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div class="min-w-0">
          <div class="overflow-hidden">
            <div class="flex items-baseline gap-1 flex-wrap">
              <span class="np-copy-strong max-w-[70%] truncate text-sm font-semibold">
                {tweet.authorName}
              </span>
              <span class="np-copy-muted truncate text-sm">@{tweet.authorHandle}</span>
              {tweet.authorFollowers > 0 && (
                <span class="np-copy-muted shrink-0 text-xs">&middot; {fmt(tweet.authorFollowers)}</span>
              )}
              {tweet.publishedAt && (
                <span class="np-copy-muted shrink-0 text-sm">&middot; {timeAgo(tweet.publishedAt)}</span>
              )}
            </div>
          </div>
        </div>
        {/* Bio tooltip */}
        {tweet.authorBio && (
          <div class="np-popover absolute left-0 top-full z-10 mt-1 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg p-3 sm:w-72 sm:group-hover/author:block">
            <div class="flex items-center gap-2 mb-1">
              <span class="np-copy-strong text-sm font-semibold">{tweet.authorName}</span>
              {tweet.authorFollowers > 0 && (
                <span class="np-copy-muted text-xs">{fmt(tweet.authorFollowers)} followers</span>
              )}
            </div>
            <p class="np-copy-subtle text-xs leading-relaxed">{tweet.authorBio}</p>
          </div>
        )}
      </div>

      {/* Reply context */}
      {tweet.replyToHandle && !tweet.parentTweet && (
        <div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <p class="np-post-reply-context">Replying to <span class="np-post-reply-handle">@{tweet.replyToHandle}</span></p>
          <button
            type="button"
            class="np-link-accent"
            onClick={(e) => {
              e.stopPropagation()
              setShowReplyContextDetail(true)
            }}
          >
            View context
          </button>
        </div>
      )}

      {/* Content — full width, no indent */}
      <TweetContent text={tweet.content} hideUrls={ogLoaded || !!card} forceExpanded={forceExpandedText} onExpandRequest={onExpandRequest} />

      {/* Media thumbnails */}
      <MediaGrid media={media} onPhotoClick={setLightbox} />

      {/* Quoted tweet */}
      {quoted && (
        <QuotedTweetPreview
          quoted={quoted}
          forceExpandedText={forceExpandedText}
          onExpandRequest={onExpandRequest}
        />
      )}

      {/* Link card — from API card data or OG fetch */}
      {card ? (
        <LinkCard data={card} fallbackUrl={tweet.url} tweetUrl={tweet.url} />
      ) : (
        !quoted && media.length === 0 && <OgEmbed text={tweet.content} onLoaded={onOgLoaded} />
      )}

      {/* Engagement */}
      <div class="np-post-actions mt-2 flex flex-wrap items-center justify-between gap-y-1 text-xs">
            <span class="flex items-center gap-3">
            <button
              type="button"
              class="np-action-accent flex items-center gap-1"
              onClick={(e) => { e.stopPropagation(); setShowReplies(true) }}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {replyCount > 0 && fmt(replyCount)}
            </button>
            {showThreadButton && (
              <button
                type="button"
                class="np-action-accent flex items-center gap-1"
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
                    class={`p-0.5 rounded transition-colors ${nudge === 'up' ? 'np-score-high' : 'np-nudge-up'}`}
                    onClick={(e) => { e.stopPropagation(); onNudge(tweet.id, 'up') }}
                    title="Show more like this"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={nudge === 'up' ? '2.5' : '1.5'}>
                      <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class={`p-0.5 rounded transition-colors ${nudge === 'down' ? 'np-score-low' : 'np-nudge-down'}`}
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
                <span class={`np-post-score rounded-sm px-1 py-0.5 text-[10px] font-medium ${minScore != null && score < minScore ? 'np-score-low' : score >= 70 ? 'np-score-high' : score >= 50 ? 'np-score-mid' : 'np-score-cutoff'}`}>
                  {score}
                </span>
              )}
              <CopyShareButton url={`${window.location.origin}/${tweet.authorHandle}/status/${tweet.tweetId}`} iconOnly />
              <a
                href={tweet.url}
                target="_blank"
                rel="noopener"
                class="np-action-strong flex items-center gap-1 whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
                title="View on X"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </span>
      </div>
    </div>
    </div>
  )
}

function parseRedditMedia(media: string | null, previewUrl: string | null, thumbnailUrl: string | null): MediaItem[] {
  const items: MediaItem[] = []
  const itemIndexByKey = new Map<string, number>()
  const parsed = safeParse<any>(media)
  const rawDirectUrls = Array.isArray(parsed?.urls) ? parsed.urls : []
  const hasOriginalRedditImage = rawDirectUrls.some((url) => getUrlHostname(url) === 'i.redd.it')
  const hasNonPreviewDirectMedia = rawDirectUrls.some((url) => {
    const hostname = getUrlHostname(url)
    return !!hostname && hostname !== 'preview.redd.it' && hostname !== 'external-preview.redd.it'
  })
  const directUrls = hasOriginalRedditImage
    ? rawDirectUrls.filter((url) => getUrlHostname(url) !== 'preview.redd.it')
    : hasNonPreviewDirectMedia
      ? rawDirectUrls.filter((url) => getUrlHostname(url) !== 'external-preview.redd.it')
    : rawDirectUrls
  const galleryItems = Array.isArray(parsed?.galleryItems) ? parsed.galleryItems : []
  const galleryUrls = Array.isArray(parsed?.galleryUrls) ? parsed.galleryUrls : []
  const galleryEntries = parsed?.mediaMetadata && typeof parsed.mediaMetadata === 'object'
    ? Object.values(parsed.mediaMetadata)
    : []

  const pushItem = (item: MediaItem | null) => {
    if (!item) return
    const key = getComparableMediaKey(item)
    const existingIndex = itemIndexByKey.get(key)
    if (existingIndex == null) {
      itemIndexByKey.set(key, items.length)
      items.push(item)
      return
    }

    if (getMediaQualityScore(item) > getMediaQualityScore(items[existingIndex])) {
      items[existingIndex] = item
    }
  }

  for (const directUrl of directUrls) {
    pushItem(getDirectRedditMedia(directUrl))
  }

  for (const galleryItem of galleryItems) {
    const url = typeof galleryItem?.url === 'string' ? galleryItem.url : null
    const thumbnail = typeof galleryItem?.thumbnail === 'string' ? galleryItem.thumbnail : url
    if (url && thumbnail) {
      pushItem({ type: 'photo', url, thumbnail })
    }
  }

  for (const galleryUrl of galleryUrls) {
    pushItem(getDirectRedditMedia(galleryUrl))
  }

  for (const entry of galleryEntries) {
    const source = decodeURIComponent((entry as any)?.s?.u || '')
    if (source && /^https?:\/\//.test(source)) {
      pushItem({ type: 'photo', url: source, thumbnail: source })
    }
  }

  const videoUrl = (parsed?.secureMedia as any)?.reddit_video?.fallback_url
  if (videoUrl && /^https?:\/\//.test(videoUrl)) {
    pushItem({ type: 'video', url: videoUrl, thumbnail: previewUrl || thumbnailUrl || videoUrl })
  }

  if (items.length === 0 && previewUrl) pushItem({ type: 'photo', url: previewUrl, thumbnail: previewUrl })
  if (items.length === 0 && thumbnailUrl) pushItem({ type: 'photo', url: thumbnailUrl, thumbnail: thumbnailUrl })
  return items
}

function getDirectRedditMedia(url: string | null | undefined): MediaItem | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const nestedUrl = parsed.hostname.endsWith('reddit.com') && parsed.pathname === '/media'
      ? parsed.searchParams.get('url')
      : null
    if (nestedUrl) return getDirectRedditMedia(nestedUrl)

    const pathname = parsed.pathname.toLowerCase()
    const mediaUrl = parsed.toString()

    if (/\.(png|jpe?g|gif|webp)$/i.test(pathname) || parsed.hostname === 'i.redd.it' || parsed.hostname === 'preview.redd.it') {
      return { type: 'photo', url: mediaUrl, thumbnail: mediaUrl }
    }

    if (/\.(mp4|webm|mov)$/i.test(pathname)) {
      return { type: 'video', url: mediaUrl, thumbnail: mediaUrl }
    }
  } catch {}

  return null
}

function getComparableMediaKey(item: MediaItem): string {
  const normalizedUrl = normalizeComparableUrl(item.url)
  if (!normalizedUrl) return `${item.type}:${item.url}`

  try {
    const parsed = new URL(normalizedUrl)
    const hostname = parsed.hostname.toLowerCase()
    if (hostname === 'i.redd.it' || hostname === 'preview.redd.it') {
      return `${item.type}:reddit:${parsed.pathname.toLowerCase()}`
    }
    return `${item.type}:${normalizedUrl}`
  } catch {
    return `${item.type}:${normalizedUrl}`
  }
}

function getMediaQualityScore(item: MediaItem): number {
  try {
    const parsed = new URL(item.url)
    const hostname = parsed.hostname.toLowerCase()
    const width = Number(parsed.searchParams.get('width') || 0)
    const height = Number(parsed.searchParams.get('height') || 0)
    let score = Math.max(width, 0) * 10 + Math.max(height, 0)

    if (!parsed.search) score += 100_000
    if (hostname === 'preview.redd.it') score += 1_000_000
    if (hostname === 'i.redd.it') score += 2_000_000

    return score
  } catch {
    return 0
  }
}

function getUrlHostname(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function normalizeComparableUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(decodeEntities(url))
    parsed.hash = ''
    if ((parsed.hostname === 'i.redd.it' || parsed.hostname === 'preview.redd.it') && parsed.searchParams.has('width')) {
      parsed.searchParams.delete('width')
    }
    return parsed.toString()
  } catch {
    return decodeEntities(url)
  }
}

function RedditCard({
  item,
  nudge,
  onNudge,
  score,
  minScore,
}: {
  item: Extract<TimelineItem, { provider: 'reddit' }>
  nudge?: 'up' | 'down' | null
  onNudge?: (id: string, direction: 'up' | 'down') => void
  score?: number | null
  minScore?: number
}) {
  const post = item.payload
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [bodyExpanded, setBodyExpanded] = useState(false)
  const [ogResolved, setOgResolved] = useState(false)
  const [ogAvailable, setOgAvailable] = useState(false)
  const mediaItems = useMemo(() => {
    const parsed = parseRedditMedia(post.media, post.previewUrl, post.thumbnailUrl)
    if (parsed.length > 0) return parsed
    const directMedia = getDirectRedditMedia(post.url)
    return directMedia ? [directMedia] : parsed
  }, [post.media, post.previewUrl, post.thumbnailUrl, post.url])
  const hasDirectMediaUrl = !!getDirectRedditMedia(post.url)
  const isRedditGalleryPost = post.postHint === 'gallery' || /:\/\/(?:www\.)?reddit\.com\/gallery\//i.test(post.url)
  const linkCardData = !post.isSelf && post.domain && !hasDirectMediaUrl && !isRedditGalleryPost
    ? {
        title: post.title,
        description: post.body || null,
        thumbnail: post.previewUrl || post.thumbnailUrl || mediaItems[0]?.thumbnail || null,
        domain: post.domain,
        url: post.url,
      }
    : null
  const linkThumbnail = normalizeComparableUrl(linkCardData?.thumbnail || null)
  const dedupedMediaItems = linkThumbnail
    ? mediaItems.filter((mediaItem) => {
        const mediaUrl = normalizeComparableUrl(mediaItem.url)
        const mediaThumb = normalizeComparableUrl(mediaItem.thumbnail)
        return mediaUrl !== linkThumbnail && mediaThumb !== linkThumbnail
      })
    : mediaItems
  const bodyLines = (post.body || '').split('\n')
  const bodyNeedsTruncation = !!post.body && (bodyLines.length > 10 || post.body.length > MAX_CHARS)
  let visibleBody = post.body || ''
  if (bodyNeedsTruncation && !bodyExpanded) {
    if (bodyLines.length > 10) visibleBody = bodyLines.slice(0, 10).join('\n')
    if (visibleBody.length > MAX_CHARS) visibleBody = visibleBody.slice(0, MAX_CHARS)
    visibleBody = `${visibleBody.trimEnd()}...`
  }
  const bodyParagraphs = visibleBody
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <article class="np-tweet relative overflow-hidden">
      <div class="space-y-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <span class="np-copy-strong font-semibold">r/{post.subreddit}</span>
            <span class="np-copy-muted">u/{post.authorName || '[deleted]'}</span>
            {post.publishedAt && <span class="np-copy-muted">{timeAgo(post.publishedAt)}</span>}
            {post.linkFlairText && <span class="np-chip px-2 py-0.5">{post.linkFlairText}</span>}
            {post.over18 && <span class="np-chip px-2 py-0.5 text-red-700">NSFW</span>}
            {post.spoiler && <span class="np-chip px-2 py-0.5">Spoiler</span>}
          </div>
          <h3 class="mt-1.5 text-[1.02rem] font-semibold leading-snug np-copy-strong">{post.title}</h3>
        </div>

        {post.body && (
          <div>
            <div class="np-copy-subtle break-words text-[0.95rem] leading-relaxed">
              {bodyParagraphs.map((paragraph, index) => (
                <p key={index} class={index === bodyParagraphs.length - 1 ? '' : 'mb-3'}>
                  {textWithBreaks(paragraph)}
                </p>
              ))}
            </div>
            {bodyNeedsTruncation && (
              <button
                type="button"
                onClick={() => setBodyExpanded((value) => !value)}
                class="np-link-accent mt-1 text-sm"
              >
                {bodyExpanded ? 'Show less' : 'Show full post'}
              </button>
            )}
          </div>
        )}

        {dedupedMediaItems.length > 0 && (
          <MediaGrid media={dedupedMediaItems} onPhotoClick={setLightboxIndex} />
        )}

        {post.url && dedupedMediaItems.length === 0 && !post.isSelf && !hasDirectMediaUrl && (
          <OgEmbed
            text=""
            url={post.url}
            onLoaded={() => setOgAvailable(true)}
            onResolved={(found) => {
              setOgResolved(true)
              setOgAvailable(found)
            }}
          />
        )}
        {ogResolved && !ogAvailable && linkCardData && <LinkCard data={linkCardData} fallbackUrl={post.url} />}

        <div class="np-post-actions flex flex-wrap items-center justify-between gap-y-1 text-xs">
          <span class="flex items-center gap-3">
            {post.score > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
                </svg>
                {fmt(post.score)}
              </span>
            )}
            {post.commentCount > 0 && (
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {fmt(post.commentCount)}
              </span>
            )}
          </span>
          <span class="flex items-center gap-2">
            {onNudge && (
              <span class="flex items-center gap-0.5">
                <button
                  type="button"
                  class={`p-0.5 rounded transition-colors ${nudge === 'up' ? 'np-score-high' : 'np-nudge-up'}`}
                  onClick={() => onNudge(item.id, 'up')}
                  title="Show more like this"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={nudge === 'up' ? '2.5' : '1.5'}>
                    <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  class={`p-0.5 rounded transition-colors ${nudge === 'down' ? 'np-score-low' : 'np-nudge-down'}`}
                  onClick={() => onNudge(item.id, 'down')}
                  title="Show less like this"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={nudge === 'down' ? '2.5' : '1.5'}>
                    <path d="M12 5v14m0 0l6-6m-6 6l-6-6" />
                  </svg>
                </button>
              </span>
            )}
            {score != null && (
              <span class={`np-post-score rounded-sm px-1 py-0.5 text-[10px] font-medium ${minScore != null && score < minScore ? 'np-score-low' : score >= 70 ? 'np-score-high' : score >= 50 ? 'np-score-mid' : 'np-score-cutoff'}`}>
                {score}
              </span>
            )}
            <CopyShareButton url={post.url} iconOnly />
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener"
              class="np-action-strong flex items-center gap-1 whitespace-nowrap"
              title="View on Reddit"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </span>
        </div>
      </div>

      {lightboxIndex != null && (
        <Lightbox items={dedupedMediaItems} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </article>
  )
}

// === Nudge Hook ===

function useNudges(demo?: boolean, feedId?: string | null) {
  const [nudges, setNudges] = useState<Map<string, 'up' | 'down'>>(new Map())
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (demo) return
    setNudges(new Map())
    if (!feedId) return
    api<{ nudges: Array<{ itemId: string; direction: 'up' | 'down' }> }>(withFeedId('/ai/nudges', feedId))
      .then((r) => {
        const map = new Map<string, 'up' | 'down'>()
        for (const n of r.nudges) map.set(n.itemId, n.direction as 'up' | 'down')
        setNudges(map)
      })
      .catch(() => {})
  }, [demo, feedId])

  const onNudge = useCallback((itemId: string, direction: 'up' | 'down') => {
    setNudges((prev) => {
      const next = new Map(prev)
      const wasSet = next.get(itemId) === direction
      if (wasSet) {
        next.delete(itemId)
        api(withFeedId(`/ai/nudge/${itemId}`, feedId), { method: 'DELETE' }).catch(() => {
          // Revert: re-apply the nudge we just removed
          setNudges((p) => { const r = new Map(p); r.set(itemId, direction); return r })
          setFeedback('Failed to save feedback')
          setTimeout(() => setFeedback(null), 3000)
        })
      } else {
        const prevDirection = next.get(itemId)
        next.set(itemId, direction)
        api('/ai/nudge', { method: 'POST', body: JSON.stringify({ itemId, direction, feedId }) }).catch(() => {
          // Revert to previous state
          setNudges((p) => {
            const r = new Map(p)
            if (prevDirection) r.set(itemId, prevDirection)
            else r.delete(itemId)
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
  }, [feedId])

  return { nudges, onNudge, feedback }
}

// === AI Report with Inline Tweets ===

interface AiReportData {
  id: string
  content: string
  model: string
  itemCount: number
  itemRefs: string[]
  refItems: TimelineItem[]
  createdAt: string
}

function fixtureAvatar(label: string, bg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <rect width="80" height="80" rx="40" fill="${bg}"/>
      <text x="40" y="49" text-anchor="middle" font-size="32" font-family="Georgia, serif" fill="#f5efe1">${label}</text>
    </svg>`,
  )}`
}

function fixtureThumb(bg: string, accent: string, label: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${bg}" offset="0"/>
          <stop stop-color="${accent}" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#g)"/>
      <circle cx="1210" cy="260" r="150" fill="rgba(255,255,255,.13)"/>
      <text x="110" y="760" font-size="120" font-family="Georgia, serif" fill="rgba(255,255,255,.85)">${label}</text>
    </svg>`,
  )}`
}

function tweetToTimelineItem(tweet: Tweet, score?: number | null): Extract<TimelineItem, { provider: 'x' }> {
  return {
    id: tweet.id,
    provider: 'x',
    entityType: 'x_post',
    score: score ?? null,
    publishedAt: tweet.publishedAt,
    payload: tweet,
  }
}

function createFixtureTweet(overrides: Partial<Tweet> & Pick<Tweet, 'id' | 'tweetId' | 'authorName' | 'authorHandle' | 'content'>): Tweet {
  return {
    authorAvatar: fixtureAvatar(overrides.authorName[0] || 'O', '#8b5e3c'),
    authorFollowers: 125000,
    authorBio: null,
    mediaUrls: null,
    isRetweet: null,
    card: null,
    quotedTweet: null,
    replyToHandle: null,
    replyToTweetId: null,
    parentTweet: null,
    url: `https://x.com/${overrides.authorHandle}/status/${overrides.tweetId}`,
    likes: 1200,
    retweets: 140,
    replies: 28,
    views: 82000,
    publishedAt: '2026-04-05T09:02:00.000Z',
    ...overrides,
  }
}

export function NewspaperFixturePage() {
  useNewspaperActive()

  const fixtureTweets = [
    createFixtureTweet({
      id: 'fx-1',
      tweetId: '1001',
      authorName: 'Peter Steinberger',
      authorHandle: 'steipete',
      content: 'Anthropic now blocks first-party harness use too.\n\nclaude -p --append-system-prompt "A personal assistant running inside OpenClaw." is clawd here?\n\nSo yeah: bring your own coin.',
    }),
    createFixtureTweet({
      id: 'fx-2',
      tweetId: '1002',
      authorName: 'M. Lynch',
      authorHandle: 'mtlynch',
      content: `Claude Code found a Linux vulnerability hidden for 23 years.\n\nClaude Code has gotten extremely good at finding security vulnerabilities, and this is only the beginning.`,
      card: JSON.stringify({
        title: 'Claude Code Found a Linux Vulnerability Hidden for 23 Years',
        description: 'Security audits are becoming a compelling agent workflow.',
        thumbnail: fixtureThumb('#111827', '#2563eb', 'Bugs Found'),
        domain: 'mtlynch.io',
        url: 'https://mtlynch.io/linux-vuln',
      }),
    }),
    createFixtureTweet({
      id: 'fx-3',
      tweetId: '1003',
      authorName: 'Hesam',
      authorHandle: 'Hesamation',
      content: 'A group of North Korean hackers possibly exploited a VSCode/Cursor vulnerability to steal $285M.\n> they posed as a trading firm for 6 months\n> shared repo that likely compromised a contributor\n> opening a cloned repo auto-executes a malicious .vscode/tasks.json',
      card: JSON.stringify({
        title: 'Incident Background Update',
        description: 'Drift is working with law enforcement and forensic partners.',
        thumbnail: fixtureThumb('#4a1d0d', '#f59e0b', 'Incident'),
        domain: 'x.com',
        url: 'https://x.com/driftprotocol/status/1',
      }),
    }),
    createFixtureTweet({
      id: 'fx-4',
      tweetId: '1004',
      authorName: 'levelsio',
      authorHandle: 'levelsio',
      content: 'The 2026 vibe jam is back.\n\nI am building an FPV drone sim as a demo: city ruins, FBX imports, heat vision, drones hunting players, and live iteration over five-hour sessions.',
    }),
    createFixtureTweet({
      id: 'fx-5',
      tweetId: '1005',
      authorName: 'Andrej Karpathy',
      authorHandle: 'karpathy',
      content: 'Using LLMs to build personal knowledge bases for research topics is becoming a large fraction of my recent token throughput.\n\nExplicit inspectable memory artifacts feel much better than opaque context stuffing.',
    }),
    createFixtureTweet({
      id: 'fx-6',
      tweetId: '1006',
      authorName: 'Farza',
      authorHandle: 'FarzaTV',
      content: 'This is Farzapedia.\n\nAn LLM took thousands of my notes and chats to produce a personal wiki with explicit editable pages.',
      card: JSON.stringify({
        title: 'Farzapedia',
        description: 'A personal wiki built from long-lived notes and conversations.',
        thumbnail: fixtureThumb('#1f2937', '#14b8a6', 'Wiki'),
        domain: 'farza.dev',
        url: 'https://farza.dev/wiki',
      }),
    }),
  ]

  const refItems = new Map(fixtureTweets.map((tweet) => [tweet.id, tweetToTimelineItem(tweet)] as const))
  const text = `# AI CODING INFRASTRUCTURE: POLICY SHIFTS AND SECURITY REVELATIONS
Anthropic quietly changed its terms to block first-party harness use, routing "extra usage" to third-party app limits rather than plan limits, a move that breaks existing CLI workflows and forces developers to pay per-token.

This lands as Claude Code independently uncovered a Linux vulnerability hidden for 23 years, demonstrating the security audit potential of agentic coding tools. Meanwhile, security researchers warn that North Korean hackers exploited VS Code and Cursor's default workspace trust settings to steal hundreds of millions from crypto firms by auto-executing malicious .vscode/tasks.json files when contributors cloned repos.

[[tweet:fx-1]]
[[tweet:fx-2]]
[[tweet:fx-3]]

# THE 2026 VIBEJAM: AI-NATIVE GAME DEVELOPMENT GOES MAINSTREAM
Pieter Levels launched the second annual Vibe Coding Game Jam with $35,000 in prizes, requiring 90% AI-written code and attracting participants ranging from indie developers to a 10-year-old using Cursor.

Levels is building an FPV drone sim as a demonstration: starting from basic physics, adding FBX city ruins for atmosphere, implementing heat-vision multiplayer where drones hunt hiding players, and iterating live over five-hour sessions. The event signals a shift where AI-assisted game development is becoming a spectator sport and a legitimate path for non-coders to build complex interactive experiences.

[[tweet:fx-4]]

# KNOWLEDGE OBJECTS INSTEAD OF CONTEXT WINDOWS
Technical writers and researchers are converging on a more inspectable model for AI memory. Instead of shoving everything into opaque context windows, they are building explicit knowledge artifacts that can be edited, versioned, and reused across workflows.

Karpathy's framing around personal research knowledge bases and Farza's prototype wiki both point in the same direction: memory that behaves more like a newspaper morgue or card catalog than a bottomless prompt buffer. That is both more legible and more portable, and it creates natural surfaces for collaboration.

[[tweet:fx-5]]
[[tweet:fx-6]]`

  return (
    <NewspaperShell subtitle="Fixture Preview" showMeta={false}>
      <NewspaperContent
        text={text}
        refItems={refItems}
        reportDate="2026-04-05T09:02:00.000Z"
        itemCount={fixtureTweets.length}
        issueNumber={7}
        showMasthead={false}
      />
    </NewspaperShell>
  )
}

type SectionItem = { type: 'text' | 'item'; line: string; item?: TimelineItem }
type ParsedReportSection = {
  header: string | null
  headerLevel: number
  items: SectionItem[]
  anchorId?: string
}

function slugifyHeadline(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'section'
}

function parseReportSections(text: string, refItems: Map<string, TimelineItem>): ParsedReportSection[] {
  const cleaned = text.replace(/\\([^\\])/g, '$1')
  const lines = cleaned.split('\n')
  const sections: ParsedReportSection[] = []
  let current: ParsedReportSection = { header: null, headerLevel: 0, items: [] }
  const slugCounts = new Map<string, number>()
  const normalizeItemRefId = (value: string) => value.trim()

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    if (h1 || h2 || h3) {
      if (current.items.length > 0 || current.header) sections.push(current)
      const header = (h1 || h2 || h3)![1]
      const baseSlug = slugifyHeadline(header)
      const seen = slugCounts.get(baseSlug) || 0
      slugCounts.set(baseSlug, seen + 1)
      current = {
        header,
        headerLevel: h1 ? 1 : h2 ? 2 : 3,
        items: [],
        anchorId: seen === 0 ? `report-${baseSlug}` : `report-${baseSlug}-${seen + 1}`,
      }
      continue
    }
    const itemMatch = line.match(/\[\[(?:item|tweet):([^\]]+)\]\]/)
    if (itemMatch) {
      current.items.push({
        type: 'item',
        line,
        item: refItems.get(normalizeItemRefId(itemMatch[1])) || undefined,
      })
    }
    else current.items.push({ type: 'text', line })
  }

  if (current.items.length > 0 || current.header) sections.push(current)
  return sections
}

function ReportOutlineMenu({ sections }: { sections: Array<{ header: string; anchorId: string; headerLevel: number }> }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setOpen(false), [sections])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const scrollToSection = (anchorId: string) => {
    const el = document.getElementById(anchorId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOpen(false)
  }

  if (sections.length === 0) return null

  return (
    <div ref={menuRef} class={`np-outline-menu ${open ? 'np-outline-menu-open' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        class={open ? 'np-history-toggle-active' : ''}
        title="Headlines"
        aria-label="Headlines"
        aria-expanded={open}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div class="np-outline-panel">
          <div class="np-outline-panel-head">
            <span aria-hidden="true" class="np-outline-close-spacer" />
            <div class="np-outline-panel-title">Headlines</div>
            <button
              type="button"
              class="np-outline-close"
              onClick={() => setOpen(false)}
              aria-label="Close headlines"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div class="np-outline-list">
            {sections.map((section) => (
              <button
                key={section.anchorId}
                type="button"
                onClick={() => scrollToSection(section.anchorId)}
                class={`np-outline-item np-outline-item-level-${Math.min(section.headerLevel, 3)}`}
              >
                {section.header}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
type TextFragment =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; entries: string[] }
  | { type: 'spacer' }
type ArticleTile =
  | { type: 'text'; fragments: TextFragment[]; charCount: number; lead: boolean }
  | { type: 'item'; item?: TimelineItem }
type ArticlePackageKind = 'lead' | 'feature' | 'standard' | 'brief'

function parseBoldText(text: string): preact.ComponentChildren[] {
  const parts: preact.ComponentChildren[] = []
  const regex = /\*\*(.+?)\*\*/g
  let last = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    last = regex.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function parseCssLength(value: string, fallback: number) {
  const trimmed = value.trim()
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric)) return fallback
  if (trimmed.endsWith('rem')) {
    const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
    return numeric * rootFontSize
  }
  return numeric
}

function splitParagraphForTiles(text: string) {
  const trimmed = text.trim()
  if (trimmed.length <= 260) return [text]

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length <= 1) return [text]

  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > 260 && current) {
      parts.push(current)
      current = sentence
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts.length > 1 ? parts : [text]
}

function buildArticleTiles(items: SectionItem[]) {
  const tiles: ArticleTile[] = []
  let fragments: TextFragment[] = []
  let charCount = 0
  let paragraphCount = 0
  let leadAssigned = false

  const flushText = () => {
    if (fragments.length === 0) return
    while (fragments[fragments.length - 1]?.type === 'spacer') fragments.pop()
    if (fragments.length === 0) return
    tiles.push({ type: 'text', fragments, charCount, lead: !leadAssigned })
    leadAssigned = true
    fragments = []
    charCount = 0
    paragraphCount = 0
  }

  for (let ii = 0; ii < items.length; ii++) {
    const item = items[ii]
    if (item.type === 'item') {
      flushText()
      tiles.push({ type: 'item', item: item.item })
      continue
    }

    const line = item.line.trim()
    if (!line) {
      if (fragments.length > 0 && fragments[fragments.length - 1]?.type !== 'spacer') {
        fragments.push({ type: 'spacer' })
      }
      continue
    }

    const unordered = item.line.match(/^[-*]\s+(.*)/)
    const ordered = item.line.match(/^\d+\.\s+(.*)/)
    if (unordered || ordered) {
      const orderedList = !!ordered
      const entries: string[] = []
      for (; ii < items.length; ii++) {
        const next = items[ii]
        if (next.type !== 'text') {
          ii--
          break
        }
        const match = orderedList
          ? next.line.match(/^\d+\.\s+(.*)/)
          : next.line.match(/^[-*]\s+(.*)/)
        if (!match) {
          ii--
          break
        }
        entries.push(match[1])
      }
      fragments.push({ type: 'list', ordered: orderedList, entries })
      charCount += entries.reduce((total, entry) => total + entry.length, 0)
      paragraphCount += entries.length
      if (charCount >= 420 || paragraphCount >= 4) flushText()
      continue
    }

    for (const paragraph of splitParagraphForTiles(item.line)) {
      fragments.push({ type: 'paragraph', text: paragraph })
      charCount += paragraph.trim().length
      paragraphCount += 1
      if (charCount >= 420 || paragraphCount >= 3) flushText()
    }
  }

  flushText()
  return tiles
}

function arrangeArticleTiles(tiles: ArticleTile[]) {
  const textTiles = tiles.filter((tile): tile is Extract<ArticleTile, { type: 'text' }> => tile.type === 'text')
  const itemTiles = tiles.filter((tile): tile is Extract<ArticleTile, { type: 'item' }> => tile.type === 'item')
  const arranged: ArticleTile[] = []

  if (textTiles.length > 0) arranged.push(textTiles.shift()!)
  if (itemTiles.length > 0) arranged.push(itemTiles.shift()!)
  if (textTiles.length > 0) arranged.push(textTiles.shift()!)
  if (itemTiles.length > 0) arranged.push(itemTiles.shift()!)

  while (textTiles.length > 0 || itemTiles.length > 0) {
    if (itemTiles.length > textTiles.length && itemTiles.length > 0) arranged.push(itemTiles.shift()!)
    if (textTiles.length > 0) arranged.push(textTiles.shift()!)
    if (itemTiles.length > 0) arranged.push(itemTiles.shift()!)
    if (itemTiles.length > textTiles.length && itemTiles.length > 0) arranged.push(itemTiles.shift()!)
  }

  return arranged
}

function estimateArticleTileWeight(tile: ArticleTile) {
  if (tile.type === 'item') return 6
  const listWeight = tile.fragments.some((fragment) => fragment.type === 'list') ? 2 : 0
  const paragraphWeight = Math.ceil(tile.charCount / 180)
  return Math.max(2, paragraphWeight + listWeight + (tile.lead ? 1 : 0))
}

function distributeArticleTiles(tiles: ArticleTile[], columnCount: number, measuredHeights: Map<number, number>) {
  const columns = Array.from({ length: columnCount }, () => ({ tiles: [] as Array<{ tile: ArticleTile; index: number }>, weight: 0 }))
  for (const [index, tile] of tiles.entries()) {
    let target = 0
    for (let index = 1; index < columns.length; index++) {
      if (columns[index].weight < columns[target].weight) target = index
    }
    columns[target].tiles.push({ tile, index })
    columns[target].weight += measuredHeights.get(index) ?? estimateArticleTileWeight(tile) * 56
  }
  return columns.map((column) => column.tiles)
}

function getArticlePackageKind(items: SectionItem[], index: number): ArticlePackageKind {
  const itemCount = items.filter((item) => item.type === 'item').length
  const textLength = items.reduce((total, item) => total + (item.type === 'text' ? item.line.trim().length : 0), 0)
  const contentWeight = textLength + itemCount * 360

  if (index === 0) return 'lead'
  if (contentWeight >= 1700 || itemCount >= 4 || textLength > 1050) return 'feature'
  if (contentWeight >= 780 || itemCount >= 2 || textLength > 520) return 'standard'
  return 'brief'
}

function renderTextTileFragments(fragments: TextFragment[], lead: boolean, prefix: string) {
  let dropCapPending = lead
  return fragments.map((fragment, index) => {
    if (fragment.type === 'spacer') return <div key={`${prefix}s-${index}`} class="np-text-fragment np-text-spacer" />
    if (fragment.type === 'list') {
      return fragment.ordered ? (
        <ol key={`${prefix}ol-${index}`} class="np-text-fragment np-text-list list-decimal">
          {fragment.entries.map((entry, li) => <li key={`${prefix}ol-${index}-${li}`}>{parseBoldText(entry)}</li>)}
        </ol>
      ) : (
        <ul key={`${prefix}ul-${index}`} class="np-text-fragment np-text-list list-disc">
          {fragment.entries.map((entry, li) => <li key={`${prefix}ul-${index}-${li}`}>{parseBoldText(entry)}</li>)}
        </ul>
      )
    }
    const className = dropCapPending ? 'np-text-fragment np-text-paragraph np-dropcap' : 'np-text-fragment np-text-paragraph'
    dropCapPending = false
    return <p key={`${prefix}p-${index}`} class={className}>{parseBoldText(fragment.text)}</p>
  })
}

function NewspaperArticleLayout({ items, prefix }: { items: SectionItem[]; prefix: string }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(1)
  const tileHeightsRef = useRef(new Map<number, number>())
  const [measuredVersion, setMeasuredVersion] = useState(0)
  const tiles = useMemo(() => arrangeArticleTiles(buildArticleTiles(items)), [items])

  useLayoutEffect(() => {
    const node = gridRef.current
    if (!node) return
    let frame = 0

    const updateColumns = () => {
      frame = 0
      const styles = window.getComputedStyle(node)
      const gap = parseCssLength(styles.getPropertyValue('--np-grid-gap-x'), 18)
      const minWidth = parseCssLength(styles.getPropertyValue('--np-article-column-min'), 17 * 16)
      const width = node.getBoundingClientRect().width
      const next = Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
      setColumnCount((prev) => (prev === next ? prev : next))
    }

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateColumns)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useLayoutEffect(() => {
    const node = gridRef.current
    if (!node) return

    tileHeightsRef.current = new Map(
      [...tileHeightsRef.current].filter(([index]) => index < tiles.length),
    )

    let frame = 0
    const observer = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const target = entry.target as HTMLElement
        const tileIndex = Number.parseInt(target.dataset.tileIndex || '', 10)
        if (!Number.isFinite(tileIndex)) continue
        const nextHeight = Math.ceil(entry.contentRect.height)
        const prevHeight = tileHeightsRef.current.get(tileIndex)
        if (prevHeight === nextHeight) continue
        tileHeightsRef.current.set(tileIndex, nextHeight)
        changed = true
      }
      if (!changed || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setMeasuredVersion((prev) => prev + 1)
      })
    })

    const tileNodes = node.querySelectorAll<HTMLElement>('[data-tile-index]')
    tileNodes.forEach((tileNode) => observer.observe(tileNode))

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [tiles, columnCount])

  const columns = useMemo(
    () => distributeArticleTiles(tiles, columnCount, tileHeightsRef.current),
    [tiles, columnCount, measuredVersion],
  )

  const renderTile = (tile: ArticleTile, key: string, tileIndex: number) => {
    if (tile.type === 'item') {
      return tile.item ? (
        <div key={key} class="np-grid-tile np-grid-tile-tweet" data-tile-index={tileIndex}>
          {tile.item.provider === 'x'
            ? <TweetCard tweet={tile.item.payload} expandBehavior="detail" />
            : <RedditCard item={tile.item} />}
        </div>
      ) : (
        <div key={key} class="np-grid-tile np-grid-tile-fallback" data-tile-index={tileIndex}>
          <div class="np-tweet">Referenced post is no longer available</div>
        </div>
      )
    }

    return (
      <div key={key} class="np-grid-tile np-grid-tile-text" data-tile-index={tileIndex}>
        <div class="np-text-tile">
          {renderTextTileFragments(tile.fragments, tile.lead, `${key}-`)}
        </div>
      </div>
    )
  }

  return (
    <div ref={gridRef} class="np-article-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
      {columns.map((column, columnIndex) => (
        <div key={`${prefix}c-${columnIndex}`} class="np-article-grid-column">
          {column.map(({ tile, index }) => renderTile(tile, `${prefix}${index}`, index))}
        </div>
      ))}
    </div>
  )
}

function NewspaperContent({ text, refItems, reportDate, itemCount: totalItemCount, issueNumber, leftControls, controls, historyPanel, showMasthead = true }: {
  text: string
  refItems: Map<string, TimelineItem>
  reportDate: string
  itemCount: number
  issueNumber: number
  leftControls?: preact.ComponentChildren
  controls?: preact.ComponentChildren
  historyPanel?: preact.ComponentChildren
  showMasthead?: boolean
}) {
  const sections = useMemo(() => parseReportSections(text, refItems), [text, refItems])

  const articles = sections.filter((s) => s.header)
  const renderArticlePackage = (
    article: (typeof articles)[number],
    index: number,
  ) => {
    const packageKind = getArticlePackageKind(article.items, index)
    return (
      <article key={article.anchorId || index} id={article.anchorId} class={`np-article np-article-${packageKind} np-report-article`}>
        <div class={`np-article-header np-section-header ${index === 0 ? 'np-section-header-lg' : article.headerLevel <= 2 ? 'np-section-header-md' : 'np-section-header-sm'}`}>
          {article.header}
        </div>
        <div class="np-body">
          <NewspaperArticleLayout items={article.items} prefix={`${index}-`} />
        </div>
      </article>
    )
  }
  const [leadArticle, ...tiledArticles] = articles

  const d = new Date(reportDate)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div>
      {showMasthead && (
        <>
          <div class="np-masthead">
            <Link href="/" class="np-masthead-title np-masthead-home">
              The Daily Omens
            </Link>
            <div class="np-masthead-subrow">
              {leftControls ? (
                <div class="np-masthead-left-controls">
                  {leftControls}
                </div>
              ) : (
                <div aria-hidden="true" />
              )}
              <div class="np-masthead-sub">Your AI-Curated {d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Afternoon' : 'Evening'} Briefing</div>
              {controls ? (
                <div class="np-masthead-controls">
                  {controls}
                </div>
              ) : (
                <div aria-hidden="true" />
              )}
            </div>
            <div class="np-masthead-rule" />
            <div class="np-masthead-meta">
              <span>{dateStr}</span>
              <span>No. {issueNumber}</span>
              <span>{totalItemCount} sources &middot; {timeStr}</span>
            </div>
          </div>
          {historyPanel}
        </>
      )}

      {leadArticle ? (
        <div class="np-page-grid">
          {renderArticlePackage(leadArticle, 0)}
        </div>
      ) : null}

      {tiledArticles.length > 0 ? (
        <div class="np-article-masonry">
          {tiledArticles.map((article, index) => (
            <div key={index + 1} class="np-article-masonry-item">
              {renderArticlePackage(article, index + 1)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ElapsedTime({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.floor((now - since) / 1000)
  return <span class="np-copy-muted text-xs tabular-nums">{Math.floor(s / 60)}:{(s % 60).toString().padStart(2, '0')}</span>
}

function getBriefingLabel(date: Date) {
  return `Your AI-Curated ${date.getHours() < 12 ? 'Morning' : date.getHours() < 17 ? 'Afternoon' : 'Evening'} Briefing`
}

export function NewspaperReportPage({
  text,
  refItems,
  reportDate,
  itemCount,
  issueNumber,
  showIssueNumber = true,
  leftControls,
  rightControls,
  historyPanel,
  preContent,
  postContent,
}: {
  text: string
  refItems: Map<string, TimelineItem>
  reportDate: string
  itemCount: number
  issueNumber: number
  showIssueNumber?: boolean
  leftControls?: preact.ComponentChildren
  rightControls?: preact.ComponentChildren
  historyPanel?: preact.ComponentChildren
  preContent?: preact.ComponentChildren
  postContent?: preact.ComponentChildren
}) {
  const date = new Date(reportDate)
  const outlineSections = useMemo(
    () => parseReportSections(text, refItems)
      .filter((section): section is ParsedReportSection & { header: string; anchorId: string } => !!section.header && !!section.anchorId)
      .map((section) => ({ header: section.header, anchorId: section.anchorId, headerLevel: section.headerLevel })),
    [text, refItems],
  )
  const metaRow = (
    <div class="np-masthead-meta">
      <span class="np-meta-with-outline">
        <ReportOutlineMenu sections={outlineSections} />
        <span>{date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </span>
      {showIssueNumber && <span>No. {issueNumber}</span>}
      <span>{itemCount} sources &middot; {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    </div>
  )

  return (
    <NewspaperShell
      leftControls={leftControls}
      rightControls={rightControls}
      metaRow={metaRow}
      subtitle={getBriefingLabel(date)}
    >
      {historyPanel}
      {preContent}
      <NewspaperContent
        text={text}
        refItems={refItems}
        reportDate={reportDate}
        itemCount={itemCount}
        issueNumber={issueNumber}
        showMasthead={false}
      />
      {postContent}
    </NewspaperShell>
  )
}

function FirstReportPlaceholder({
  feedName,
  issueNumber,
  genStatus,
  genStartedAt,
  leftControls,
  rightControls,
  reportTabs,
  error,
}: {
  feedName: string
  issueNumber: number
  genStatus: string
  genStartedAt: number
  leftControls?: preact.ComponentChildren
  rightControls?: preact.ComponentChildren
  reportTabs?: preact.ComponentChildren
  error?: string | null
}) {
  const now = new Date()
  const metaRow = (
    <div class="np-masthead-meta">
      <span>{now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      <span>No. {issueNumber}</span>
      <span>First edition in progress</span>
    </div>
  )

  return (
    <NewspaperShell
      leftControls={leftControls}
      rightControls={rightControls}
      metaRow={metaRow}
      subtitle={getBriefingLabel(now)}
    >
      {reportTabs}
      {error && <p class="np-alert np-alert-error text-center mb-3">{error}</p>}
      <div class="np-page-grid">
        <article class="np-article np-article-lead np-first-report-card">
          <div class="np-first-report-hero">
            <div class="np-first-report-kicker">First Edition In Progress</div>
            <h1 class="np-first-report-title">The presses are warming up for {feedName}</h1>
            <p class="np-first-report-copy">
              Omens is reviewing the latest posts, pulling out the strongest signals, and laying out a front page that reads like a finished briefing instead of a raw feed.
            </p>
            <div class="np-first-report-status">
              <div class="np-status-title">
                <span class="np-status-indicator" aria-hidden="true" />
                <span class="np-status-label">{genStatus}</span>
              </div>
              {genStartedAt > 0 && (
                <div class="np-status-meta">
                  <ElapsedTime since={genStartedAt} />
                </div>
              )}
            </div>
          </div>

          <div class="np-first-report-steps">
            <section class="np-first-report-step">
              <div class="np-first-report-step-number">01</div>
              <h2>Sort the signal</h2>
              <p>Fresh posts are grouped, deduped, and ranked so the edition starts with what matters instead of what is merely loud.</p>
            </section>
            <section class="np-first-report-step">
              <div class="np-first-report-step-number">02</div>
              <h2>Find the shape</h2>
              <p>Omens clusters related items into storylines, tension points, and conversation shifts that are worth carrying into the report.</p>
            </section>
            <section class="np-first-report-step">
              <div class="np-first-report-step-number">03</div>
              <h2>Set the front page</h2>
              <p>The issue is drafted into a readable briefing with headlines, context, and citations back to the underlying posts.</p>
            </section>
          </div>
        </article>
      </div>
    </NewspaperShell>
  )
}

function AiSetupLead({
  title,
  intro,
  current,
  error,
  onSave,
}: {
  title: string
  intro: string
  current: 'report' | 'filtered'
  error?: string | null
  onSave?: () => void
}) {
  return (
    <NewspaperShell
      leftControls={<NewspaperRouteControls current={current} />}
      showMeta={false}
    >
      <FeedLeadArticle>
        <SetupStateBlock
          kicker="AI Setup"
          title={title}
          intro={intro}
          steps={[
            {
              label: 'Source connected',
              detail: 'Omens already has access to your feed.',
              state: 'done',
            },
            {
              label: 'Bring your own AI',
              detail: 'Add a provider, model, and API key so Omens can score posts and write your edition.',
              state: 'active',
            },
            {
              label: 'Generate and tune',
              detail: 'After setup, filtered feed, daily reports, and nudges all become available.',
              state: 'pending',
            },
          ]}
        >
          {error && <p class="np-alert np-alert-error">{error}</p>}
          <AiSection onSave={onSave} />
        </SetupStateBlock>
      </FeedLeadArticle>
    </NewspaperShell>
  )
}

function AiReportView({ demo }: { demo?: boolean } = {}) {
  const prefix = demo ? '/demo' : '/ai'
  const { data: settings, loading: settingsLoading, error: settingsError, refetch: refetchSettings } = useApi<{ configured: boolean; reportIntervalHours?: number; reportAtHour?: number; nextReportAt?: number | null }>(demo ? null : '/ai/settings')
  const aiConfigured = demo || !!settings?.configured
  const { feeds, selectedFeed, selectedFeedId, setSelectedFeedId, loading: feedsLoading } = useScoringFeeds(aiConfigured)
  const reportPath = demo ? `${prefix}/report` : (selectedFeedId ? withFeedId(`${prefix}/report`, selectedFeedId) : null)
  const reportsPath = demo ? `${prefix}/reports` : (selectedFeedId ? withFeedId(`${prefix}/reports`, selectedFeedId) : null)
  const { data, loading, refetch } = useApi<{ report: AiReportData | null }>(reportPath)
  const { data: pastData } = useApi<{ reports: Array<{ id: string; model: string; itemCount: number; createdAt: string; feedId: string }> }>(reportsPath)
  useNewspaperActive()
  const [generating, setGenerating] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [streamItems, setStreamItems] = useState<Map<string, TimelineItem>>(new Map())
  const [genStatus, setGenStatus] = useState('Generating...')
  const [genStartedAt, setGenStartedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [viewingReportId, setViewingReportId] = useState<string | null>(null)
  const [viewingReport, setViewingReport] = useState<AiReportData | null>(null)
  const [showPastReports, setShowPastReports] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [switchingFeeds, setSwitchingFeeds] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const refetchRef = useRef(refetch)
  const streamRetryTimerRef = useRef<number | null>(null)
  const streamRetryCountRef = useRef(0)
  const connectStreamRef = useRef<() => void>(() => {})
  refetchRef.current = refetch

  /** Connect to SSE stream and accumulate content */
  const unmountingRef = useRef(false)
  useEffect(() => {
    const onUnload = () => { unmountingRef.current = true; abortRef.current?.abort() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])
  const clearStreamRetry = useCallback(() => {
    if (streamRetryTimerRef.current !== null) {
      window.clearTimeout(streamRetryTimerRef.current)
      streamRetryTimerRef.current = null
    }
  }, [])
  useEffect(() => () => clearStreamRetry(), [clearStreamRetry])
  const connectStream = useCallback(() => {
    clearStreamRetry()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const statusPath = demo ? '/ai/report-status' : withFeedId('/ai/report-status', selectedFeedId)
    const streamUrl = `${API_BASE}${demo ? '/ai/report-stream' : withFeedId('/ai/report-stream', selectedFeedId)}`

    const recoverStream = async (fallbackMessage: string) => {
      if (controller.signal.aborted || unmountingRef.current) return
      try {
        const status = await api<{ generating: boolean; itemCount: number; status: string | null; startedAt: string | null; error: string | null }>(statusPath)
        if (controller.signal.aborted || unmountingRef.current) return

        if (status.error) {
          setGenerating(false)
          setStreamContent('')
          setError(status.error)
          return
        }

        if (!status.generating) {
          setGenerating(false)
          setStreamContent('')
          refetchRef.current()
          return
        }

        setGenerating(true)
        if (status.status) setGenStatus(status.status)
        if (status.startedAt) setGenStartedAt(new Date(status.startedAt).getTime())

        const delay = Math.min(1000 * (2 ** streamRetryCountRef.current), 5000)
        streamRetryCountRef.current += 1
        streamRetryTimerRef.current = window.setTimeout(() => {
          streamRetryTimerRef.current = null
          connectStreamRef.current()
        }, delay)
      } catch (e) {
        if (controller.signal.aborted || unmountingRef.current) return
        setGenerating(false)
        setStreamContent('')
        setError(e instanceof Error ? e.message : fallbackMessage)
      }
    }

    fetch(streamUrl, { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Report stream failed (${res.status})`)
        const reader = res.body?.getReader()
        if (!reader) {
          await recoverStream('Connection lost during report generation')
          return
        }
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
            streamRetryCountRef.current = 0
            const data = line.slice(6)
            if (data === '[DONE]') {
              completed = true
              clearStreamRetry()
              setGenerating(false)
              setStreamContent('')
              refetchRef.current()
              return
            }
            if (data.startsWith('[ERROR]')) {
              completed = true
              clearStreamRetry()
              setGenerating(false)
              setStreamContent('')
              setError(data.slice(8))
              return
            }
            try {
              const json = JSON.parse(data)
              if (json.items) {
                const map = new Map<string, TimelineItem>()
                for (const item of json.items) map.set(item.id, item)
                setStreamItems(map)
              }
              if (json.status) setGenStatus(json.status)
              if (json.content) setStreamContent(json.content)
              else if (json.chunk) setStreamContent((prev) => prev + json.chunk)
            } catch {}
          }
        }
        // Stream ended without [DONE] or [ERROR] — connection was cut short
        if (!completed && !controller.signal.aborted && !unmountingRef.current) {
          await recoverStream('Connection lost during report generation')
        }
      })
      .catch(async (e) => {
        if (controller.signal.aborted || unmountingRef.current) return
        if (e instanceof Error && e.name === 'AbortError') return
        await recoverStream(e instanceof Error ? e.message : 'Connection lost during report generation')
      })
  }, [clearStreamRetry, demo, selectedFeedId])
  connectStreamRef.current = connectStream

  // Check if report is already generating on mount
  useEffect(() => {
    if (demo) return
    if (!selectedFeedId) return
    api<{ generating: boolean; itemCount: number; status: string | null; startedAt: string | null; error: string | null }>(withFeedId('/ai/report-status', selectedFeedId))
      .then((s) => {
        if (s.error) { setError(s.error); return }
        if (s.generating) {
          setGenerating(true)
          setGenStatus(s.status || 'Generating...')
          setGenStartedAt(s.startedAt ? new Date(s.startedAt).getTime() : Date.now())
          streamRetryCountRef.current = 0
          connectStream()
        }
      })
      .catch(() => {})
    return () => {
      unmountingRef.current = true
      clearStreamRetry()
      abortRef.current?.abort()
    }
  }, [clearStreamRetry, connectStream, demo, selectedFeedId])

  const generate = async () => {
    setGenerating(true)
    setStreamContent('')
    setStreamItems(new Map())
    setGenStatus('Starting...')
    setGenStartedAt(Date.now())
    setError(null)
    streamRetryCountRef.current = 0
    clearStreamRetry()
    try {
      await api(withFeedId('/ai/report', selectedFeedId), { method: 'POST' })
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
      const res = await api<{ report: AiReportData }>(`${prefix}/report/${id}`)
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

  useEffect(() => {
    setViewingReportId(null)
    setViewingReport(null)
    setShowPastReports(false)
    setHistoryPage(1)
    setError(null)
    setStreamContent('')
    setStreamItems(new Map())
    if (!demo && selectedFeedId) setSwitchingFeeds(true)
  }, [selectedFeedId])

  useEffect(() => {
    if (!switchingFeeds) return
    if (loading) return
    setSwitchingFeeds(false)
  }, [loading, switchingFeeds])

  if ((!demo && (settingsLoading || (aiConfigured && (feedsLoading || !selectedFeedId)))) || loading || switchingFeeds) {
    return (
      <NewspaperShell
        leftControls={<NewspaperRouteControls current="report" showSettings={!demo} />}
        showMeta={false}
      >
        <div class="min-h-[18rem]">
          <Spinner />
        </div>
      </NewspaperShell>
    )
  }
  if (!demo && !settings?.configured) {
    return (
      <AiSetupLead
        current="report"
        title="Add an AI provider to publish your briefing"
        intro="Your sources are connected. Omens still needs your own AI provider and model before it can draft daily reports."
        error={settingsError}
        onSave={refetchSettings}
      />
    )
  }

  const activeReport = viewingReportId ? viewingReport : data?.report
  const reportTabs = !demo && feeds.length > 1 ? (
    <FeedTabs
      feeds={feeds}
      selectedFeedId={selectedFeedId}
      onSelect={setSelectedFeedId}
      className="mb-3"
    />
  ) : null
  const refItemMap = new Map<string, TimelineItem>()
  if (activeReport?.refItems) {
    for (const item of activeReport.refItems) refItemMap.set(item.id, item)
  }
  const reportIssueNumber = activeReport
    ? (pastData ? pastData.reports.length - (pastData.reports.findIndex((r) => r.id === (viewingReportId || activeReport.id))) : 1)
    : 1
  const historyPanel = showPastReports && pastData ? (() => {
    const PAGE_SIZE = 5
    const reports = pastData.reports
    const totalPages = Math.ceil(reports.length / PAGE_SIZE)
    const visible = reports.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE)
    return (
      <div class="np-history-panel">
        <div class="np-history-list">
          {visible.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => viewPastReport(r.id)}
              class={`np-history-item ${viewingReportId === r.id ? 'np-history-item-active' : ''}`}
            >
              <div class="np-history-row">
                <span class="np-history-time">{new Date(r.createdAt).toLocaleString()}</span>
                <span class="np-history-count">{r.itemCount} posts</span>
              </div>
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div class="np-history-pager">
            <button type="button" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage <= 1}
              class="np-link-muted text-xs disabled:opacity-30">Prev</button>
            <span class="np-history-page">{historyPage}/{totalPages}</span>
            <button type="button" onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))} disabled={historyPage >= totalPages}
              class="np-link-muted text-xs disabled:opacity-30">Next</button>
          </div>
        )}
      </div>
    )
  })() : null
  const newspaperControls = activeReport ? (
    <>
      <CopyShareButton url={`${window.location.origin}/report/${viewingReportId || activeReport.id}`} iconOnly />
      {pastData && pastData.reports.length > 1 && (
        <button type="button" onClick={() => setShowPastReports(!showPastReports)}
          class={showPastReports ? 'np-history-toggle-active' : ''}
          title="Report history">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
      {viewingReportId && (
        <button type="button" onClick={backToLatest} title="Back to latest">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      )}
      {!demo && <button
        type="button"
        onClick={generate}
        disabled={generating}
        title={generating ? 'Generating...' : 'Generate new report'}
      >
        <svg class={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>}
    </>
  ) : null
  const newspaperLeftControls = <NewspaperRouteControls current="report" showSettings={!demo} />
  const renderGenerationPanel = () => (
    <div class="np-status-panel">
      <div class="np-status-head">
        <div class="np-status-title">
          <span class="np-status-indicator" aria-hidden="true" />
          <span class="np-status-label">{genStatus}</span>
        </div>
        {genStartedAt > 0 && (
          <div class="np-status-meta">
            <ElapsedTime since={genStartedAt} />
          </div>
        )}
      </div>
    </div>
  )

  if (generating && !activeReport) {
    if (streamContent) {
      return (
        <NewspaperReportPage
          text={streamContent}
          refItems={streamItems}
          reportDate={new Date().toISOString()}
          itemCount={streamItems.size}
          issueNumber={(pastData?.reports.length || 0) + 1}
          leftControls={newspaperLeftControls}
          rightControls={newspaperControls}
          preContent={
            <>
              {reportTabs}
              {error && <p class="np-alert np-alert-error text-center mb-3">{error}</p>}
              {renderGenerationPanel()}
            </>
          }
        />
      )
    }

    return (
      <FirstReportPlaceholder
        feedName={selectedFeed?.name || 'this feed'}
        issueNumber={(pastData?.reports.length || 0) + 1}
        genStatus={genStatus}
        genStartedAt={genStartedAt}
        leftControls={newspaperLeftControls}
        rightControls={newspaperControls}
        reportTabs={reportTabs}
        error={error}
      />
    )
  }

  return (
    <div>
      {error && <p class="np-alert np-alert-error text-center mb-3">{error}</p>}

      {activeReport && (
        <NewspaperReportPage
          text={activeReport.content}
          refItems={refItemMap}
          reportDate={activeReport.createdAt}
          itemCount={activeReport.itemCount}
          issueNumber={reportIssueNumber}
          leftControls={newspaperLeftControls}
          rightControls={newspaperControls}
          historyPanel={historyPanel}
          preContent={
            <>
              {reportTabs}
              {generating ? renderGenerationPanel() : null}
            </>
          }
        />
      )}

      {!activeReport && !generating && (
        <NewspaperShell
          leftControls={newspaperLeftControls}
          rightControls={newspaperControls}
          showMeta={false}
        >
          {reportTabs}
          <div class="np-page-grid">
            <article class="np-article np-article-lead">
              <div class="flex flex-col items-center justify-center py-24">
                <svg class="np-empty-icon w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                {demo ? (
                  <p class="np-empty-copy">No reports available yet.</p>
                ) : (
                  <>
                    <p class="np-empty-copy mb-4">Generate an AI report for {selectedFeed?.name || 'this feed'} from your last 24 hours of posts</p>
                    <button
                      type="button"
                      onClick={generate}
                      disabled={generating}
                      class="np-button np-button-primary disabled:opacity-50"
                    >
                      Generate report
                    </button>
                  </>
                )}
              </div>
            </article>
          </div>
        </NewspaperShell>
      )}
    </div>
  )
}

// === Load More + End of Feed ===

const FEED_LIMIT = 50

function renderTimelineFeedItem(item: TimelineItem, nudges: Map<string, 'up' | 'down'>, onNudge?: (id: string, direction: 'up' | 'down') => void, minScore?: number) {
  if (item.provider === 'x') {
    return (
      <TweetCard
        tweet={item.payload}
        nudge={nudges.get(item.id) || null}
        onNudge={onNudge}
        score={item.score}
        minScore={minScore}
      />
    )
  }

  return (
    <RedditCard
      item={item}
      nudge={nudges.get(item.id) || null}
      onNudge={onNudge}
      score={item.score}
      minScore={minScore}
    />
  )
}

function usePaginatedFeed<T extends { id: string }>(url: string | null, resetKey: number) {
  const [allItems, setAllItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(!!url)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (p: number, reset: boolean) => {
    if (!url) {
      setLoading(false)
      setLoadingMore(false)
      return
    }
    if (reset) { setLoading(true); setError(null) }
    else setLoadingMore(true)
    try {
      const res = await api<FeedResponse<T>>(`${url}${url.includes('?') ? '&' : '?'}limit=${FEED_LIMIT}&page=${p}`)
      const newData = res.data
      setAllItems(prev => {
        if (reset) return newData
        const ids = new Set(prev.map((item) => item.id))
        const unique = newData.filter((item) => !ids.has(item.id))
        return [...prev, ...unique]
      })
      // If a "load more" page returned no new data, we've exhausted the feed
      if (!reset && newData.length < FEED_LIMIT) {
        setTotal(prev => Math.min(prev, (p - 1) * FEED_LIMIT + newData.length))
      } else {
        setTotal(res.pagination.total)
      }
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [url])

  useEffect(() => {
    setAllItems([])
    setPage(1)
    setTotal(0)
    setError(null)
    setLoading(!!url)
    setLoadingMore(false)
  }, [url, resetKey])

  useEffect(() => {
    if (!url) return
    loadPage(1, true)
  }, [resetKey, loadPage, url])

  const remaining = Math.max(0, total - allItems.length)
  const loadMore = useCallback(() => loadPage(page + 1, false), [loadPage, page])

  return { allItems, loading, loadingMore, error, remaining, loadMore }
}

// === Exported Pages ===

export function AiReportPage({ demo }: { demo?: boolean } = {}) {
  return <AiReportView demo={demo} />
}

function useAiSettings(demo?: boolean): { minScore: number; configured: boolean; loading: boolean; error: string | null } {
  const { data, loading, error } = useApi<{ configured: boolean; minScore?: number }>(demo ? null : '/ai/settings')
  if (demo) return { minScore: 50, configured: true, loading: false, error: null }
  return { minScore: data?.minScore ?? 50, configured: data?.configured ?? false, loading, error }
}

export function FilteredFeed({ onRefreshRef, demo }: { onRefreshRef?: (fn: () => Promise<void>) => void; demo?: boolean }) {
  useNewspaperActive()
  const { configured: aiConfigured, loading: aiSettingsLoading, error: aiSettingsError } = useAiSettings(demo)
  const { feeds, selectedFeed, selectedFeedId, setSelectedFeedId, loading: feedsLoading } = useScoringFeeds(!demo && aiConfigured)
  const { nudges, onNudge, feedback } = useNudges(demo, selectedFeedId)
  const minScore = selectedFeed?.minScore ?? 50
  const [feedKey, setFeedKey] = useState(0) // bump to re-fetch feed
  const filteredFeedPath = demo ? '/demo/filtered-feed' : (selectedFeedId ? withFeedId('/ai/filtered-feed', selectedFeedId) : null)
  const { allItems, loading, loadingMore, error, remaining, loadMore } = usePaginatedFeed<TimelineItem | Tweet>(filteredFeedPath, feedKey)
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
    if (!selectedFeedId) return
    const poll = () => {
      api<ScoringStatus>(withFeedId('/ai/scoring-status', selectedFeedId)).then((st) => {
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
  }, [scoringPolling, scoringWasActive, selectedFeedId])

  // When polling stops with wasActive, compute new posts
  useEffect(() => {
    if (!scoringPolling && scoringWasActive && scoringData) {
      const newAbove = scoringBaseline !== null ? scoringData.aboveThreshold - scoringBaseline : 0
      if (newAbove > 0) setNewReady(newAbove)
      setScoringBaseline(null)
      setScoringWasActive(false)
    }
  }, [scoringPolling, scoringWasActive, scoringData, scoringBaseline])

  const st = scoringData
  const scoringActive = !!st && (st.active || st.pending > 0)
  const pendingCount = st?.pending ?? 0
  const scoringBatch = st?.batch ?? 0
  const scoringTotalBatches = st?.totalBatches ?? 0
  const scoringDetails = st ? { total: st.total, scored: st.scored, pending: st.pending, aboveThreshold: st.aboveThreshold } : null
  const scoringLog = st?.log ?? []

  // Check initial scoring status on mount
  useEffect(() => {
    if (!aiConfigured || demo || !selectedFeedId) return
    api<ScoringStatus>(withFeedId('/ai/scoring-status', selectedFeedId))
      .then((s) => {
        if (s.active || s.pending > 0) {
          if (s.pending > 0 && !s.active) api(withFeedId('/ai/filter', selectedFeedId), { method: 'POST' }).catch(() => {})
          setScoringPolling(true)
        }
      })
      .catch(() => {})
  }, [aiConfigured, demo, selectedFeedId])

  const refresh = useCallback(async () => {
    setFetchingPosts(true)
    try {
      await api<{ ok: boolean; count: number }>('/inputs/sync', { method: 'POST' })
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

  useEffect(() => {
    setFilterError(null)
    setShowScoringDetails(false)
    setNewReady(0)
    setScoringData(null)
    setScoringBaseline(null)
    setScoringWasActive(false)
    if (!demo && aiConfigured && selectedFeedId) setScoringPolling(true)
  }, [aiConfigured, demo, selectedFeedId])

  const feedTabs = !demo && feeds.length > 1 ? (
    <FeedTabs
      feeds={feeds}
      selectedFeedId={selectedFeedId}
      onSelect={setSelectedFeedId}
      className="mb-4"
    />
  ) : null

  const showNewPosts = () => {
    setNewReady(0)
    setScoringBaseline(null)
    setFeedKey((k) => k + 1)
  }
  const rightControls = !demo ? (
    <button
      type="button"
      onClick={refresh}
      disabled={fetchingPosts}
      title={fetchingPosts ? 'Refreshing...' : 'Refresh filtered feed'}
    >
      <svg class={`w-3.5 h-3.5 ${fetchingPosts ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  ) : null

  if (!demo && !aiSettingsLoading && !loading && !aiConfigured) {
    return (
      <AiSetupLead
        current="filtered"
        title="Add an AI provider to unlock the filtered feed"
        intro="Your sources are ready, but Omens needs your own AI provider to score them and decide what makes the front page."
        error={aiSettingsError}
        onSave={() => window.location.reload()}
      />
    )
  }

  return (
    <NewspaperFeedShell
      current="filtered"
      showSettings={!demo}
      rightControls={rightControls}
      toast={feedback}
      loading={aiSettingsLoading || loading || (!demo && aiConfigured && (feedsLoading || !selectedFeedId))}
      error={
        <>
          {filterError && <p class="np-alert np-alert-error text-center mb-2">{filterError}</p>}
          {error && <p class="np-alert np-alert-error text-center">{error}</p>}
        </>
      }
      hasTweets={allItems.length > 0}
      emptyState={pendingCount === 0 ? (
        <FeedLeadArticle>
          {demo ? (
            <p class="np-empty-copy py-20">No filtered posts available yet.</p>
          ) : !aiConfigured ? <AiSection onSave={() => window.location.reload()} /> : (
            <div class="flex flex-col items-center justify-center py-20">
              <p class="np-empty-copy mb-4">No posts to show yet. Fetch your feed first.</p>
              <button type="button" onClick={refresh} disabled={fetchingPosts}
                class="np-button np-button-primary disabled:opacity-50">
                {fetchingPosts ? 'Fetching...' : 'Fetch posts'}
              </button>
            </div>
          )}
        </FeedLeadArticle>
      ) : undefined}
      remaining={remaining}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    >
      {feedTabs}
      {/* Scoring progress */}
      {scoringActive && (() => {
        // Progress based on batch completion, not total scored ratio
        const pct = scoringTotalBatches > 0 ? ((scoringBatch - 1) / scoringTotalBatches) * 100 : 0
        return (
          <div class="np-status-panel">
            <div class="np-status-head">
              <div class="np-status-title">
                <span class="np-status-indicator" aria-hidden="true" />
                <span class="np-status-label">
                  {scoringTotalBatches > 0
                    ? `Scoring batch ${scoringBatch} of ${scoringTotalBatches}`
                    : 'Scoring posts...'}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="np-status-meta tabular-nums">{pendingCount} pending</span>
                <button
                  type="button"
                  class="np-status-meta hover:text-[var(--np-text)]"
                  onClick={() => setShowScoringDetails((v) => !v)}
                >
                  {showScoringDetails ? 'Hide' : 'Details'}
                </button>
              </div>
            </div>
            <div class="np-progress-track">
              <div
                class="np-progress-bar"
                style={{ width: `${pct}%` }}
              />
            </div>
            {showScoringDetails && scoringDetails && (
              <>
                <div class="np-stats-grid">
                  <span class="np-stat-label">Total posts</span>
                  <span class="np-stat-value tabular-nums">{scoringDetails.total}</span>
                  <span class="np-stat-label">Scored</span>
                  <span class="np-stat-value tabular-nums">{scoringDetails.scored}</span>
                  <span class="np-stat-label">Pending</span>
                  <span class="np-stat-value tabular-nums">{scoringDetails.pending}</span>
                  <span class="np-stat-label">Above threshold</span>
                  <span class="np-stat-value np-stat-value-accent tabular-nums">{scoringDetails.aboveThreshold}</span>
                  {scoringTotalBatches > 0 && (
                    <>
                      <span class="np-stat-label">Current batch</span>
                      <span class="np-stat-value np-stat-value-strong tabular-nums">{scoringBatch} / {scoringTotalBatches}</span>
                    </>
                  )}
                </div>
                {scoringLog.length > 0 && (
                  <div class="np-log scrollbar-dark">
                    {scoringLog.map((entry, i) => (
                      <p key={i} class="np-log-line">{entry}</p>
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
            class="np-new-pill pointer-events-auto"
          >
            Show {newReady} new post{newReady !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      <div class="feed-masonry">
        {allItems.map((item: any) => (
          <div key={item.id} class="feed-masonry-item">
            {'provider' in item
              ? renderTimelineFeedItem(item as TimelineItem, demo ? new Map() : nudges, demo ? undefined : onNudge, minScore)
              : <TweetCard tweet={item as Tweet} nudge={demo ? undefined : nudges.get(item.id) || null} onNudge={demo ? undefined : onNudge} score={(item as any).score} minScore={minScore} />}
          </div>
        ))}
      </div>
    </NewspaperFeedShell>
  )
}

export function Feed({ onRefreshRef, demo }: { onRefreshRef?: (fn: () => Promise<void>) => void; demo?: boolean }) {
  useNewspaperActive()
  const { nudges, onNudge, feedback } = useNudges(demo)
  const { minScore } = useAiSettings(demo)
  const [feedKey, setFeedKey] = useState(0)
  const { allItems, loading, loadingMore, error, remaining, loadMore } = usePaginatedFeed<TimelineItem | Tweet>(demo ? '/demo/feed' : '/feed', feedKey)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    setRefreshCount(null)
    try {
      const res = await api<{ ok: boolean; count: number }>('/inputs/sync', { method: 'POST' })
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
  const rightControls = !demo ? (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing}
      title={refreshing ? 'Refreshing...' : 'Refresh feed'}
    >
      <svg class={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  ) : null

  return (
    <NewspaperFeedShell
      current="feed"
      showSettings={!demo}
      rightControls={rightControls}
      toast={refreshCount !== null ? (refreshCount > 0 ? `+${refreshCount} posts` : 'Nothing new') : feedback}
      loading={loading}
      error={
        <>
          {refreshError && <p class="np-alert np-alert-error text-center mb-2">{refreshError}</p>}
          {error && <p class="np-alert np-alert-error text-center">{error}</p>}
        </>
      }
      hasTweets={allItems.length > 0}
      emptyState={(
        <FeedLeadArticle>
          {demo ? (
            <p class="np-empty-copy py-20">No posts available yet.</p>
          ) : (
            <div class="flex flex-col items-center justify-center py-20">
              <svg class="np-empty-icon w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
              </svg>
              <p class="np-empty-copy mb-4">No posts yet. Fetch your connected sources to get started.</p>
              <button type="button" onClick={refresh} disabled={refreshing}
                class="np-button np-button-primary disabled:opacity-50">
                {refreshing ? 'Fetching...' : 'Fetch posts'}
              </button>
            </div>
          )}
        </FeedLeadArticle>
      )}
      remaining={remaining}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    >
      <div class="feed-masonry">
        {allItems.map((item: any) => (
          <div key={item.id} class="feed-masonry-item">
            {'provider' in item
              ? renderTimelineFeedItem(item as TimelineItem, demo ? new Map() : nudges, demo ? undefined : onNudge, minScore)
              : <TweetCard tweet={item as Tweet} nudge={demo ? undefined : nudges.get(item.id) || null} onNudge={demo ? undefined : onNudge} score={(item as any).score} minScore={minScore} />}
          </div>
        ))}
      </div>
    </NewspaperFeedShell>
  )
}
