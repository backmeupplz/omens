import { zValidator } from '@hono/zod-validator'
import {
  aiReports,
  aiSettings,
  getDb,
  nudges,
  promptChanges,
  tweets,
  tweetScores,
  userTweets,
} from '@omens/db'
import { aiSettingsSchema, nudgeSchema, promptChangeSchema } from '@omens/shared'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import { parsePagination } from '../helpers/http'
import {
  DEFAULT_SYSTEM_PROMPT,
  FILTER_SYSTEM_PROMPT,
  META_PROMPT,
  REPORT_SYSTEM_PROMPT,
  callAI,
  callAIStream,
  formatTweetsForAI,
  listModels,
} from '../helpers/ai'
import type { AppEnv } from '../middleware/auth'
import { decrypt, encrypt } from '../helpers/crypto'

const aiRouter = new Hono<AppEnv>()

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

async function getUserMinScore(userId: string): Promise<number> {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db.select({ minScore: aiSettings.minScore })
    .from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1)
  return settings?.minScore ?? 50
}

async function hydrateReport(report: typeof aiReports.$inferSelect) {
  const db = getDb(env.DATABASE_URL)
  const tweetRefIds: string[] = report.tweetRefs ? JSON.parse(report.tweetRefs) : []
  const refTweets = tweetRefIds.length > 0
    ? await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
    : []
  return {
    id: report.id,
    content: report.content,
    model: report.model,
    tweetCount: report.tweetCount,
    tweetRefs: tweetRefIds,
    refTweets,
    createdAt: report.createdAt,
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
    return c.json({ configured: false, defaultPrompt: DEFAULT_SYSTEM_PROMPT, fetchIntervalMinutes: 15 })
  }

  let maskedKey = '••••••••'
  try {
    const raw = await decrypt(settings.apiKey)
    if (raw.length > 8) maskedKey = raw.slice(0, 4) + '••••' + raw.slice(-4)
  } catch {}

  // Compute next auto-report time server-side (matches fetcher logic exactly)
  let nextReportAt: number | null = null
  if (settings.reportIntervalHours > 0) {
    if (settings.reportIntervalHours >= 24) {
      const now = new Date()
      const todayTarget = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), settings.reportAtHour))
      nextReportAt = todayTarget.getTime() <= Date.now() ? todayTarget.getTime() + 86_400_000 : todayTarget.getTime()
    } else {
      const lastReport = settings.lastAutoReportAt?.getTime() || 0
      nextReportAt = lastReport + settings.reportIntervalHours * 3_600_000
    }
  }

  return c.json({
    configured: true,
    provider: settings.provider,
    apiKeyMasked: maskedKey,
    minScore: settings.minScore,
    fetchIntervalMinutes: settings.fetchIntervalMinutes,
    reportIntervalHours: settings.reportIntervalHours,
    reportAtHour: settings.reportAtHour,
    nextReportAt,
    baseUrl: settings.baseUrl || '',
    model: settings.model,
    systemPrompt: settings.systemPrompt || '',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    promptLastRegenAt: settings.promptLastRegenAt,
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
  return c.json({ ok: true })
})

aiRouter.put('/settings/prompt', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ systemPrompt?: string }>()
  const db = getDb(env.DATABASE_URL)

  const existing = await db.select({ id: aiSettings.id }).from(aiSettings)
    .where(eq(aiSettings.userId, user.id)).limit(1)
  if (existing.length === 0) return c.json({ error: 'AI not configured' }, 400)

  await db.update(aiSettings)
    .set({ systemPrompt: body.systemPrompt || null, updatedAt: new Date() })
    .where(eq(aiSettings.userId, user.id))
  return c.json({ ok: true })
})

aiRouter.put('/settings/min-score', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ minScore: number }>()
  const db = getDb(env.DATABASE_URL)
  const val = Math.max(0, Math.min(100, Math.round(body.minScore || 0)))
  await db.update(aiSettings).set({ minScore: val }).where(eq(aiSettings.userId, user.id))
  return c.json({ ok: true })
})

aiRouter.put('/settings/intervals', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ fetchIntervalMinutes?: number; reportIntervalHours?: number; reportAtHour?: number }>()
  const db = getDb(env.DATABASE_URL)
  const updates: Record<string, unknown> = {}
  if (body.fetchIntervalMinutes !== undefined) {
    updates.fetchIntervalMinutes = Math.max(0, Math.round(body.fetchIntervalMinutes))
  }
  if (body.reportIntervalHours !== undefined) {
    updates.reportIntervalHours = Math.max(0, Math.round(body.reportIntervalHours))
  }
  if (body.reportAtHour !== undefined) {
    updates.reportAtHour = Math.max(0, Math.min(23, Math.round(body.reportAtHour)))
  }
  if (Object.keys(updates).length > 0) {
    const existing = await db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, user.id)).limit(1)
    if (existing.length > 0) {
      await db.update(aiSettings).set(updates).where(eq(aiSettings.userId, user.id))
    } else {
      await db.insert(aiSettings).values({ userId: user.id, provider: '', apiKey: '', model: '', ...updates })
    }
  }
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
  const { tweetId, direction } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  await db.insert(nudges).values({
    userId: user.id,
    tweetId,
    direction,
  }).onConflictDoUpdate({
    target: [nudges.userId, nudges.tweetId],
    set: { direction, consumed: false, createdAt: new Date() },
  })
  return c.json({ ok: true })
})

aiRouter.delete('/nudge/:tweetId', async (c) => {
  const user = c.get('user')
  const tweetId = c.req.param('tweetId')
  const db = getDb(env.DATABASE_URL)
  await db.delete(nudges).where(
    and(eq(nudges.userId, user.id), eq(nudges.tweetId, tweetId)),
  )
  return c.json({ ok: true })
})

aiRouter.get('/nudges', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const rows = await db.select({
    tweetId: nudges.tweetId,
    direction: nudges.direction,
  }).from(nudges).where(eq(nudges.userId, user.id))
  return c.json({ nudges: rows })
})

// ==================== PROMPT CHANGES ====================

aiRouter.post('/prompt-change', zValidator('json', promptChangeSchema), async (c) => {
  const user = c.get('user')
  const { instruction } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)
  await db.insert(promptChanges).values({ userId: user.id, instruction })
  return c.json({ ok: true })
})

aiRouter.delete('/prompt-change/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  await db.delete(promptChanges).where(
    and(eq(promptChanges.id, id), eq(promptChanges.userId, user.id), eq(promptChanges.consumed, false)),
  )
  return c.json({ ok: true })
})

// ==================== AI INTERNALS ====================

aiRouter.get('/internals', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [settings] = await db.select().from(aiSettings)
    .where(eq(aiSettings.userId, user.id)).limit(1)

  const pendingNudgeRows = await db
    .select({
      id: nudges.id,
      tweetId: nudges.tweetId,
      direction: nudges.direction,
      createdAt: nudges.createdAt,
      tweetContent: tweets.content,
      authorHandle: tweets.authorHandle,
    })
    .from(nudges)
    .innerJoin(tweets, eq(nudges.tweetId, tweets.id))
    .where(and(eq(nudges.userId, user.id), eq(nudges.consumed, false)))
    .orderBy(desc(nudges.createdAt))

  const pendingInstructions = await db
    .select()
    .from(promptChanges)
    .where(and(eq(promptChanges.userId, user.id), eq(promptChanges.consumed, false)))
    .orderBy(desc(promptChanges.createdAt))

  // Compute auto-apply target as epoch ms (batcher runs every 60s)
  const allCreatedAts = [
    ...pendingNudgeRows.map((n) => n.createdAt?.getTime() || 0),
    ...pendingInstructions.map((p) => p.createdAt?.getTime() || 0),
  ].filter((t) => t > 0)
  const earliestPending = allCreatedAts.length > 0 ? Math.min(...allCreatedAts) : null
  const autoApplyAt = earliestPending ? earliestPending + 60_000 : null

  const isApplying = regenProgress.has(user.id) && !regenProgress.get(user.id)!.done

  return c.json({
    currentPrompt: settings?.systemPrompt || '',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    pendingNudges: pendingNudgeRows.map((n) => ({
      id: n.id,
      tweetId: n.tweetId,
      tweetContent: n.tweetContent?.slice(0, 200) || '',
      authorHandle: n.authorHandle,
      direction: n.direction,
    })),
    pendingInstructions: pendingInstructions.map((p) => ({
      id: p.id,
      instruction: p.instruction,
    })),
    lastRegenAt: settings?.promptLastRegenAt || null,
    autoApplyAt,
    isApplying,
  })
})

// ==================== PROMPT REGENERATION ====================

// In-memory regen progress
const regenProgress = new Map<string, { status: string; done: boolean; error?: string; subscribers: Set<(event: string) => void> }>()

export async function regeneratePromptForUser(userId: string, onStatus?: (s: string) => void): Promise<string | null> {
  const setStatus = (s: string) => {
    onStatus?.(s)
    const p = regenProgress.get(userId)
    if (p) { p.status = s; for (const sub of p.subscribers) sub(JSON.stringify({ status: s })) }
  }

  const ai = await getAiConfig(userId)
  if (!ai) return null
  const db = getDb(env.DATABASE_URL)

  setStatus('Collecting feedback...')

  // Get pending nudges with tweet context
  const pendingNudgeRows = await db
    .select({
      id: nudges.id,
      direction: nudges.direction,
      tweetContent: tweets.content,
      authorHandle: tweets.authorHandle,
    })
    .from(nudges)
    .innerJoin(tweets, eq(nudges.tweetId, tweets.id))
    .where(and(eq(nudges.userId, userId), eq(nudges.consumed, false)))

  const pendingInstructions = await db.select().from(promptChanges)
    .where(and(eq(promptChanges.userId, userId), eq(promptChanges.consumed, false)))

  if (pendingNudgeRows.length === 0 && pendingInstructions.length === 0) return null

  // Build feedback text
  const upTweets = pendingNudgeRows.filter((n) => n.direction === 'up')
  const downTweets = pendingNudgeRows.filter((n) => n.direction === 'down')

  let feedback = ''
  if (upTweets.length > 0) {
    feedback += 'Thumbs UP (show more like these):\n'
    feedback += upTweets.map((t) => `- @${t.authorHandle}: "${t.tweetContent?.slice(0, 150)}"`).join('\n')
    feedback += '\n\n'
  }
  if (downTweets.length > 0) {
    feedback += 'Thumbs DOWN (show less like these):\n'
    feedback += downTweets.map((t) => `- @${t.authorHandle}: "${t.tweetContent?.slice(0, 150)}"`).join('\n')
    feedback += '\n\n'
  }
  if (pendingInstructions.length > 0) {
    feedback += 'Text instructions:\n'
    feedback += pendingInstructions.map((p) => `- "${p.instruction}"`).join('\n')
  }

  const userMsg = `DEFAULT PROMPT:\n${DEFAULT_SYSTEM_PROMPT}\n\nCURRENT PROMPT:\n${ai.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\nUSER FEEDBACK:\n${feedback}`

  setStatus(`Sending ${pendingNudgeRows.length} nudges + ${pendingInstructions.length} instructions to AI...`)

  const newPrompt = await callAI(ai.config, META_PROMPT, userMsg)

  setStatus('Saving new prompt...')

  // Save new prompt and mark consumed
  await db.update(aiSettings).set({
    systemPrompt: newPrompt.trim(),
    promptLastRegenAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(aiSettings.userId, userId))

  const nudgeIds = pendingNudgeRows.map((n) => n.id)
  if (nudgeIds.length > 0) {
    await db.update(nudges).set({ consumed: true }).where(inArray(nudges.id, nudgeIds))
  }
  const instrIds = pendingInstructions.map((p) => p.id)
  if (instrIds.length > 0) {
    await db.update(promptChanges).set({ consumed: true }).where(inArray(promptChanges.id, instrIds))
  }

  console.log(`[ai] Regenerated prompt for user ${userId} (${nudgeIds.length} nudges, ${instrIds.length} instructions)`)
  return newPrompt
}

aiRouter.post('/regenerate-prompt', async (c) => {
  const user = c.get('user')

  if (regenProgress.has(user.id)) {
    return c.json({ error: 'Already regenerating' }, 409)
  }

  const progress: { status: string; done: boolean; error?: string; subscribers: Set<(event: string) => void> } = { status: 'Starting...', done: false, subscribers: new Set() }
  regenProgress.set(user.id, progress)

  // Fire and forget — frontend connects to SSE
  void (async () => {
    try {
      const result = await regeneratePromptForUser(user.id)
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
      setTimeout(() => regenProgress.delete(user.id), 10_000)
    }
  })()

  return c.json({ ok: true })
})

aiRouter.get('/regenerate-status', async (c) => {
  const user = c.get('user')
  const p = regenProgress.get(user.id)
  return c.json({
    active: !!p && !p.done,
    status: p?.status || null,
    error: p?.error || null,
  })
})

aiRouter.get('/regenerate-stream', async (c) => {
  const user = c.get('user')
  const progress = regenProgress.get(user.id)

  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false
        const encoder = new TextEncoder()
        const send = (data: string) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { closed = true }
        }
        const close = () => { if (closed) return; closed = true; try { controller.close() } catch {} }

        if (!progress || progress.done) {
          if (progress?.error) send(`[ERROR] ${progress.error}`)
          else send('[DONE]')
          close()
          return
        }

        if (progress.status) send(JSON.stringify({ status: progress.status }))

        const onEvent = (event: string) => {
          if (event === '[DONE]' || event.startsWith('[ERROR]')) {
            send(event)
            close()
            progress.subscribers.delete(onEvent)
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

export function getScoringProgress(userId: string) {
  return scoringProgress.get(userId) || null
}

export function isScoringActive(userId: string) {
  return scoringActive.has(userId)
}

export async function scoreUnscoredTweets(userId: string): Promise<number> {
  // Skip if already scoring for this user
  if (scoringActive.has(userId)) return 0
  scoringActive.add(userId)

  const ai = await getAiConfig(userId)
  if (!ai) { scoringActive.delete(userId); return 0 }
  const db = getDb(env.DATABASE_URL)

  const allTweets = await db
    .select({ id: tweets.id, tweetId: tweets.tweetId, authorId: tweets.authorId, authorName: tweets.authorName, authorHandle: tweets.authorHandle, authorAvatar: tweets.authorAvatar, authorFollowers: tweets.authorFollowers, authorBio: tweets.authorBio, content: tweets.content, mediaUrls: tweets.mediaUrls, isRetweet: tweets.isRetweet, quotedTweet: tweets.quotedTweet, card: tweets.card, replyToHandle: tweets.replyToHandle, url: tweets.url, likes: tweets.likes, retweets: tweets.retweets, replies: tweets.replies, views: tweets.views, publishedAt: tweets.publishedAt, fetchedAt: tweets.fetchedAt })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .where(and(
      eq(userTweets.userId, userId),
      sql`NOT EXISTS (SELECT 1 FROM tweet_scores WHERE tweet_scores.tweet_id = tweets.id AND tweet_scores.user_id = ${userId})`,
    ))
    .orderBy(desc(tweets.publishedAt))

  if (allTweets.length === 0) { scoringActive.delete(userId); scoringProgress.delete(userId); return 0 }

  const BATCH_SIZE = 10
  const totalBatches = Math.ceil(allTweets.length / BATCH_SIZE)
  const log: string[] = [`Found ${allTweets.length} unscored posts`]
  scoringProgress.set(userId, { batch: 0, totalBatches, batchSize: BATCH_SIZE, log })
  const userPrefs = ai.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT
  let totalScored = 0

  for (let i = 0; i < allTweets.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    log.push(`Sending batch ${batchNum}/${totalBatches} to ${ai.config.provider}...`)
    scoringProgress.set(userId, { batch: batchNum, totalBatches, batchSize: BATCH_SIZE, log })

    const batch = allTweets.slice(i, i + BATCH_SIZE)
    const tweetText = formatTweetsForAI(batch)
    const prompt = `${FILTER_SYSTEM_PROMPT}\n\nUser preferences:\n${userPrefs}`

    const validIds = new Set(batch.map((t) => t.id))

    try {
      let response = await callAI(ai.config, prompt, tweetText)
      response = response.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim()
      const scores: Array<{ id: string; score: number }> = JSON.parse(response)

      const validScores = scores.filter(
        (s): s is { id: string; score: number } =>
          typeof s.id === 'string' && typeof s.score === 'number' && validIds.has(s.id),
      )
      await Promise.all(validScores.map((s) =>
        db.insert(tweetScores).values({
          userId: userId,
          tweetId: s.id,
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
  scoringProgress.delete(userId)
  scoringActive.delete(userId)
  if (totalScored > 0) console.log(`[ai] Scored ${totalScored} tweets for user ${userId}`)
  return totalScored
}

aiRouter.post('/filter', async (c) => {
  const user = c.get('user')
  const scored = await scoreUnscoredTweets(user.id)
  return c.json({ ok: true, scored })
})

aiRouter.get('/scoring-status', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const minScore = await getUserMinScore(user.id)

  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(userTweets).where(eq(userTweets.userId, user.id))

  const [{ scored }] = await db.select({ scored: sql<number>`count(*)` })
    .from(tweetScores).where(eq(tweetScores.userId, user.id))

  // Count how many scored tweets are above threshold (for "N new posts" banner)
  const [{ aboveThreshold }] = await db.select({ aboveThreshold: sql<number>`count(*)` })
    .from(tweetScores).where(and(eq(tweetScores.userId, user.id), gte(tweetScores.score, minScore)))

  const progress = getScoringProgress(user.id)

  return c.json({
    total: Number(total),
    scored: Number(scored),
    pending: Number(total) - Number(scored),
    aboveThreshold: Number(aboveThreshold),
    active: isScoringActive(user.id),
    batch: progress?.batch || 0,
    totalBatches: progress?.totalBatches || 0,
    log: progress?.log || [],
  })
})

aiRouter.get('/filtered-feed', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const minScore = await getUserMinScore(user.id)
  const { page, limit, offset } = parsePagination(c)

  const result = await db
    .select({
      tweet: tweets,
      score: tweetScores.score,
    })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .innerJoin(tweetScores, and(
      eq(tweetScores.tweetId, tweets.id),
      eq(tweetScores.userId, user.id),
    ))
    .where(and(
      eq(userTweets.userId, user.id),
      gte(tweetScores.score, minScore),
    ))
    .orderBy(desc(tweets.publishedAt))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .innerJoin(tweetScores, and(
      eq(tweetScores.tweetId, tweets.id),
      eq(tweetScores.userId, user.id),
    ))
    .where(and(eq(userTweets.userId, user.id), gte(tweetScores.score, minScore)))

  // Resolve parent tweets for replies
  const replyIds = result.map((r) => r.tweet.replyToTweetId).filter((id): id is string => !!id)
  const parentMap = new Map<string, typeof tweets.$inferSelect>()
  if (replyIds.length > 0) {
    const parents = await db.select().from(tweets).where(inArray(tweets.tweetId, replyIds))
    for (const p of parents) parentMap.set(p.tweetId, p)
  }

  return c.json({
    data: result.map((r) => ({
      ...r.tweet, score: r.score,
      parentTweet: r.tweet.replyToTweetId ? parentMap.get(r.tweet.replyToTweetId) ?? null : null,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  })
})

// ==================== REPORTS ====================

// In-memory report generation tracking
interface ReportProgress {
  startedAt: Date
  tweetCount: number
  status: string
  content: string
  done: boolean
  error?: string
  tweets: Array<{ id: string; [key: string]: any }>
  subscribers: Set<(event: string) => void>
}
const reportGenerating = new Map<string, ReportProgress>()

aiRouter.get('/report-status', async (c) => {
  const user = c.get('user')
  const progress = reportGenerating.get(user.id)
  return c.json({
    generating: !!progress && !progress.done && !progress.error,
    startedAt: progress?.startedAt || null,
    tweetCount: progress?.tweetCount || 0,
    status: progress?.status || null,
    error: progress?.error || null,
  })
})

export async function generateReportForUser(userId: string, isAuto = false): Promise<any> {
  const existingProgress = reportGenerating.get(userId)
  if (existingProgress && !existingProgress.done) return null

  // Register progress immediately so /report-stream can find it before async work completes
  const progress: ReportProgress = {
    startedAt: new Date(), tweetCount: 0, status: 'Preparing...',
    content: '', done: false, tweets: [], subscribers: new Set(),
  }
  reportGenerating.set(userId, progress)

  const emit = (event: string) => { for (const sub of progress.subscribers) sub(event) }
  const setStatus = (s: string) => { progress.status = s; emit(JSON.stringify({ status: s })) }

  const ai = await getAiConfig(userId)
  if (!ai) { reportGenerating.delete(userId); return null }
  const db = getDb(env.DATABASE_URL)

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const minScore = await getUserMinScore(userId)

  // Use all scored tweets from the AI-filtered feed (score >= minScore) in the last 24h
  let tweetList = await db.select({ tweet: tweets })
    .from(tweets)
    .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
    .innerJoin(tweetScores, and(eq(tweetScores.tweetId, tweets.id), eq(tweetScores.userId, userId)))
    .where(and(eq(userTweets.userId, userId), gte(tweets.publishedAt, since), gte(tweetScores.score, minScore)))
    .orderBy(desc(tweets.publishedAt))
    .then((rows) => rows.map((r) => r.tweet))

  // Fallback to all tweets from last 24h if nothing scored yet
  if (tweetList.length === 0) {
    tweetList = await db.select({ tweet: tweets })
      .from(tweets)
      .innerJoin(userTweets, eq(userTweets.tweetId, tweets.id))
      .where(and(eq(userTweets.userId, userId), gte(tweets.publishedAt, since)))
      .orderBy(desc(tweets.publishedAt))
      .then((rows) => rows.map((r) => r.tweet))
  }

  if (tweetList.length === 0) {
    // Update lastAutoReportAt to prevent retry every 5 minutes (only for auto)
    if (isAuto) await db.update(aiSettings).set({ lastAutoReportAt: new Date() }).where(eq(aiSettings.userId, userId))
    reportGenerating.delete(userId)
    return null
  }

  progress.tweetCount = tweetList.length
  progress.tweets = tweetList

  try {
    setStatus(`Analyzing ${tweetList.length} posts...`)

    const systemPrompt = `${ai.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\n${REPORT_SYSTEM_PROMPT}`
    const tweetText = formatTweetsForAI(tweetList)
    const userContent = `Here are ${tweetList.length} posts from the last 24 hours (pre-filtered by relevance). Analyze and create a report:\n\n${tweetText}`

    setStatus(`Waiting for AI response (${tweetList.length} posts)...`)

    // Stream content from AI provider
    let firstChunk = true
    for await (const chunk of callAIStream(ai.config, systemPrompt, userContent)) {
      if (firstChunk) { setStatus('Writing report...'); firstChunk = false }
      progress.content += chunk
      emit(JSON.stringify({ chunk }))
    }

    setStatus('Saving report...')
    const content = progress.content
    const refMatches = [...content.matchAll(/\[\[tweet:([^\]]+)\]\]/g)]
    const tweetRefIds = refMatches.map((m) => m[1])

    const [report] = await db.insert(aiReports).values({
      userId,
      content,
      model: ai.settings.model,
      tweetCount: tweetList.length,
      tweetRefs: tweetRefIds.length > 0 ? JSON.stringify(tweetRefIds) : null,
    }).returning()

    if (isAuto) await db.update(aiSettings).set({ lastAutoReportAt: new Date() }).where(eq(aiSettings.userId, userId))

    progress.done = true
    for (const sub of progress.subscribers) sub('[DONE]')
    reportGenerating.delete(userId)
    console.log(`[ai] Generated report for user ${userId} (${tweetList.length} tweets)`)
    return report
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[ai] Report error for user ${userId}:`, errMsg)
    // Store error for frontend to display, auto-clear after 30s
    const entry = reportGenerating.get(userId)
    if (entry) {
      entry.error = errMsg
      entry.done = true
      for (const sub of entry.subscribers) sub(`[ERROR] ${errMsg}`)
      setTimeout(() => reportGenerating.delete(userId), 30_000)
    }
    throw err
  }
}

aiRouter.post('/report', async (c) => {
  const user = c.get('user')

  const existing = reportGenerating.get(user.id)
  if (existing && !existing.done) {
    return c.json({ error: 'Report is already being generated. Please wait.' }, 409)
  }
  // Clear errored/done entries so user can retry
  if (existing) reportGenerating.delete(user.id)

  // Fire and forget — frontend connects to /report-stream for live content
  void generateReportForUser(user.id).catch((err) =>
    console.error(`[ai] Report generation error for ${user.id}:`, err instanceof Error ? err.message : err),
  )

  return c.json({ ok: true })
})

// SSE stream of report content as it's generated
aiRouter.get('/report-stream', async (c) => {
  const user = c.get('user')
  const progress = reportGenerating.get(user.id)

  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        let closed = false
        const send = (data: string) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { closed = true }
        }
        const close = () => {
          if (closed) return
          closed = true
          try { controller.close() } catch {}
        }

        if (!progress) {
          send('[DONE]')
          close()
          return
        }

        if (progress.tweets.length > 0) send(JSON.stringify({ tweets: progress.tweets }))
        if (progress.status) send(JSON.stringify({ status: progress.status }))
        if (progress.content) send(JSON.stringify({ content: progress.content }))

        if (progress.done || progress.error) {
          if (progress.error) send(`[ERROR] ${progress.error}`)
          else send('[DONE]')
          close()
          return
        }

        const onChunk = (event: string) => {
          if (event === '[DONE]' || event.startsWith('[ERROR]')) {
            send(event)
            close()
            progress.subscribers.delete(onChunk)
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

  const [report] = await db.select().from(aiReports)
    .where(eq(aiReports.userId, user.id))
    .orderBy(desc(aiReports.createdAt))
    .limit(1)

  if (!report) return c.json({ report: null })

  return c.json({ report: await hydrateReport(report) })
})

// --- Past reports list ---
aiRouter.get('/reports', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)
  const page = Math.max(1, Number(c.req.query('page') || '1') || 1)
  const limit = 10
  const offset = (page - 1) * limit

  const reports = await db.select({
    id: aiReports.id,
    model: aiReports.model,
    tweetCount: aiReports.tweetCount,
    createdAt: aiReports.createdAt,
  }).from(aiReports)
    .where(eq(aiReports.userId, user.id))
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

  return c.json({ report: await hydrateReport(report) })
})

export default aiRouter
