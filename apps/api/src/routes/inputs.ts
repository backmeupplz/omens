import {
  getDb,
  inputs,
  redditAccounts,
  sourceAccounts,
  xAccounts,
} from '@omens/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import { fetchForUser } from '../x/fetcher'
import type { AuthUser } from '../middleware/auth'

const inputsRouter = new Hono<{ Variables: { user: AuthUser } }>()

inputsRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const rows = await db
    .select({
      id: inputs.id,
      provider: inputs.provider,
      kind: inputs.kind,
      name: inputs.name,
      enabled: inputs.enabled,
      pollIntervalMinutes: inputs.pollIntervalMinutes,
      lastFetchedAt: inputs.lastFetchedAt,
      lastError: inputs.lastError,
      sourceAccountId: sourceAccounts.id,
      accountLabel: sourceAccounts.label,
      accountStatus: sourceAccounts.status,
      xUsername: xAccounts.username,
      redditUsername: redditAccounts.username,
    })
    .from(inputs)
    .leftJoin(sourceAccounts, eq(sourceAccounts.id, inputs.sourceAccountId))
    .leftJoin(xAccounts, eq(xAccounts.sourceAccountId, sourceAccounts.id))
    .leftJoin(redditAccounts, eq(redditAccounts.sourceAccountId, sourceAccounts.id))
    .where(eq(inputs.userId, user.id))

  return c.json({
    inputs: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      kind: row.kind,
      name: row.name,
      enabled: row.enabled,
      pollIntervalMinutes: row.pollIntervalMinutes,
      lastFetchedAt: row.lastFetchedAt,
      lastError: row.lastError,
      account: row.sourceAccountId
        ? {
            id: row.sourceAccountId,
            label: row.accountLabel,
            status: row.accountStatus,
            username: row.xUsername || row.redditUsername,
          }
        : null,
    })),
  })
})

inputsRouter.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const body = await c.req.json<{
    name?: string
    enabled?: boolean
    pollIntervalMinutes?: number
  }>()
  const db = getDb(env.DATABASE_URL)

  const [existing] = await db
    .select({ id: inputs.id })
    .from(inputs)
    .where(and(eq(inputs.id, id), eq(inputs.userId, user.id)))
    .limit(1)

  if (!existing) return c.json({ error: 'Input not found' }, 404)

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.pollIntervalMinutes === 'number') patch.pollIntervalMinutes = Math.max(0, Math.round(body.pollIntervalMinutes))

  await db.update(inputs).set(patch).where(eq(inputs.id, id))
  return c.json({ ok: true })
})

inputsRouter.post('/sync', async (c) => {
  const user = c.get('user')
  const result = await fetchForUser(user.id)
  return c.json({ ok: true, count: result.count, syncedInputs: result.inputs })
})

export default inputsRouter
