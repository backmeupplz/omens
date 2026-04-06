import { useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { SharePromoArticle } from '../helpers/share-promo'
import { NewspaperShell, useNewspaperActive } from '../helpers/newspaper-shell'
import { Spinner } from '../helpers/spinner'
import { NewspaperReportPage, TweetCard, type Tweet } from './feed'

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
  useNewspaperActive()
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
      <NewspaperShell showMeta={false}>
        <div class="mx-auto w-full max-w-[34rem] min-h-[18rem]">
          <Spinner />
        </div>
      </NewspaperShell>
    )
  }

  if (error || !tweet) {
    return (
      <NewspaperShell showMeta={false}>
        <div class="mx-auto w-full max-w-[34rem]">
          <article class="np-article np-article-lead">
            <div class="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <p class="np-empty-copy">This post could not be found.</p>
            </div>
          </article>
          <div class="np-page-grid np-share-promo-section">
            <SharePromoArticle />
          </div>
        </div>
      </NewspaperShell>
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
    <NewspaperShell showMeta={false}>
      <div class="mx-auto w-full max-w-[34rem]">
        <div>
          <div class="mx-auto w-full">
            <TweetCard tweet={tweetObj} embedded />
          </div>
          <div class="np-page-grid np-share-promo-section">
            <SharePromoArticle />
          </div>
        </div>
      </div>
    </NewspaperShell>
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
  useNewspaperActive()
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
      <NewspaperShell showMeta={false}>
        <div class="min-h-[18rem]">
          <Spinner />
        </div>
      </NewspaperShell>
    )
  }

  if (error || !report) {
    return (
      <NewspaperShell showMeta={false}>
        <div class="np-page-grid">
          <article class="np-article np-article-lead">
            <div class="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <p class="np-empty-copy">This report could not be found.</p>
            </div>
          </article>
          <SharePromoArticle />
        </div>
      </NewspaperShell>
    )
  }

  const refTweetMap = new Map<string, Tweet>()
  for (const t of report.refTweets) refTweetMap.set(t.id, t)

  return (
    <div>
      <NewspaperReportPage
        text={report.content}
        refTweets={refTweetMap}
        reportDate={report.createdAt}
        tweetCount={report.tweetCount}
        issueNumber={1}
        showIssueNumber={false}
        postContent={(
          <div class="np-page-grid np-share-promo-section">
            <SharePromoArticle />
          </div>
        )}
      />
    </div>
  )
}
