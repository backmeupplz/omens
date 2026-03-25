import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, apiKeys } from '@omens/db'
import { generateApiKey, hashApiKey } from '../helpers/apikey'
import type { AuthUser } from '../middleware/auth'
import env from '../env'

const apiKeysRouter = new Hono<{ Variables: { user: AuthUser } }>()

apiKeysRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))

  return c.json(keys)
})

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
})

apiKeysRouter.post(
  '/',
  zValidator('json', createKeySchema),
  async (c) => {
    const user = c.get('user')
    const { name } = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    const { key, prefix } = generateApiKey()
    const keyHash = await hashApiKey(key)

    const [created] = await db
      .insert(apiKeys)
      .values({
        userId: user.id,
        name,
        keyHash,
        prefix,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
      })

    // Return the full key only once at creation
    return c.json({ ...created, key }, 201)
  },
)

apiKeysRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)

  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
    .returning()

  if (deleted.length === 0) {
    return c.json({ error: 'API key not found' }, 404)
  }

  return c.json({ ok: true })
})

export default apiKeysRouter
