import { getDb, tweets, tweetScores } from '@omens/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import type { AuthUser } from '../middleware/auth'

const feedRouter = new Hono<{ Variables: { user: AuthUser } }>()

feedRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const page = Math.max(1, Math.floor(Number(c.req.query('page') || '1')) || 1)
  const limit = Math.max(1, Math.min(Math.floor(Number(c.req.query('limit') || '50')) || 50, 100))
  const offset = (page - 1) * limit

  // Left join scores so each tweet gets its score if available
  const result = await db
    .select({
      tweet: tweets,
      score: tweetScores.score,
    })
    .from(tweets)
    .leftJoin(tweetScores, and(
      eq(tweetScores.tweetId, tweets.id),
      eq(tweetScores.userId, user.id),
    ))
    .where(eq(tweets.userId, user.id))
    .orderBy(desc(tweets.publishedAt))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tweets)
    .where(eq(tweets.userId, user.id))

  return c.json({
    data: result.map((r) => ({ ...r.tweet, score: r.score })),
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  })
})

export default feedRouter
