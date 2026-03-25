import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and } from 'drizzle-orm'
import { createOutputSchema, updateOutputSchema } from '@omens/shared'
import { getDb, outputs } from '@omens/db'
import type { AuthUser } from '../middleware/auth'
import env from '../env'

const outputsRouter = new Hono<{ Variables: { user: AuthUser } }>()

outputsRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const result = await db
    .select()
    .from(outputs)
    .where(eq(outputs.userId, user.id))
  return c.json(result)
})

outputsRouter.post(
  '/',
  zValidator('json', createOutputSchema),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    const [output] = await db
      .insert(outputs)
      .values({
        userId: user.id,
        type: body.type,
        config: body.config as Record<string, unknown>,
      })
      .returning()

    return c.json(output, 201)
  },
)

outputsRouter.put(
  '/:id',
  zValidator('json', updateOutputSchema),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    const [updated] = await db
      .update(outputs)
      .set(body)
      .where(and(eq(outputs.id, id), eq(outputs.userId, user.id)))
      .returning()

    if (!updated) {
      return c.json({ error: 'Output not found' }, 404)
    }

    return c.json(updated)
  },
)

outputsRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)

  const deleted = await db
    .delete(outputs)
    .where(and(eq(outputs.id, id), eq(outputs.userId, user.id)))
    .returning()

  if (deleted.length === 0) {
    return c.json({ error: 'Output not found' }, 404)
  }

  return c.json({ ok: true })
})

export default outputsRouter
