import { Hono } from 'hono'
import { buildPagination } from '../helpers/feed'
import { parsePagination } from '../helpers/http'
import { getTimelinePage } from '../helpers/timeline'
import type { AuthUser } from '../middleware/auth'

const timelineRouter = new Hono<{ Variables: { user: AuthUser } }>()

timelineRouter.get('/', async (c) => {
  const user = c.get('user')
  const { page, limit } = parsePagination(c)
  const feedId = c.req.query('feedId') || null
  const minScoreRaw = c.req.query('minScore')
  const minScore = minScoreRaw == null ? null : Math.max(0, Math.min(100, Number(minScoreRaw) || 0))

  const result = await getTimelinePage({
    userId: user.id,
    page,
    limit,
    feedId,
    minScore,
  })

  return c.json({
    data: result.items,
    pagination: buildPagination(page, limit, result.total),
  })
})

export default timelineRouter
