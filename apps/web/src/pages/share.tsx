import { useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { fmt } from '../helpers/format'
import { renderMarkdown } from '../helpers/markdown'

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
      <div class="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-100">
        <p class="text-zinc-400">This post could not be found.</p>
        <a href="/" class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium hover:bg-emerald-500 no-underline">Try Omens</a>
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
    <div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <main class="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Tweet card */}
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener"
          class="block max-w-lg w-full rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 no-underline hover:border-zinc-700 transition-colors"
        >
          {/* Author */}
          <div class="flex items-center gap-3 mb-3">
            {tweet.authorAvatar ? (
              <img src={tweet.authorAvatar} alt="" class="w-10 h-10 rounded-full bg-zinc-700" />
            ) : (
              <div class="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                {tweet.authorName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div class="font-semibold text-sm text-zinc-100">{tweet.authorName}</div>
              <div class="text-xs text-zinc-500">@{tweet.authorHandle}</div>
            </div>
            {tweet.publishedAt && (
              <span class="ml-auto text-xs text-zinc-600">
                {new Date(tweet.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Content */}
          <p class="text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap">{tweet.content}</p>

          {/* Photos */}
          {photos.length > 0 && (
            <div class={`grid gap-1 mt-3 rounded-xl overflow-hidden ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
              class="w-full rounded-xl mt-3"
              onClick={(e) => e.preventDefault()}
            />
          ))}

          {/* Quoted tweet */}
          {quoted && (
            <div class="mt-3 rounded-xl border border-zinc-700 p-3">
              <div class="flex items-center gap-2 mb-1">
                {quoted.authorAvatar && <img src={quoted.authorAvatar} alt="" class="w-4 h-4 rounded-full" />}
                <span class="text-sm font-semibold text-zinc-200">{quoted.authorName}</span>
                <span class="text-xs text-zinc-500">@{quoted.authorHandle}</span>
              </div>
              <p class="text-sm text-zinc-400 line-clamp-3">{quoted.content}</p>
            </div>
          )}

          {/* Card */}
          {card && (
            <div class="mt-3 rounded-xl border border-zinc-700 overflow-hidden">
              {card.thumbnail && <img src={card.thumbnail} alt="" class="w-full" loading="lazy" />}
              <div class="p-2.5">
                <p class="text-sm font-medium text-zinc-200 line-clamp-2">{card.title}</p>
                {card.description && <p class="text-xs text-zinc-400 mt-0.5 line-clamp-2">{card.description}</p>}
                <p class="text-xs text-zinc-500 mt-0.5">{card.domain}</p>
              </div>
            </div>
          )}

          {/* Engagement — compact */}
          {(tweet.likes > 0 || tweet.retweets > 0 || tweet.views > 0) && (
            <div class="flex items-center gap-4 mt-3 text-xs text-zinc-500">
              {tweet.likes > 0 && <span>{fmt(tweet.likes)} likes</span>}
              {tweet.retweets > 0 && <span>{fmt(tweet.retweets)} reposts</span>}
              {tweet.views > 0 && <span>{fmt(tweet.views)} views</span>}
            </div>
          )}
        </a>

        {/* Omens CTA */}
        <div class="mt-8 text-center">
          <p class="text-sm text-zinc-500 mb-4">AI-filtered X feed. Signal from noise.</p>
          <a
            href="/"
            class="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 no-underline transition-colors"
          >
            Try Omens
          </a>
        </div>
      </main>
    </div>
  )
}

// === Report Share Page ===

interface SharedReport {
  id: string
  content: string
  model: string
  tweetCount: number
  createdAt: string
}

export function ReportSharePage({ id }: { id: string }) {
  const [report, setReport] = useState<SharedReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ report: SharedReport }>(`/report/${id}/data`)
      .then((d) => setReport(d.report))
      .catch((e) => setError(e instanceof Error ? e.message : 'Report not found'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div class="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p class="text-zinc-500 text-sm">Loading...</p>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div class="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-100">
        <p class="text-zinc-400">This report could not be found.</p>
        <a href="/" class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium hover:bg-emerald-500 no-underline">Try Omens</a>
      </div>
    )
  }

  const date = new Date(report.createdAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <main class="max-w-2xl mx-auto px-4 py-8">
        <article class="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
          <div class="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
            <div>
              <span class="text-xs text-zinc-500">{date} &middot; {report.tweetCount} posts analyzed</span>
            </div>
            <span class="text-xs font-medium text-emerald-500">Omens Report</span>
          </div>
          <div>{renderMarkdown(report.content.replace(/\[\[tweet:[^\]]+\]\]/g, ''))}</div>
        </article>

        <div class="mt-8 text-center">
          <p class="text-sm text-zinc-500 mb-4">AI-filtered X feed. Signal from noise.</p>
          <a
            href="/"
            class="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 no-underline transition-colors"
          >
            Try Omens
          </a>
        </div>
      </main>
    </div>
  )
}
