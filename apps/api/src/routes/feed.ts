import { getDb, tweets, tweetScores, userTweets } from '@omens/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import { buildPagination, hydrateFeedRows } from '../helpers/feed'
import { parsePagination } from '../helpers/http'
import type { AuthUser } from '../middleware/auth'

const feedRouter = new Hono<{ Variables: { user: AuthUser } }>()

feedRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const { page, limit, offset } = parsePagination(c)

  // Left join scores so each tweet gets its score if available
  const result = await db
    .select({
      tweet: tweets,
      score: tweetScores.score,
    })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .leftJoin(tweetScores, and(
      eq(tweetScores.tweetId, tweets.id),
      eq(tweetScores.userId, user.id),
    ))
    .where(eq(userTweets.userId, user.id))
    .orderBy(desc(tweets.publishedAt))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .where(eq(userTweets.userId, user.id))

  const data = await hydrateFeedRows(db, result)

  return c.json({
    data,
    pagination: buildPagination(page, limit, count),
  })
})

export default feedRouter
