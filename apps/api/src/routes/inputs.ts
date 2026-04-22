import {
  getDb,
  inputs,
  rssInputs,
  sourceAccounts,
  telegramInputs,
  xAccounts,
} from '@omens/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { genericRssInputCreateSchema, redditRssInputCreateSchema, telegramChannelInputCreateSchema } from '@omens/shared'
import env from '../env'
import { ensureGenericRssInput, ensureRedditSubredditRssInput, ensureTelegramPublicChannelInput } from '../helpers/inputs'
import { fetchGenericRssFeedPreview } from '../rss/generic'
import { fetchTelegramChannelPreview } from '../telegram/public'
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
      rssFeedUrl: rssInputs.feedUrl,
      rssSiteUrl: rssInputs.siteUrl,
      rssTitle: rssInputs.title,
      rssSourceProvider: rssInputs.sourceProvider,
      rssSourceKey: rssInputs.sourceKey,
      rssSourceLabel: rssInputs.sourceLabel,
      rssListingType: rssInputs.listingType,
      rssTimeRange: rssInputs.timeRange,
      telegramChannelUsername: telegramInputs.channelUsername,
      telegramChannelTitle: telegramInputs.channelTitle,
      telegramSiteUrl: telegramInputs.siteUrl,
    })
    .from(inputs)
    .leftJoin(sourceAccounts, eq(sourceAccounts.id, inputs.sourceAccountId))
    .leftJoin(xAccounts, eq(xAccounts.sourceAccountId, sourceAccounts.id))
    .leftJoin(rssInputs, eq(rssInputs.inputId, inputs.id))
    .leftJoin(telegramInputs, eq(telegramInputs.inputId, inputs.id))
    .where(eq(inputs.userId, user.id))

  return c.json({
    inputs: rows
      .filter((row) => row.provider !== 'reddit')
      .map((row) => ({
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
              username: row.xUsername,
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
          : row.telegramChannelUsername
            ? {
                type: 'telegram',
                siteUrl: row.telegramSiteUrl,
                sourceKey: row.telegramChannelUsername,
                sourceLabel: row.telegramChannelTitle || `@${row.telegramChannelUsername}`,
                channelUsername: row.telegramChannelUsername,
                channelTitle: row.telegramChannelTitle,
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

inputsRouter.post('/rss', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = genericRssInputCreateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, 400)
  }

  try {
    const preview = await fetchGenericRssFeedPreview(parsed.data.feedUrl)
    const created = await ensureGenericRssInput({
      userId: user.id,
      feedUrl: preview.feedUrl,
      title: preview.title,
      siteUrl: preview.siteUrl,
      description: preview.description,
    })
    void fetchForUser(user.id).catch(() => {})
    return c.json({ ok: true, inputId: created.inputId, feedUrl: created.feedUrl })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not add RSS feed' }, 400)
  }
})

inputsRouter.post('/telegram', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = telegramChannelInputCreateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, 400)
  }

  try {
    const preview = await fetchTelegramChannelPreview(parsed.data.channel)
    const created = await ensureTelegramPublicChannelInput({
      userId: user.id,
      channel: preview.channelUsername,
      channelTitle: preview.channelTitle,
    })
    void fetchForUser(user.id).catch(() => {})
    return c.json({ ok: true, inputId: created.inputId, channelUsername: created.channelUsername })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not add Telegram channel' }, 400)
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
