import { zValidator } from '@hono/zod-validator'
import {
  aiReports,
  aiScoringFeedInputs,
  aiScoringFeeds,
  aiSettings,
  contentItems,
  getDb,
  itemNudges,
  itemScores,
  inputs,
  promptChanges,
  redditPosts,
  xPosts,
} from '@omens/db'
import {
  aiSettingsSchema,
  nudgeSchema,
  promptChangeSchema,
  scoringFeedCreateSchema,
  scoringFeedUpdateSchema,
} from '@omens/shared'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import { parsePagination } from '../helpers/http'
import { hydrateReport } from '../helpers/report'
import { feedInputsScope, getTimelineItemsByIds, getTimelinePage, serializeTimelineItems, type TimelineItem } from '../helpers/timeline'
import { sendReportEmailsForReport } from '../email/service'
import {
  DEFAULT_SYSTEM_PROMPT,
  FILTER_SYSTEM_PROMPT,
  META_PROMPT,
  REPORT_SYSTEM_PROMPT,
  callAI,
  callAIStream,
  formatItemsForAI,
  type ItemForAI,
  listModels,
} from '../helpers/ai'
import type { AppEnv } from '../middleware/auth'
import { decrypt, encrypt } from '../helpers/crypto'

const aiRouter = new Hono<AppEnv>()
const DEFAULT_FEED_NAME = 'Main'
const DEFAULT_FEED_ICON = '✦'

type ItemRow = {
  contentItem: typeof contentItems.$inferSelect
  xPost: typeof xPosts.$inferSelect | null
  redditPost: typeof redditPosts.$inferSelect | null
}

// --- Helpers ---

async function getAiConfig(userId: string) {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1)
  if (!settings) return null
  const apiKey = await decrypt(settings.apiKey)
  return {
    settings,
    config: {
      provider: settings.provider as any,
      apiKey,
      baseUrl: settings.baseUrl || '',
      model: settings.model,
    },
  }
}

function feedScopeKey(userId: string, feedId: string) {
  return `${userId}:${feedId}`
}

function getRequestedFeedId(c: any) {
  return c.req.query('feedId') || null
}

function normalizeReportRefId(value: string) {
  return value.trim()
}

async function listScoringFeeds(userId: string) {
  const db = getDb(env.DATABASE_URL)
  return db.select()
    .from(aiScoringFeeds)
    .where(eq(aiScoringFeeds.userId, userId))
    .orderBy(desc(aiScoringFeeds.isMain), aiScoringFeeds.createdAt)
}

async function ensureMainFeed(userId: string) {
  const db = getDb(env.DATABASE_URL)
  const [existing] = await db.select()
    .from(aiScoringFeeds)
    .where(and(eq(aiScoringFeeds.userId, userId), eq(aiScoringFeeds.isMain, true)))
    .limit(1)
  if (existing) return existing

  const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1)
  const [created] = await db.insert(aiScoringFeeds).values({
    userId,
    name: DEFAULT_FEED_NAME,
    icon: DEFAULT_FEED_ICON,
    isMain: true,
    systemPrompt: settings?.systemPrompt || null,
    minScore: settings?.minScore ?? 50,
    reportIntervalHours: settings?.reportIntervalHours ?? 24,
    reportAtHour: settings?.reportAtHour ?? 6,
    promptLastRegenAt: settings?.promptLastRegenAt ?? null,
    lastAutoReportAt: settings?.lastAutoReportAt ?? null,
  }).returning()
  const userInputs = await db.select({ id: inputs.id }).from(inputs).where(eq(inputs.userId, userId))
  if (userInputs.length > 0) {
    await db.insert(aiScoringFeedInputs)
      .values(userInputs.map((input) => ({ feedId: created.id, inputId: input.id })))
      .onConflictDoNothing()
  }
  return created
}

async function getFeedForUser(userId: string, requestedFeedId?: string | null) {
  const feeds = await listScoringFeeds(userId)
  if (feeds.length === 0) {
    const main = await ensureMainFeed(userId)
    return main
  }
  if (requestedFeedId) {
    const match = feeds.find((feed) => feed.id === requestedFeedId)
    if (match) return match
  }
  return feeds.find((feed) => feed.isMain) || feeds[0]
}

function computeNextReportAt(feed: typeof aiScoringFeeds.$inferSelect) {
  if (feed.reportIntervalHours <= 0) return null
  if (feed.reportIntervalHours >= 24) {
    const now = new Date()
    const todayTarget = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), feed.reportAtHour))
    return todayTarget.getTime() <= Date.now() ? todayTarget.getTime() + 86_400_000 : todayTarget.getTime()
  }
  const lastReport = feed.lastAutoReportAt?.getTime() || 0
  return lastReport + feed.reportIntervalHours * 3_600_000
}

function serializeFeed(feed: typeof aiScoringFeeds.$inferSelect) {
  return {
    id: feed.id,
    name: feed.name,
    icon: feed.icon,
    isMain: feed.isMain,
    minScore: feed.minScore,
    scoreFromAt: feed.scoreFromAt,
    reportIntervalHours: feed.reportIntervalHours,
    reportAtHour: feed.reportAtHour,
    systemPrompt: feed.systemPrompt || '',
    promptLastRegenAt: feed.promptLastRegenAt,
    lastAutoReportAt: feed.lastAutoReportAt,
    nextReportAt: computeNextReportAt(feed),
  }
}

function mapRowToAiItem(row: ItemRow): ItemForAI | null {
  if (row.contentItem.provider === 'x' && row.xPost) {
    return {
      id: row.contentItem.id,
      provider: 'x',
      authorHandle: row.xPost.authorHandle,
      authorName: row.xPost.authorName,
      authorFollowers: row.xPost.authorFollowers,
      content: row.xPost.content,
      likes: row.xPost.likes,
      retweets: row.xPost.retweets,
      replies: row.xPost.replies,
      views: row.xPost.views,
      publishedAt: row.contentItem.publishedAt,
      isRetweet: row.xPost.isRetweet,
      quotedTweet: row.xPost.quotedTweet,
      card: row.xPost.card,
    }
  }

  if (row.contentItem.provider === 'reddit' && row.redditPost) {
    return {
      id: row.contentItem.id,
      provider: 'reddit',
      subreddit: row.redditPost.subreddit,
      authorName: row.redditPost.authorName,
      title: row.redditPost.title,
      body: row.redditPost.body,
      score: row.redditPost.score,
      commentCount: row.redditPost.commentCount,
      domain: row.redditPost.domain,
      linkFlairText: row.redditPost.linkFlairText,
      over18: row.redditPost.over18,
      spoiler: row.redditPost.spoiler,
      isSelf: row.redditPost.isSelf,
      previewUrl: row.redditPost.previewUrl,
      publishedAt: row.contentItem.publishedAt,
    }
  }

  return null
}

function summarizeItemForFeedback(item: TimelineItem | null) {
  if (!item) return { label: 'Post', preview: '' }
  if (item.provider === 'x') {
    return {
      label: `@${item.payload.authorHandle}`,
      preview: item.payload.content.slice(0, 200),
    }
  }
  return {
    label: `r/${item.payload.subreddit}`,
    preview: (item.payload.body || item.payload.title).slice(0, 200),
  }
}

// ==================== SETTINGS ====================

aiRouter.get('/settings', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, user.id))
    .limit(1)

  if (!settings) {
    return c.json({ configured: false, defaultPrompt: DEFAULT_SYSTEM_PROMPT, fetchIntervalMinutes: 15, feeds: [] })
  }

  const existingFeeds = await listScoringFeeds(user.id)
  const feeds = existingFeeds.length > 0 ? existingFeeds : [await ensureMainFeed(user.id)]
  const mainFeed = feeds.find((feed) => feed.isMain) || feeds[0]

  let maskedKey = '••••••••'
  try {
    const raw = await decrypt(settings.apiKey)
    if (raw.length > 8) maskedKey = raw.slice(0, 4) + '••••' + raw.slice(-4)
  } catch {}

  return c.json({
    configured: true,
    provider: settings.provider,
    apiKeyMasked: maskedKey,
    minScore: mainFeed?.minScore ?? 50,
    fetchIntervalMinutes: settings.fetchIntervalMinutes,
    reportIntervalHours: mainFeed?.reportIntervalHours ?? 24,
    reportAtHour: mainFeed?.reportAtHour ?? 6,
    nextReportAt: mainFeed ? computeNextReportAt(mainFeed) : null,
    baseUrl: settings.baseUrl || '',
    model: settings.model,
    systemPrompt: mainFeed?.systemPrompt || settings.systemPrompt || '',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    promptLastRegenAt: mainFeed?.promptLastRegenAt ?? settings.promptLastRegenAt,
    feeds: feeds.map(serializeFeed),
  })
})

aiRouter.put('/settings', zValidator('json', aiSettingsSchema), async (c) => {
  const user = c.get('user')
  const { provider, apiKey, baseUrl, model, systemPrompt } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  const existing = await db
    .select({ id: aiSettings.id, apiKey: aiSettings.apiKey })
    .from(aiSettings)
    .where(eq(aiSettings.userId, user.id))
    .limit(1)

  const keepKey = apiKey === 'keep-existing' && existing.length > 0
  const encryptedKey = keepKey ? existing[0].apiKey : await encrypt(apiKey)

  if (existing.length > 0) {
    await db.update(aiSettings).set({
      provider,
      apiKey: encryptedKey,
      baseUrl: baseUrl || null,
      model,
      systemPrompt: systemPrompt || null,
      updatedAt: new Date(),
    }).where(eq(aiSettings.userId, user.id))
  } else {
    if (keepKey) return c.json({ error: 'API key required' }, 400)
    await db.insert(aiSettings).values({
      userId: user.id,
      provider,
      apiKey: encryptedKey,
      baseUrl: baseUrl || null,
      model,
      systemPrompt: systemPrompt || null,
    })
  }
  await ensureMainFeed(user.id)
  return c.json({ ok: true })
})

aiRouter.put('/settings/prompt', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ systemPrompt?: string }>()
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  await db.update(aiScoringFeeds)
    .set({ systemPrompt: body.systemPrompt || null, updatedAt: new Date() })
    .where(eq(aiScoringFeeds.id, feed.id))
  return c.json({ ok: true })
})

aiRouter.put('/settings/min-score', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ minScore: number }>()
  const db = getDb(env.DATABASE_URL)
  const val = Math.max(0, Math.min(100, Math.round(body.minScore || 0)))
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  await db.update(aiScoringFeeds).set({ minScore: val, updatedAt: new Date() }).where(eq(aiScoringFeeds.id, feed.id))
  return c.json({ ok: true })
})

aiRouter.put('/settings/intervals', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ fetchIntervalMinutes?: number; reportIntervalHours?: number; reportAtHour?: number }>()
  const db = getDb(env.DATABASE_URL)
  const settingsUpdates: Record<string, unknown> = {}
  const feedUpdates: Record<string, unknown> = {}
  if (body.fetchIntervalMinutes !== undefined) {
    settingsUpdates.fetchIntervalMinutes = Math.max(0, Math.round(body.fetchIntervalMinutes))
  }
  if (body.reportIntervalHours !== undefined) {
    feedUpdates.reportIntervalHours = Math.max(0, Math.round(body.reportIntervalHours))
  }
  if (body.reportAtHour !== undefined) {
    feedUpdates.reportAtHour = Math.max(0, Math.min(23, Math.round(body.reportAtHour)))
  }
  if (Object.keys(settingsUpdates).length > 0) {
    const existing = await db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, user.id)).limit(1)
    if (existing.length > 0) {
      await db.update(aiSettings).set(settingsUpdates).where(eq(aiSettings.userId, user.id))
      if (settingsUpdates.fetchIntervalMinutes !== undefined) {
        await db.update(inputs)
          .set({
            pollIntervalMinutes: Number(settingsUpdates.fetchIntervalMinutes),
            updatedAt: new Date(),
          })
          .where(eq(inputs.userId, user.id))
      }
    } else {
      return c.json({ error: 'AI not configured' }, 400)
    }
  }
  if (Object.keys(feedUpdates).length > 0) {
    const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
    await db.update(aiScoringFeeds).set({ ...feedUpdates, updatedAt: new Date() }).where(eq(aiScoringFeeds.id, feed.id))
  }
  return c.json({ ok: true })
})

aiRouter.get('/feeds', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, user.id)).limit(1)
  if (!settings) return c.json({ feeds: [] })
  const existingFeeds = await listScoringFeeds(user.id)
  const feeds = existingFeeds.length > 0 ? existingFeeds : [await ensureMainFeed(user.id)]
  return c.json({ feeds: feeds.map(serializeFeed) })
})

aiRouter.post('/feeds', zValidator('json', scoringFeedCreateSchema), async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, user.id)).limit(1)
  if (!settings) return c.json({ error: 'AI not configured' }, 400)

  const { name, icon } = c.req.valid('json')
  const [mainFeed] = await Promise.all([ensureMainFeed(user.id)])
  const [feed] = await db.insert(aiScoringFeeds).values({
    userId: user.id,
    name: name.trim(),
    icon: icon.trim(),
    isMain: false,
    systemPrompt: mainFeed.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    minScore: mainFeed.minScore,
    // New feeds should only backfill roughly one day of context, not the full archive.
    scoreFromAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    reportIntervalHours: mainFeed.reportIntervalHours,
    reportAtHour: mainFeed.reportAtHour,
  }).returning()
  const userInputs = await db.select({ id: inputs.id }).from(inputs).where(eq(inputs.userId, user.id))
  if (userInputs.length > 0) {
    await db.insert(aiScoringFeedInputs)
      .values(userInputs.map((input) => ({ feedId: feed.id, inputId: input.id })))
      .onConflictDoNothing()
  }
  return c.json({ feed: serializeFeed(feed) })
})

aiRouter.put('/feeds/:id', zValidator('json', scoringFeedUpdateSchema), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [existing] = await db.select().from(aiScoringFeeds)
    .where(and(eq(aiScoringFeeds.id, id), eq(aiScoringFeeds.userId, user.id)))
    .limit(1)
  if (!existing) return c.json({ error: 'Feed not found' }, 404)

  const body = c.req.valid('json')
  const [feed] = await db.update(aiScoringFeeds).set({
    name: body.name.trim(),
    icon: body.icon.trim(),
    systemPrompt: body.systemPrompt || null,
    minScore: body.minScore,
    reportIntervalHours: body.reportIntervalHours,
    reportAtHour: body.reportAtHour,
    updatedAt: new Date(),
  }).where(eq(aiScoringFeeds.id, id)).returning()
  return c.json({ feed: serializeFeed(feed) })
})

aiRouter.delete('/feeds/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [feed] = await db.select().from(aiScoringFeeds)
    .where(and(eq(aiScoringFeeds.id, id), eq(aiScoringFeeds.userId, user.id)))
    .limit(1)
  if (!feed) return c.json({ error: 'Feed not found' }, 404)
  if (feed.isMain) return c.json({ error: 'Main feed cannot be removed' }, 400)

  await db.delete(aiScoringFeeds).where(eq(aiScoringFeeds.id, id))
  return c.json({ ok: true })
})

// ==================== MODELS ====================

aiRouter.get('/models', async (c) => {
  const user = c.get('user')
  const ai = await getAiConfig(user.id)
  if (!ai) return c.json({ models: [], error: 'AI not configured' })
  try {
    const models = await listModels(ai.config)
    return c.json({ models })
  } catch {
    return c.json({ models: [], error: 'Failed to fetch models' })
  }
})

aiRouter.post(
  '/models/preview',
  zValidator('json', aiSettingsSchema.pick({ provider: true, apiKey: true, baseUrl: true })),
  async (c) => {
    const { provider, apiKey, baseUrl } = c.req.valid('json')
    try {
      const models = await listModels({ provider, apiKey, baseUrl: baseUrl || '' })
      return c.json({ models })
    } catch {
      return c.json({ models: [], error: 'Failed to fetch models' })
    }
  },
)

// ==================== NUDGES ====================

aiRouter.post('/nudge', zValidator('json', nudgeSchema), async (c) => {
  const user = c.get('user')
  const { itemId, direction, feedId } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, feedId)

  await db.insert(itemNudges).values({
    userId: user.id,
    feedId: feed.id,
    contentItemId: itemId,
    direction,
  }).onConflictDoUpdate({
    target: [itemNudges.userId, itemNudges.feedId, itemNudges.contentItemId],
    set: { direction, consumed: false, createdAt: new Date() },
  })
  return c.json({ ok: true })
})

aiRouter.delete('/nudge/:itemId', async (c) => {
  const user = c.get('user')
  const itemId = c.req.param('itemId')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  await db.delete(itemNudges).where(
    and(eq(itemNudges.userId, user.id), eq(itemNudges.feedId, feed.id), eq(itemNudges.contentItemId, itemId)),
  )
  return c.json({ ok: true })
})

aiRouter.get('/nudges', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const rows = await db.select({
    itemId: itemNudges.contentItemId,
    direction: itemNudges.direction,
  }).from(itemNudges).where(and(eq(itemNudges.userId, user.id), eq(itemNudges.feedId, feed.id)))
  return c.json({ nudges: rows })
})

// ==================== PROMPT CHANGES ====================

aiRouter.post('/prompt-change', zValidator('json', promptChangeSchema), async (c) => {
  const user = c.get('user')
  const { instruction, feedId } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, feedId)
  await db.insert(promptChanges).values({ userId: user.id, feedId: feed.id, instruction })
  return c.json({ ok: true })
})

aiRouter.delete('/prompt-change/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  await db.delete(promptChanges).where(
    and(
      eq(promptChanges.id, id),
      eq(promptChanges.userId, user.id),
      eq(promptChanges.consumed, false),
    ),
  )
  return c.json({ ok: true })
})

// ==================== AI INTERNALS ====================

aiRouter.get('/internals', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))

  const pendingNudgeRows = await db
    .select({
      id: itemNudges.id,
      itemId: itemNudges.contentItemId,
      direction: itemNudges.direction,
      createdAt: itemNudges.createdAt,
    })
    .from(itemNudges)
    .where(and(eq(itemNudges.userId, user.id), eq(itemNudges.feedId, feed.id), eq(itemNudges.consumed, false)))
    .orderBy(desc(itemNudges.createdAt))

  const refItems = await getTimelineItemsByIds(pendingNudgeRows.map((row) => row.itemId))
  const refItemsById = new Map(refItems.map((item) => [item.id, item] as const))

  const pendingInstructions = await db
    .select()
    .from(promptChanges)
    .where(and(eq(promptChanges.userId, user.id), eq(promptChanges.feedId, feed.id), eq(promptChanges.consumed, false)))
    .orderBy(desc(promptChanges.createdAt))

  // Compute auto-apply target as epoch ms (batcher runs every 60s)
  const allCreatedAts = [
    ...pendingNudgeRows.map((n) => n.createdAt?.getTime() || 0),
    ...pendingInstructions.map((p) => p.createdAt?.getTime() || 0),
  ].filter((t) => t > 0)
  const earliestPending = allCreatedAts.length > 0 ? Math.min(...allCreatedAts) : null
  const autoApplyAt = earliestPending ? earliestPending + 60_000 : null

  const key = feedScopeKey(user.id, feed.id)
  const isApplying = regenProgress.has(key) && !regenProgress.get(key)!.done

  return c.json({
    currentPrompt: feed.systemPrompt || '',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    pendingNudges: pendingNudgeRows.map((n) => ({
      id: n.id,
      itemId: n.itemId,
      ...summarizeItemForFeedback(refItemsById.get(n.itemId) || null),
      direction: n.direction,
    })),
    pendingInstructions: pendingInstructions.map((p) => ({
      id: p.id,
      instruction: p.instruction,
    })),
    lastRegenAt: feed.promptLastRegenAt || null,
    autoApplyAt,
    isApplying,
  })
})

// ==================== PROMPT REGENERATION ====================

// In-memory regen progress
const regenProgress = new Map<string, { status: string; done: boolean; error?: string; subscribers: Set<(event: string) => void> }>()

export async function regeneratePromptForUser(userId: string, feedId?: string | null, onStatus?: (s: string) => void): Promise<string | null> {
  const feed = await getFeedForUser(userId, feedId)
  const key = feedScopeKey(userId, feed.id)
  const setStatus = (s: string) => {
    onStatus?.(s)
    const p = regenProgress.get(key)
    if (p) { p.status = s; for (const sub of p.subscribers) sub(JSON.stringify({ status: s })) }
  }

  const ai = await getAiConfig(userId)
  if (!ai) return null
  const db = getDb(env.DATABASE_URL)

  setStatus('Collecting feedback...')

  const pendingNudgeRows = await db
    .select({
      id: itemNudges.id,
      direction: itemNudges.direction,
      itemId: itemNudges.contentItemId,
    })
    .from(itemNudges)
    .where(and(eq(itemNudges.userId, userId), eq(itemNudges.feedId, feed.id), eq(itemNudges.consumed, false)))

  const pendingInstructions = await db.select().from(promptChanges)
    .where(and(eq(promptChanges.userId, userId), eq(promptChanges.feedId, feed.id), eq(promptChanges.consumed, false)))

  if (pendingNudgeRows.length === 0 && pendingInstructions.length === 0) return null

  const refItems = await getTimelineItemsByIds(pendingNudgeRows.map((row) => row.itemId))
  const refItemsById = new Map(refItems.map((item) => [item.id, item] as const))

  // Build feedback text
  const upTweets = pendingNudgeRows.filter((n) => n.direction === 'up')
  const downTweets = pendingNudgeRows.filter((n) => n.direction === 'down')

  let feedback = ''
  if (upTweets.length > 0) {
    feedback += 'Thumbs UP (show more like these):\n'
    feedback += upTweets
      .map((item) => {
        const summary = summarizeItemForFeedback(refItemsById.get(item.itemId) || null)
        return `- ${summary.label}: "${summary.preview.slice(0, 150)}"`
      })
      .join('\n')
    feedback += '\n\n'
  }
  if (downTweets.length > 0) {
    feedback += 'Thumbs DOWN (show less like these):\n'
    feedback += downTweets
      .map((item) => {
        const summary = summarizeItemForFeedback(refItemsById.get(item.itemId) || null)
        return `- ${summary.label}: "${summary.preview.slice(0, 150)}"`
      })
      .join('\n')
    feedback += '\n\n'
  }
  if (pendingInstructions.length > 0) {
    feedback += 'Text instructions:\n'
    feedback += pendingInstructions.map((p) => `- "${p.instruction}"`).join('\n')
  }

  const userMsg = `DEFAULT PROMPT:\n${DEFAULT_SYSTEM_PROMPT}\n\nCURRENT PROMPT:\n${feed.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\nUSER FEEDBACK:\n${feedback}`

  setStatus(`Sending ${pendingNudgeRows.length} nudges + ${pendingInstructions.length} instructions to AI...`)

  const newPrompt = await callAI(ai.config, META_PROMPT, userMsg)

  setStatus('Saving new prompt...')

  // Save new prompt and mark consumed
  await db.update(aiScoringFeeds).set({
    systemPrompt: newPrompt.trim(),
    promptLastRegenAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(aiScoringFeeds.id, feed.id))

  const nudgeIds = pendingNudgeRows.map((n) => n.id)
  if (nudgeIds.length > 0) {
    await db.update(itemNudges).set({ consumed: true }).where(inArray(itemNudges.id, nudgeIds))
  }
  const instrIds = pendingInstructions.map((p) => p.id)
  if (instrIds.length > 0) {
    await db.update(promptChanges).set({ consumed: true }).where(inArray(promptChanges.id, instrIds))
  }

  console.log(`[ai] Regenerated prompt for user ${userId}, feed ${feed.id} (${nudgeIds.length} nudges, ${instrIds.length} instructions)`)
  return newPrompt
}

aiRouter.post('/regenerate-prompt', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const key = feedScopeKey(user.id, feed.id)

  if (regenProgress.has(key)) {
    return c.json({ error: 'Already regenerating' }, 409)
  }

  const progress: { status: string; done: boolean; error?: string; subscribers: Set<(event: string) => void> } = { status: 'Starting...', done: false, subscribers: new Set() }
  regenProgress.set(key, progress)

  // Fire and forget — frontend connects to SSE
  void (async () => {
    try {
      const result = await regeneratePromptForUser(user.id, feed.id)
      progress.done = true
      for (const sub of progress.subscribers) sub('[DONE]')
      if (!result) {
        progress.status = 'No pending changes'
        for (const sub of progress.subscribers) sub(JSON.stringify({ status: 'No pending changes' }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ai] Prompt regen error:', msg)
      progress.error = msg
      progress.done = true
      for (const sub of progress.subscribers) sub(`[ERROR] ${msg}`)
    } finally {
      setTimeout(() => regenProgress.delete(key), 10_000)
    }
  })()

  return c.json({ ok: true })
})

aiRouter.get('/regenerate-status', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const p = regenProgress.get(feedScopeKey(user.id, feed.id))
  return c.json({
    active: !!p && !p.done,
    status: p?.status || null,
    error: p?.error || null,
  })
})

aiRouter.get('/regenerate-stream', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const progress = regenProgress.get(feedScopeKey(user.id, feed.id))

  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false
        const encoder = new TextEncoder()
        const requestSignal = c.req.raw.signal
        let onEvent: ((event: string) => void) | null = null
        const cleanup = () => {
          clearInterval(heartbeat)
          if (onEvent) progress?.subscribers.delete(onEvent)
          requestSignal?.removeEventListener?.('abort', onAbort)
        }
        const send = (data: string) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { closed = true; cleanup() }
        }
        const sendHeartbeat = () => {
          if (closed) return
          try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch { closed = true; cleanup() }
        }
        const close = () => {
          if (closed) return
          closed = true
          cleanup()
          try { controller.close() } catch {}
        }
        const onAbort = () => close()
        const heartbeat = setInterval(sendHeartbeat, 15_000)
        requestSignal?.addEventListener?.('abort', onAbort)

        if (!progress || progress.done) {
          if (progress?.error) send(`[ERROR] ${progress.error}`)
          else send('[DONE]')
          close()
          return
        }

        if (progress.status) send(JSON.stringify({ status: progress.status }))

        onEvent = (event: string) => {
          if (event === '[DONE]' || event.startsWith('[ERROR]')) {
            send(event)
            close()
          } else {
            send(event)
          }
        }
        progress.subscribers.add(onEvent)
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } },
  )
})

// ==================== FEED FILTERING ====================

// In-memory scoring progress per user
const scoringProgress = new Map<string, { batch: number; totalBatches: number; batchSize: number; log: string[] }>()
const scoringActive = new Set<string>()

export function getScoringProgress(userId: string, feedId: string) {
  return scoringProgress.get(feedScopeKey(userId, feedId)) || null
}

export function isScoringActive(userId: string, feedId: string) {
  return scoringActive.has(feedScopeKey(userId, feedId))
}

export async function scoreUnscoredTweets(userId: string, feedId?: string | null): Promise<number> {
  const feed = await getFeedForUser(userId, feedId)
  const progressKey = feedScopeKey(userId, feed.id)
  // Skip if already scoring for this user
  if (scoringActive.has(progressKey)) return 0
  scoringActive.add(progressKey)

  const ai = await getAiConfig(userId)
  if (!ai) { scoringActive.delete(progressKey); return 0 }
  const db = getDb(env.DATABASE_URL)
  const scope = feedInputsScope(userId, feed.id)

  const allItems = await db
    .select({
      contentItem: contentItems,
      xPost: xPosts,
      redditPost: redditPosts,
    })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
    .where(and(
      scope,
      ...(feed.scoreFromAt ? [gte(contentItems.publishedAt, feed.scoreFromAt)] : []),
      sql`NOT EXISTS (
        SELECT 1
        FROM item_scores
        WHERE item_scores.content_item_id = ${contentItems.id}
          AND item_scores.user_id = ${userId}
          AND item_scores.feed_id = ${feed.id}
      )`,
    ))
    .orderBy(desc(contentItems.publishedAt))

  if (allItems.length === 0) { scoringActive.delete(progressKey); scoringProgress.delete(progressKey); return 0 }

  const BATCH_SIZE = 10
  const totalBatches = Math.ceil(allItems.length / BATCH_SIZE)
  const log: string[] = [`Found ${allItems.length} unscored posts for ${feed.name}`]
  scoringProgress.set(progressKey, { batch: 0, totalBatches, batchSize: BATCH_SIZE, log })
  const userPrefs = feed.systemPrompt || DEFAULT_SYSTEM_PROMPT
  let totalScored = 0

  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    log.push(`Sending batch ${batchNum}/${totalBatches} to ${ai.config.provider}...`)
    scoringProgress.set(progressKey, { batch: batchNum, totalBatches, batchSize: BATCH_SIZE, log })

    const batch = allItems
      .slice(i, i + BATCH_SIZE)
      .map(mapRowToAiItem)
      .filter((item): item is ItemForAI => !!item)
    const itemText = formatItemsForAI(batch)
    const prompt = `${FILTER_SYSTEM_PROMPT}\n\nUser preferences:\n${userPrefs}`

    const validIds = new Set(batch.map((item) => item.id))

    try {
      let response = await callAI(ai.config, prompt, itemText)
      response = response.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim()
      const scores: Array<{ id: string; score: number }> = JSON.parse(response)

      const validScores = scores.filter(
        (s): s is { id: string; score: number } =>
          typeof s.id === 'string' && typeof s.score === 'number' && validIds.has(s.id),
      )
      await Promise.all(validScores.map((s) =>
        db.insert(itemScores).values({
          userId: userId,
          feedId: feed.id,
          contentItemId: s.id,
          score: Math.max(0, Math.min(100, Math.round(s.score))),
        }).onConflictDoNothing(),
      ))
      totalScored += validScores.length
      log.push(`Batch ${batchNum}: scored ${validScores.length} posts`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.push(`Batch ${batchNum} error: ${errMsg}`)
      console.error(`[ai] Filter batch ${batchNum}/${totalBatches} error:`, errMsg)
      const authPatterns = ['401', '403', 'Unauthorized', 'Invalid', 'API key']
      if (authPatterns.some((p) => errMsg.includes(p))) {
        log.push(`Aborting: authentication error`)
        break
      }
    }
  }

  log.push(`Done — scored ${totalScored} posts total`)
  scoringProgress.delete(progressKey)
  scoringActive.delete(progressKey)
  if (totalScored > 0) console.log(`[ai] Scored ${totalScored} items for user ${userId}, feed ${feed.id}`)
  return totalScored
}

export async function scoreUnscoredTweetsForAllFeeds(userId: string) {
  const feeds = await listScoringFeeds(userId)
  const targets = feeds.length > 0 ? feeds : [await ensureMainFeed(userId)]
  for (const feed of targets) {
    await scoreUnscoredTweets(userId, feed.id)
  }
}

aiRouter.post('/filter', async (c) => {
  const user = c.get('user')
  const scored = await scoreUnscoredTweets(user.id, getRequestedFeedId(c))
  return c.json({ ok: true, scored })
})

aiRouter.get('/scoring-status', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const minScore = feed.minScore
  const scope = feedInputsScope(user.id, feed.id)
  const eligibility = feed.scoreFromAt ? gte(contentItems.publishedAt, feed.scoreFromAt) : undefined

  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(contentItems)
    .where(and(scope, ...(eligibility ? [eligibility] : [])))

  const [{ scored }] = await db.select({ scored: sql<number>`count(*)` })
    .from(itemScores)
    .innerJoin(contentItems, eq(contentItems.id, itemScores.contentItemId))
    .where(and(
      eq(itemScores.userId, user.id),
      eq(itemScores.feedId, feed.id),
      ...(eligibility ? [eligibility] : []),
    ))

  const [{ aboveThreshold }] = await db.select({ aboveThreshold: sql<number>`count(*)` })
    .from(itemScores)
    .innerJoin(contentItems, eq(contentItems.id, itemScores.contentItemId))
    .where(and(
      eq(itemScores.userId, user.id),
      eq(itemScores.feedId, feed.id),
      gte(itemScores.score, minScore),
      ...(eligibility ? [eligibility] : []),
    ))

  const progress = getScoringProgress(user.id, feed.id)

  return c.json({
    total: Number(total),
    scored: Number(scored),
    pending: Number(total) - Number(scored),
    aboveThreshold: Number(aboveThreshold),
    active: isScoringActive(user.id, feed.id),
    batch: progress?.batch || 0,
    totalBatches: progress?.totalBatches || 0,
    log: progress?.log || [],
  })
})

aiRouter.get('/filtered-feed', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const { page, limit } = parsePagination(c)
  const timeline = await getTimelinePage({
    userId: user.id,
    feedId: feed.id,
    page,
    limit,
    minScore: feed.minScore,
  })

  return c.json({
    data: timeline.items,
    pagination: {
      page,
      limit,
      total: timeline.total,
      totalPages: Math.ceil(timeline.total / limit),
    },
  })
})

// ==================== REPORTS ====================

// In-memory report generation tracking
interface ReportProgress {
  startedAt: Date
  itemCount: number
  status: string
  content: string
  done: boolean
  error?: string
  items: TimelineItem[]
  subscribers: Set<(event: string) => void>
}
const reportGenerating = new Map<string, ReportProgress>()

aiRouter.get('/report-status', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const progress = reportGenerating.get(feedScopeKey(user.id, feed.id))
  return c.json({
    generating: !!progress && !progress.done && !progress.error,
    startedAt: progress?.startedAt || null,
    itemCount: progress?.itemCount || 0,
    status: progress?.status || null,
    error: progress?.error || null,
  })
})

export async function generateReportForUser(userId: string, feedId?: string | null, isAuto = false): Promise<any> {
  const feed = await getFeedForUser(userId, feedId)
  const progressKey = feedScopeKey(userId, feed.id)
  const existingProgress = reportGenerating.get(progressKey)
  if (existingProgress && !existingProgress.done) return null

  // Register progress immediately so /report-stream can find it before async work completes
  const progress: ReportProgress = {
    startedAt: new Date(), itemCount: 0, status: 'Preparing...',
    content: '', done: false, items: [], subscribers: new Set(),
  }
  reportGenerating.set(progressKey, progress)

  const emit = (event: string) => { for (const sub of progress.subscribers) sub(event) }
  const setStatus = (s: string) => { progress.status = s; emit(JSON.stringify({ status: s })) }

  const ai = await getAiConfig(userId)
  if (!ai) { reportGenerating.delete(progressKey); return null }
  const db = getDb(env.DATABASE_URL)

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const minScore = feed.minScore
  const scope = feedInputsScope(userId, feed.id)

  await scoreUnscoredTweets(userId, feed.id)

  const itemRows = await db
    .select({
      contentItem: contentItems,
      xPost: xPosts,
      redditPost: redditPosts,
      score: itemScores.score,
    })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
    .innerJoin(itemScores, and(
      eq(itemScores.contentItemId, contentItems.id),
      eq(itemScores.userId, userId),
      eq(itemScores.feedId, feed.id),
    ))
    .where(and(scope, gte(contentItems.publishedAt, since), gte(itemScores.score, minScore)))
    .orderBy(desc(contentItems.publishedAt))

  const aiItems = itemRows
    .map(({ score: _score, ...row }) => mapRowToAiItem(row))
    .filter((item): item is ItemForAI => !!item)
  const timelineItems = await serializeTimelineItems(itemRows)

  if (aiItems.length === 0) {
    if (isAuto) await db.update(aiScoringFeeds).set({ lastAutoReportAt: new Date(), updatedAt: new Date() }).where(eq(aiScoringFeeds.id, feed.id))
    reportGenerating.delete(progressKey)
    return null
  }

  progress.itemCount = aiItems.length
  progress.items = timelineItems

  try {
    setStatus(`Analyzing ${aiItems.length} posts...`)

    const systemPrompt = `${feed.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\n${REPORT_SYSTEM_PROMPT}`
    const itemText = formatItemsForAI(aiItems)
    const userContent = `Here are ${aiItems.length} posts from the last 24 hours (pre-filtered by relevance). Analyze and create a report:\n\n${itemText}`

    setStatus(`Waiting for AI response (${aiItems.length} posts)...`)

    // Stream content from AI provider
    let firstChunk = true
    for await (const chunk of callAIStream(ai.config, systemPrompt, userContent)) {
      if (firstChunk) { setStatus('Writing report...'); firstChunk = false }
      progress.content += chunk
      emit(JSON.stringify({ chunk }))
    }

    setStatus('Saving report...')
    const content = progress.content
    const refMatches = [...content.matchAll(/\[\[(?:item|tweet):([^\]]+)\]\]/g)]
    const itemRefIds = refMatches
      .map((m) => normalizeReportRefId(m[1]))
      .filter(Boolean)

    const [report] = await db.insert(aiReports).values({
      userId,
      feedId: feed.id,
      content,
      model: ai.settings.model,
      itemCount: aiItems.length,
      itemRefs: itemRefIds.length > 0 ? JSON.stringify(itemRefIds) : null,
    }).returning()

    if (isAuto) await db.update(aiScoringFeeds).set({ lastAutoReportAt: new Date(), updatedAt: new Date() }).where(eq(aiScoringFeeds.id, feed.id))

    progress.done = true
    for (const sub of progress.subscribers) sub('[DONE]')
    reportGenerating.delete(progressKey)
    void sendReportEmailsForReport(report.id).catch((err) =>
      console.error(`[ai] Report email send failed for report ${report.id}:`, err instanceof Error ? err.message : err),
    )
    console.log(`[ai] Generated report for user ${userId}, feed ${feed.id} (${aiItems.length} items)`)
    return report
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[ai] Report error for user ${userId}, feed ${feed.id}:`, errMsg)
    // Store error for frontend to display, auto-clear after 30s
    const entry = reportGenerating.get(progressKey)
    if (entry) {
      entry.error = errMsg
      entry.done = true
      for (const sub of entry.subscribers) sub(`[ERROR] ${errMsg}`)
      setTimeout(() => reportGenerating.delete(progressKey), 30_000)
    }
    throw err
  }
}

aiRouter.post('/report', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const progressKey = feedScopeKey(user.id, feed.id)

  const existing = reportGenerating.get(progressKey)
  if (existing && !existing.done) {
    return c.json({ error: 'Report is already being generated. Please wait.' }, 409)
  }
  // Clear errored/done entries so user can retry
  if (existing) reportGenerating.delete(progressKey)

  // Fire and forget — frontend connects to /report-stream for live content
  void generateReportForUser(user.id, feed.id).catch((err) =>
    console.error(`[ai] Report generation error for ${user.id}, feed ${feed.id}:`, err instanceof Error ? err.message : err),
  )

  return c.json({ ok: true })
})

// SSE stream of report content as it's generated
aiRouter.get('/report-stream', async (c) => {
  const user = c.get('user')
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const progress = reportGenerating.get(feedScopeKey(user.id, feed.id))

  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        let closed = false
        const requestSignal = c.req.raw.signal
        let onChunk: ((event: string) => void) | null = null
        const cleanup = () => {
          clearInterval(heartbeat)
          if (onChunk) progress?.subscribers.delete(onChunk)
          requestSignal?.removeEventListener?.('abort', onAbort)
        }
        const send = (data: string) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { closed = true; cleanup() }
        }
        const sendHeartbeat = () => {
          if (closed) return
          try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch { closed = true; cleanup() }
        }
        const close = () => {
          if (closed) return
          closed = true
          cleanup()
          try { controller.close() } catch {}
        }
        const onAbort = () => close()
        const heartbeat = setInterval(sendHeartbeat, 15_000)
        requestSignal?.addEventListener?.('abort', onAbort)

        if (!progress) {
          send('[DONE]')
          close()
          return
        }

        if (progress.items.length > 0) send(JSON.stringify({ items: progress.items }))
        if (progress.status) send(JSON.stringify({ status: progress.status }))
        if (progress.content) send(JSON.stringify({ content: progress.content }))

        if (progress.done || progress.error) {
          if (progress.error) send(`[ERROR] ${progress.error}`)
          else send('[DONE]')
          close()
          return
        }

        onChunk = (event: string) => {
          if (event === '[DONE]' || event.startsWith('[ERROR]')) {
            send(event)
            close()
          } else {
            send(event)
          }
        }
        progress.subscribers.add(onChunk)
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  )
})

aiRouter.get('/report', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))

  const [report] = await db.select().from(aiReports)
    .where(and(eq(aiReports.userId, user.id), eq(aiReports.feedId, feed.id)))
    .orderBy(desc(aiReports.createdAt))
    .limit(1)

  if (!report) return c.json({ report: null })

  return c.json({ report: await hydrateReport(db, report) })
})

// --- Past reports list ---
aiRouter.get('/reports', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const feed = await getFeedForUser(user.id, getRequestedFeedId(c))
  const page = Math.max(1, Number(c.req.query('page') || '1') || 1)
  const limit = 10
  const offset = (page - 1) * limit

  const reports = await db.select({
    id: aiReports.id,
    model: aiReports.model,
    itemCount: aiReports.itemCount,
    createdAt: aiReports.createdAt,
    feedId: aiReports.feedId,
  }).from(aiReports)
    .where(and(eq(aiReports.userId, user.id), eq(aiReports.feedId, feed.id)))
    .orderBy(desc(aiReports.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json({ reports })
})

// --- Get specific report by ID ---
aiRouter.get('/report/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)

  const [report] = await db.select().from(aiReports)
    .where(and(eq(aiReports.id, id), eq(aiReports.userId, user.id)))
    .limit(1)

  if (!report) return c.json({ error: 'Report not found' }, 404)

  return c.json({ report: await hydrateReport(db, report) })
})

export default aiRouter
