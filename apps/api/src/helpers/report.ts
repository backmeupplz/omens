import { type Db, aiReports, tweets } from '@omens/db'
import { inArray } from 'drizzle-orm'
import { hydrateTweetsWithParents } from './feed'

function parseTweetRefs(tweetRefs: string | null): string[] {
  return tweetRefs ? JSON.parse(tweetRefs) : []
}

export async function hydrateReport(db: Db, report: typeof aiReports.$inferSelect) {
  const tweetRefIds = parseTweetRefs(report.tweetRefs)
  const refTweetsRaw = tweetRefIds.length > 0
    ? await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
    : []
  const refTweets = await hydrateTweetsWithParents(db, refTweetsRaw)

  return {
    id: report.id,
    content: report.content,
    model: report.model,
    tweetCount: report.tweetCount,
    tweetRefs: tweetRefIds,
    refTweets,
    createdAt: report.createdAt,
  }
}
