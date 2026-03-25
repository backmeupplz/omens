import { Hono } from 'hono'
import { eq, desc, gte, and, sql } from 'drizzle-orm'
import { getDb, signals, items, sources } from '@omens/db'
import type { AuthUser } from '../middleware/auth'
import env from '../env'

const feedRouter = new Hono<{ Variables: { user: AuthUser } }>()

feedRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const page = Number(c.req.query('page') || '1')
  const limit = Math.min(Number(c.req.query('limit') || '20'), 100)
  const minScore = Number(c.req.query('minScore') || '0')
  const sourceType = c.req.query('source')
  const offset = (page - 1) * limit

  const conditions = [eq(signals.userId, user.id)]

  if (minScore > 0) {
    conditions.push(gte(signals.score, minScore))
  }

  const result = await db
    .select({
      signal: {
        id: signals.id,
        score: signals.score,
        summary: signals.summary,
        tags: signals.tags,
        createdAt: signals.createdAt,
      },
      item: {
        id: items.id,
        title: items.title,
        content: items.content,
        url: items.url,
        author: items.author,
        publishedAt: items.publishedAt,
      },
      source: {
        type: sources.type,
      },
    })
    .from(signals)
    .innerJoin(items, eq(signals.itemId, items.id))
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(
      sourceType
        ? and(...conditions, eq(sources.type, sourceType))
        : and(...conditions),
    )
    .orderBy(desc(signals.score), desc(signals.createdAt))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(signals)
    .where(and(...conditions))

  return c.json({
    data: result,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  })
})

export default feedRouter
