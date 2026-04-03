import { Hono } from 'hono'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { aiReports, aiSettings, getDb, tweets, tweetScores, userTweets, users } from '@omens/db'
import env from '../env'
import { parsePagination } from '../helpers/http'

const demoRouter = new Hono()

let _demoUserId: string | null | undefined
async function getDemoUserId(): Promise<string | null> {
  if (!env.DEMO_USER_EMAIL) return null
  if (_demoUserId !== undefined) return _demoUserId
  const db = getDb(env.DATABASE_URL)
  const [user] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, env.DEMO_USER_EMAIL)).limit(1)
  _demoUserId = user?.id ?? null
  return _demoUserId
}

function resolveParents(result: { tweet: typeof tweets.$inferSelect }[]) {
  const replyIds = result.map((r) => r.tweet.replyToTweetId).filter((id): id is string => !!id)
  if (replyIds.length === 0) return Promise.resolve(new Map<string, typeof tweets.$inferSelect>())
  const db = getDb(env.DATABASE_URL)
  return db.select().from(tweets).where(inArray(tweets.tweetId, replyIds))
    .then((parents) => {
      const map = new Map<string, typeof tweets.$inferSelect>()
      for (const p of parents) map.set(p.tweetId, p)
      return map
    })
}

// Feed
demoRouter.get('/feed', async (c) => {
  const userId = await getDemoUserId()
  if (!userId) return c.json({ error: 'Demo not configured' }, 404)
  const db = getDb(env.DATABASE_URL)
  const { page, limit, offset } = parsePagination(c)

  const result = await db.select({ tweet: tweets, score: tweetScores.score })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .leftJoin(tweetScores, and(eq(tweetScores.tweetId, tweets.id), eq(tweetScores.userId, userId)))
    .where(eq(userTweets.userId, userId))
    .orderBy(desc(tweets.publishedAt))
    .limit(limit).offset(offset)

  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(userTweets).where(eq(userTweets.userId, userId))

  const parentMap = await resolveParents(result)

  return c.json({
    data: result.map((r) => ({
      ...r.tweet, score: r.score,
      parentTweet: r.tweet.replyToTweetId ? parentMap.get(r.tweet.replyToTweetId) ?? null : null,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  })
})

// Filtered feed
demoRouter.get('/filtered-feed', async (c) => {
  const userId = await getDemoUserId()
  if (!userId) return c.json({ error: 'Demo not configured' }, 404)
  const db = getDb(env.DATABASE_URL)
  const { page, limit, offset } = parsePagination(c)

  const [settings] = await db.select({ minScore: aiSettings.minScore })
    .from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1)
  const minScore = settings?.minScore ?? 50

  const result = await db.select({ tweet: tweets, score: tweetScores.score })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .innerJoin(tweetScores, and(eq(tweetScores.tweetId, tweets.id), eq(tweetScores.userId, userId)))
    .where(and(eq(userTweets.userId, userId), gte(tweetScores.score, minScore)))
    .orderBy(desc(tweets.publishedAt))
    .limit(limit).offset(offset)

  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .innerJoin(tweetScores, and(eq(tweetScores.tweetId, tweets.id), eq(tweetScores.userId, userId)))
    .where(and(eq(userTweets.userId, userId), gte(tweetScores.score, minScore)))

  const parentMap = await resolveParents(result)

  return c.json({
    data: result.map((r) => ({
      ...r.tweet, score: r.score,
      parentTweet: r.tweet.replyToTweetId ? parentMap.get(r.tweet.replyToTweetId) ?? null : null,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  })
})

// Latest report
demoRouter.get('/report', async (c) => {
  const userId = await getDemoUserId()
  if (!userId) return c.json({ error: 'Demo not configured' }, 404)
  const db = getDb(env.DATABASE_URL)

  const [report] = await db.select().from(aiReports)
    .where(eq(aiReports.userId, userId))
    .orderBy(desc(aiReports.createdAt)).limit(1)

  if (!report) return c.json({ report: null })

  const tweetRefIds: string[] = report.tweetRefs ? JSON.parse(report.tweetRefs) : []
  const refTweets = tweetRefIds.length > 0
    ? await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
    : []

  return c.json({ report: { id: report.id, content: report.content, model: report.model, tweetCount: report.tweetCount, tweetRefs: tweetRefIds, refTweets, createdAt: report.createdAt } })
})

// Report list
demoRouter.get('/reports', async (c) => {
  const userId = await getDemoUserId()
  if (!userId) return c.json({ error: 'Demo not configured' }, 404)
  const db = getDb(env.DATABASE_URL)
  const page = Math.max(1, Number(c.req.query('page') || '1') || 1)
  const limit = 10
  const offset = (page - 1) * limit

  const reports = await db.select({ id: aiReports.id, model: aiReports.model, tweetCount: aiReports.tweetCount, createdAt: aiReports.createdAt })
    .from(aiReports).where(eq(aiReports.userId, userId))
    .orderBy(desc(aiReports.createdAt)).limit(limit).offset(offset)

  return c.json({ reports })
})

// Specific report
demoRouter.get('/report/:id', async (c) => {
  const userId = await getDemoUserId()
  if (!userId) return c.json({ error: 'Demo not configured' }, 404)
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)

  const [report] = await db.select().from(aiReports)
    .where(and(eq(aiReports.id, id), eq(aiReports.userId, userId))).limit(1)

  if (!report) return c.json({ error: 'Report not found' }, 404)

  const tweetRefIds: string[] = report.tweetRefs ? JSON.parse(report.tweetRefs) : []
  const refTweets = tweetRefIds.length > 0
    ? await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
    : []

  return c.json({ report: { id: report.id, content: report.content, model: report.model, tweetCount: report.tweetCount, tweetRefs: tweetRefIds, refTweets, createdAt: report.createdAt } })
})

export default demoRouter
