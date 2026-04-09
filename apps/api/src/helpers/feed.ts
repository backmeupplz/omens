import { type Db, tweets } from '@omens/db'
import { inArray } from 'drizzle-orm'

type FeedRow = {
  tweet: typeof tweets.$inferSelect
  score: number | null
}

export type HydratedTweet = typeof tweets.$inferSelect & {
  parentTweet: HydratedTweet | null
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))]
}

async function resolveParentTweets(db: Db, baseTweets: Array<typeof tweets.$inferSelect>) {
  const parentMap = new Map<string, typeof tweets.$inferSelect>()
  const seen = new Set<string>()
  let pending = uniqueIds(baseTweets.map((tweet) => tweet.replyToTweetId))

  while (pending.length > 0) {
    const batch = pending.filter((tweetId) => !seen.has(tweetId))
    if (batch.length === 0) break
    batch.forEach((tweetId) => seen.add(tweetId))

    const parents = await db
      .select()
      .from(tweets)
      .where(inArray(tweets.tweetId, batch))

    for (const parent of parents) {
      if (!parentMap.has(parent.tweetId)) {
        parentMap.set(parent.tweetId, parent)
      }
    }

    pending = uniqueIds(parents.map((parent) => parent.replyToTweetId))
  }

  return parentMap
}

function attachParentTweet(
  tweet: typeof tweets.$inferSelect,
  parentMap: Map<string, typeof tweets.$inferSelect>,
  cache: Map<string, HydratedTweet>,
): HydratedTweet {
  const cached = cache.get(tweet.tweetId)
  if (cached) return cached

  const parent = tweet.replyToTweetId ? parentMap.get(tweet.replyToTweetId) ?? null : null
  const hydrated: HydratedTweet = {
    ...tweet,
    parentTweet: parent ? attachParentTweet(parent, parentMap, cache) : null,
  }
  cache.set(tweet.tweetId, hydrated)
  return hydrated
}

export async function hydrateTweetsWithParents(
  db: Db,
  baseTweets: Array<typeof tweets.$inferSelect>,
): Promise<HydratedTweet[]> {
  const parentMap = await resolveParentTweets(db, baseTweets)
  const cache = new Map<string, HydratedTweet>()
  return baseTweets.map((tweet) => attachParentTweet(tweet, parentMap, cache))
}

export async function hydrateFeedRows(db: Db, rows: FeedRow[]) {
  const hydratedTweets = await hydrateTweetsWithParents(
    db,
    rows.map((row) => row.tweet),
  )

  return rows.map((row, index) => ({
    ...hydratedTweets[index],
    score: row.score,
  }))
}

export function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }
}
