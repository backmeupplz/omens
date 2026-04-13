import { Hono } from 'hono'
import { parsePagination } from '../helpers/http'
import { getTimelinePage } from '../helpers/timeline'
import type { AuthUser } from '../middleware/auth'

const feedRouter = new Hono<{ Variables: { user: AuthUser } }>()

feedRouter.get('/', async (c) => {
  const user = c.get('user')
  const { page, limit } = parsePagination(c)
  const result = await getTimelinePage({ userId: user.id, page, limit })

  return c.json({
    data: result.items,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  })
})

export default feedRouter
