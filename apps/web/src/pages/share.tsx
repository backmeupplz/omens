import { useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'

interface SharedTweet {
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  content: string
  mediaUrls: string | null
  quotedTweet: string | null
  card: string | null
  url: string
  likes: number
  retweets: number
  replies: number
  views: number
  publishedAt: string | null
}

interface MediaItem { url: string; type: string; thumbnailUrl?: string }
interface QuotedTweet { authorName: string; authorHandle: string; authorAvatar?: string; content: string; media?: MediaItem[]; url: string; card?: { title: string; description: string | null; thumbnail: string | null; domain: string; url: string } }

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
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

export function SharePage({ handle, tweetId }: { handle: string; tweetId: string }) {
  const [tweet, setTweet] = useState<SharedTweet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ tweet: SharedTweet }>(`/tweet/${handle}/${tweetId}`)
      .then((d) => setTweet(d.tweet))
      .catch((e) => setError(e instanceof Error ? e.message : 'Tweet not found'))
      .finally(() => setLoading(false))
  }, [handle, tweetId])

  if (loading) {
    return (
      <div class="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p class="text-zinc-500 text-sm">Loading...</p>
      </div>
    )
  }

  if (error || !tweet) {
    return (
      <div class="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p class="text-zinc-400 text-sm">This post could not be found.</p>
        <a href="/" class="text-sm text-emerald-500 hover:text-emerald-400">Go to Omens</a>
      </div>
    )
  }

  let media: MediaItem[] = []
  let quoted: QuotedTweet | null = null
  let cardRaw: any = null
  try { if (tweet.mediaUrls) media = JSON.parse(tweet.mediaUrls) } catch {}
  try { if (tweet.quotedTweet) quoted = JSON.parse(tweet.quotedTweet) } catch {}
  try { if (tweet.card) cardRaw = JSON.parse(tweet.card) } catch {}
  const card = cardRaw?.title ? cardRaw : null
  const photos = media.filter((m) => m.type === 'photo')
  const videos = media.filter((m) => m.type === 'video' || m.type === 'animated_gif')

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header class="border-b border-zinc-800 px-4 py-3">
        <div class="max-w-xl mx-auto flex items-center justify-between">
          <a href="/" class="text-lg font-bold tracking-tight text-zinc-100 no-underline">Omens</a>
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener"
            class="text-xs text-zinc-500 hover:text-zinc-300 no-underline flex items-center gap-1"
          >
            View on X
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </header>

      {/* Tweet */}
      <main class="max-w-xl mx-auto px-4 py-8">
        <article class="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          {/* Author */}
          <div class="flex items-center gap-3 mb-3">
            {tweet.authorAvatar ? (
              <img src={tweet.authorAvatar} alt="" class="w-11 h-11 rounded-full bg-zinc-700" />
            ) : (
              <div class="w-11 h-11 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                {tweet.authorName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div class="font-semibold text-zinc-100">{tweet.authorName}</div>
              <div class="text-sm text-zinc-500">
                @{tweet.authorHandle}
                {tweet.authorFollowers > 0 && <span> &middot; {fmt(tweet.authorFollowers)} followers</span>}
              </div>
            </div>
          </div>

          {/* Content */}
          <p class="text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap mb-3">{tweet.content}</p>

          {/* Photos */}
          {photos.length > 0 && (
            <div class={`grid gap-1 mb-3 rounded-xl overflow-hidden ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {photos.map((p) => (
                <img key={p.url} src={p.url} alt="" class="w-full object-cover" loading="lazy" />
              ))}
            </div>
          )}

          {/* Videos */}
          {videos.map((v) => (
            <video
              key={v.url}
              src={v.url}
              poster={v.thumbnailUrl}
              controls
              preload="none"
              class="w-full rounded-xl mb-3"
            />
          ))}

          {/* Quoted tweet */}
          {quoted && (
            <a
              href={quoted.url}
              target="_blank"
              rel="noopener"
              class="block rounded-xl border border-zinc-700 p-3 mb-3 no-underline hover:border-zinc-500 transition-colors"
            >
              <div class="flex items-center gap-2 mb-1">
                {quoted.authorAvatar && <img src={quoted.authorAvatar} alt="" class="w-5 h-5 rounded-full" />}
                <span class="text-sm font-semibold text-zinc-200">{quoted.authorName}</span>
                <span class="text-xs text-zinc-500">@{quoted.authorHandle}</span>
              </div>
              <p class="text-sm text-zinc-400 line-clamp-3">{quoted.content}</p>
            </a>
          )}

          {/* Card */}
          {card && (
            <a
              href={card.url || tweet.url}
              target="_blank"
              rel="noopener"
              class="block rounded-xl border border-zinc-700 overflow-hidden mb-3 no-underline hover:border-zinc-500 transition-colors"
            >
              {card.thumbnail && <img src={card.thumbnail} alt="" class="w-full" loading="lazy" />}
              <div class="p-2.5">
                <p class="text-sm font-medium text-zinc-200 line-clamp-2">{card.title}</p>
                {card.description && <p class="text-xs text-zinc-400 mt-0.5 line-clamp-2">{card.description}</p>}
                <p class="text-xs text-zinc-500 mt-0.5">{card.domain}</p>
              </div>
            </a>
          )}

          {/* Timestamp + engagement */}
          <div class="border-t border-zinc-800 pt-3 mt-3">
            {tweet.publishedAt && (
              <p class="text-xs text-zinc-500 mb-2">
                {new Date(tweet.publishedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            )}
            <div class="flex items-center gap-5 text-sm text-zinc-400">
              {tweet.replies > 0 && <span>{fmt(tweet.replies)} replies</span>}
              {tweet.retweets > 0 && <span>{fmt(tweet.retweets)} reposts</span>}
              {tweet.likes > 0 && <span>{fmt(tweet.likes)} likes</span>}
              {tweet.views > 0 && <span>{fmt(tweet.views)} views</span>}
            </div>
          </div>
        </article>

        {/* CTA */}
        <div class="mt-6 text-center">
          <p class="text-sm text-zinc-500 mb-3">
            Shared via <a href="/" class="text-emerald-500 hover:text-emerald-400 no-underline font-medium">Omens</a> — Signal from Noise
          </p>
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener"
            class="inline-block rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 no-underline transition-colors"
          >
            View on X &rarr;
          </a>
        </div>
      </main>
    </div>
  )
}
