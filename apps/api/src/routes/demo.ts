import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { aiReports, aiSettings, getDb, tweets, tweetScores, userTweets, users } from '@omens/db'
import env from '../env'
import { buildPagination, hydrateFeedRows } from '../helpers/feed'
import { parsePagination } from '../helpers/http'
import { hydrateReport } from '../helpers/report'

const demoRouter = new Hono()

let _demoUserId: string | null | undefined
async function getDemoUserId(): Promise<string | null> {
  if (!env.DEMO_USER_EMAIL) return null
  if (_demoUserId !== undefined) return _demoUserId
  const db = getDb(env.DATABASE_URL)
  let [user] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, env.DEMO_USER_EMAIL)).limit(1)
  if (!user) {
    ;[user] = await db.insert(users)
      .values({ email: env.DEMO_USER_EMAIL })
      .returning({ id: users.id })
  }
  _demoUserId = user?.id ?? null
  return _demoUserId
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

  const data = await hydrateFeedRows(db, result)

  return c.json({
    data,
    pagination: buildPagination(page, limit, count),
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

  const data = await hydrateFeedRows(db, result)

  return c.json({
    data,
    pagination: buildPagination(page, limit, count),
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

  return c.json({ report: await hydrateReport(db, report) })
})

// Report list
demoRouter.get('/reports', async (c) => {
  const userId = await getDemoUserId()
  if (!userId) return c.json({ error: 'Demo not configured' }, 404)
  const db = getDb(env.DATABASE_URL)
  const page = Math.max(1, Number(c.req.query('page') || '1') || 1)
  const limit = 10
  const offset = (page - 1) * limit

  const reports = await db.select({ id: aiReports.id, model: aiReports.model, itemCount: aiReports.itemCount, createdAt: aiReports.createdAt })
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

  return c.json({ report: await hydrateReport(db, report) })
})

export default demoRouter
