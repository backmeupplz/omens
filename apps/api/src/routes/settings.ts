import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { userSettingsSchema } from '@omens/shared'
import { getDb, users } from '@omens/db'
import type { AuthUser } from '../middleware/auth'
import env from '../env'

const settingsRouter = new Hono<{ Variables: { user: AuthUser } }>()

settingsRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [dbUser] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  return c.json(
    dbUser?.settings || { interests: '', minScore: 30, language: 'en' },
  )
})

settingsRouter.put(
  '/',
  zValidator('json', userSettingsSchema),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    await db
      .update(users)
      .set({ settings: body })
      .where(eq(users.id, user.id))

    return c.json(body)
  },
)

export default settingsRouter
