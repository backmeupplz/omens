import { useEffect, useState } from 'preact/hooks'
import { api } from '../helpers/api'
import { SharePromoArticle } from '../helpers/share-promo'
import { NewspaperShell, useNewspaperActive } from '../helpers/newspaper-shell'
import { Spinner } from '../helpers/spinner'
import { NewspaperReportPage, TweetCard, type TimelineItem, type Tweet } from './feed'

export function SharePage({ handle, tweetId }: { handle: string; tweetId: string }) {
  useNewspaperActive()
  const [tweet, setTweet] = useState<Tweet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ tweet: Tweet }>(`/tweet/${handle}/${tweetId}`)
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

  return (
    <NewspaperShell showMeta={false}>
      <div class="mx-auto w-full max-w-[34rem]">
        <div>
          <div class="mx-auto w-full">
            <TweetCard tweet={tweet} embedded />
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
  itemCount: number
  itemRefs: string[]
  refItems: TimelineItem[]
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

  const refItemMap = new Map<string, TimelineItem>()
  for (const item of report.refItems) refItemMap.set(item.id, item)

  return (
    <div>
      <NewspaperReportPage
        text={report.content}
        refItems={refItemMap}
        reportDate={report.createdAt}
        itemCount={report.itemCount}
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
