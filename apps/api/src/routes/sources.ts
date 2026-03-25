import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and } from 'drizzle-orm'
import {
  createSourceSchema,
  updateSourceSchema,
  sourceConfigSchemas,
  type SourceType,
} from '@omens/shared'
import { getDb, sources } from '@omens/db'
import type { AuthUser } from '../middleware/auth'
import { scheduleSource, unscheduleSource } from '../scheduler'
import env from '../env'

const sourcesRouter = new Hono<{ Variables: { user: AuthUser } }>()

sourcesRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const result = await db
    .select()
    .from(sources)
    .where(eq(sources.userId, user.id))
  return c.json(result)
})

sourcesRouter.post(
  '/',
  zValidator('json', createSourceSchema),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    const configSchema = sourceConfigSchemas[body.type as SourceType]
    if (!configSchema) {
      return c.json({ error: `Unknown source type: ${body.type}` }, 400)
    }

    const parsed = configSchema.safeParse(body.config)
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid config', details: parsed.error.flatten() },
        400,
      )
    }

    const [source] = await db
      .insert(sources)
      .values({
        userId: user.id,
        type: body.type,
        config: parsed.data as Record<string, unknown>,
        pollIntervalMinutes: body.pollIntervalMinutes,
      })
      .returning()

    // Schedule the new source
    scheduleSource(source)

    return c.json(source, 201)
  },
)

sourcesRouter.put(
  '/:id',
  zValidator('json', updateSourceSchema),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    const [existing] = await db
      .select()
      .from(sources)
      .where(and(eq(sources.id, id), eq(sources.userId, user.id)))
      .limit(1)

    if (!existing) {
      return c.json({ error: 'Source not found' }, 404)
    }

    if (body.config) {
      const configSchema =
        sourceConfigSchemas[existing.type as SourceType]
      const parsed = configSchema.safeParse(body.config)
      if (!parsed.success) {
        return c.json(
          { error: 'Invalid config', details: parsed.error.flatten() },
          400,
        )
      }
      body.config = parsed.data as Record<string, unknown>
    }

    const [updated] = await db
      .update(sources)
      .set(body)
      .where(and(eq(sources.id, id), eq(sources.userId, user.id)))
      .returning()

    // Reschedule or unschedule
    if (updated.enabled) {
      scheduleSource(updated)
    } else {
      unscheduleSource(updated.id)
    }

    return c.json(updated)
  },
)

sourcesRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)

  const deleted = await db
    .delete(sources)
    .where(and(eq(sources.id, id), eq(sources.userId, user.id)))
    .returning()

  if (deleted.length === 0) {
    return c.json({ error: 'Source not found' }, 404)
  }

  unscheduleSource(id)

  return c.json({ ok: true })
})

export default sourcesRouter
