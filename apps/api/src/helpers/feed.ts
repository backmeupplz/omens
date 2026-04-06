import { type Db, tweets } from '@omens/db'
import { inArray } from 'drizzle-orm'

type FeedRow = {
  tweet: typeof tweets.$inferSelect
  score: number | null
}

async function resolveParentTweets(db: Db, rows: Array<{ tweet: typeof tweets.$inferSelect }>) {
  const replyIds = rows
    .map((row) => row.tweet.replyToTweetId)
    .filter((id): id is string => !!id)

  if (replyIds.length === 0) return new Map<string, typeof tweets.$inferSelect>()

  const parents = await db
    .select()
    .from(tweets)
    .where(inArray(tweets.tweetId, replyIds))

  return new Map(parents.map((parent) => [parent.tweetId, parent]))
}

export async function hydrateFeedRows(db: Db, rows: FeedRow[]) {
  const parentMap = await resolveParentTweets(db, rows)

  return rows.map((row) => ({
    ...row.tweet,
    score: row.score,
    parentTweet: row.tweet.replyToTweetId ? parentMap.get(row.tweet.replyToTweetId) ?? null : null,
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
