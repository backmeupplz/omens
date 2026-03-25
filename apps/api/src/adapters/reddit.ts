import type { RawItem } from '@omens/shared'
import type { SourceAdapter } from './types'

const USER_AGENT = 'Omens/1.0 (signal extraction; github.com/omens)'

interface RedditPost {
  kind: string
  data: {
    name: string
    title: string
    selftext: string
    url: string
    author: string
    created_utc: number
    permalink: string
    subreddit: string
    score: number
    num_comments: number
  }
}

interface RedditListing {
  data: {
    children: RedditPost[]
    after: string | null
  }
}

export const redditAdapter: SourceAdapter = {
  type: 'reddit',

  async fetch(config, since) {
    const subreddits = config.subreddits as string[]
    const sort = (config.sort as string) || 'hot'
    const limit = (config.limit as number) || 50

    const items: RawItem[] = []

    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json?limit=${limit}`

      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      })

      if (!res.ok) {
        console.error(
          `[reddit] Failed to fetch r/${sub}: ${res.status}`,
        )
        continue
      }

      const listing: RedditListing = await res.json()

      for (const post of listing.data.children) {
        const d = post.data
        const publishedAt = new Date(d.created_utc * 1000)

        if (since && publishedAt <= since) continue

        items.push({
          externalId: d.name,
          title: d.title,
          content: d.selftext || d.title,
          url: `https://reddit.com${d.permalink}`,
          author: d.author,
          publishedAt,
          sourceType: 'reddit',
          metadata: {
            subreddit: d.subreddit,
            score: d.score,
            comments: d.num_comments,
          },
        })
      }

      // Respect rate limits: 1 req per 2s
      if (subreddits.length > 1) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    return items
  },
}
