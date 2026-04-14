import {
  getDb,
  inputs,
  redditAccounts,
  rssInputs,
  sourceAccounts,
  xAccounts,
} from '@omens/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { redditRssInputCreateSchema } from '@omens/shared'
import env from '../env'
import { ensureRedditSubredditRssInput } from '../helpers/inputs'
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
      rssFeedUrl: rssInputs.feedUrl,
      rssSiteUrl: rssInputs.siteUrl,
      rssTitle: rssInputs.title,
      rssSourceProvider: rssInputs.sourceProvider,
      rssSourceKey: rssInputs.sourceKey,
      rssSourceLabel: rssInputs.sourceLabel,
      rssListingType: rssInputs.listingType,
      rssTimeRange: rssInputs.timeRange,
    })
    .from(inputs)
    .leftJoin(sourceAccounts, eq(sourceAccounts.id, inputs.sourceAccountId))
    .leftJoin(xAccounts, eq(xAccounts.sourceAccountId, sourceAccounts.id))
    .leftJoin(redditAccounts, eq(redditAccounts.sourceAccountId, sourceAccounts.id))
    .leftJoin(rssInputs, eq(rssInputs.inputId, inputs.id))
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
      config: row.rssFeedUrl
        ? {
            type: 'rss',
            feedUrl: row.rssFeedUrl,
            siteUrl: row.rssSiteUrl,
            title: row.rssTitle,
            sourceProvider: row.rssSourceProvider,
            sourceKey: row.rssSourceKey,
            sourceLabel: row.rssSourceLabel,
            listingType: row.rssListingType,
            timeRange: row.rssTimeRange,
          }
        : null,
    })),
  })
})

inputsRouter.post('/rss/reddit', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = redditRssInputCreateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, 400)
  }

  try {
    const created = await ensureRedditSubredditRssInput({
      userId: user.id,
      subreddit: parsed.data.subreddit,
      listingType: parsed.data.listingType,
      timeRange: parsed.data.timeRange,
    })
    void fetchForUser(user.id).catch(() => {})
    return c.json({ ok: true, inputId: created.inputId })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not add subreddit' }, 400)
  }
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

inputsRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)

  const [existing] = await db
    .select({ id: inputs.id })
    .from(inputs)
    .where(and(eq(inputs.id, id), eq(inputs.userId, user.id)))
    .limit(1)

  if (!existing) return c.json({ error: 'Input not found' }, 404)

  await db.delete(inputs).where(eq(inputs.id, id))
  return c.json({ ok: true })
})

inputsRouter.post('/sync', async (c) => {
  const user = c.get('user')
  const result = await fetchForUser(user.id)
  return c.json({ ok: true, count: result.count, syncedInputs: result.inputs })
})

export default inputsRouter
