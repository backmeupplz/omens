import { useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { Spinner } from '../helpers/spinner'
import { TweetCard, renderReportContent, type Tweet } from './feed'

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
        <Spinner />
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

  const tweetObj: Tweet = {
    id: tweet.tweetId,
    tweetId: tweet.tweetId,
    authorName: tweet.authorName,
    authorHandle: tweet.authorHandle,
    authorAvatar: tweet.authorAvatar,
    authorFollowers: tweet.authorFollowers,
    authorBio: null,
    content: tweet.content,
    mediaUrls: tweet.mediaUrls,
    isRetweet: null,
    card: tweet.card,
    quotedTweet: tweet.quotedTweet,
    replyToHandle: null,
    replyToTweetId: null,
    parentTweet: null,
    url: tweet.url,
    likes: tweet.likes,
    retweets: tweet.retweets,
    replies: tweet.replies,
    views: tweet.views,
    publishedAt: tweet.publishedAt || '',
  }

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <main class="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div class="max-w-lg w-full">
          <TweetCard tweet={tweetObj} embedded />
        </div>
        <div class="mt-8 text-center">
          <p class="text-sm text-zinc-500 mb-4">Your algorithm, your feed.</p>
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
  tweetRefs: string[]
  refTweets: Tweet[]
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
        <Spinner />
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

  const refTweetMap = new Map<string, Tweet>()
  for (const t of report.refTweets) refTweetMap.set(t.id, t)

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <main class="max-w-2xl mx-auto px-4 py-8">
        <article class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 sm:px-5 py-4 sm:py-5 overflow-hidden">
          <div class="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800">
            <span class="text-xs text-zinc-500">{date} &middot; {report.tweetCount} posts analyzed</span>
            <span class="text-xs font-medium text-emerald-500">Omens Report</span>
          </div>
          {renderReportContent(report.content, refTweetMap)}
        </article>

        <div class="mt-8 text-center">
          <p class="text-sm text-zinc-500 mb-4">Your algorithm, your feed.</p>
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
