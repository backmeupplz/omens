import { zValidator } from '@hono/zod-validator'
import {
  aiReports,
  aiSettings,
  getDb,
  nudges,
  promptChanges,
  tweets,
  tweetScores,
} from '@omens/db'
import { aiSettingsSchema, nudgeSchema, promptChangeSchema } from '@omens/shared'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import {
  DEFAULT_SYSTEM_PROMPT,
  FILTER_SYSTEM_PROMPT,
  META_PROMPT,
  REPORT_SYSTEM_PROMPT,
  callAI,
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
    return c.json({ configured: false, defaultPrompt: DEFAULT_SYSTEM_PROMPT })
  }

  let maskedKey = '••••••••'
  try {
    const raw = await decrypt(settings.apiKey)
    if (raw.length > 8) maskedKey = raw.slice(0, 4) + '••••' + raw.slice(-4)
  } catch {}

  return c.json({
    configured: true,
    provider: settings.provider,
    apiKeyMasked: maskedKey,
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

  return c.json({
    currentPrompt: settings?.systemPrompt || '',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    pendingNudges: pendingNudgeRows.map((n) => ({
      id: n.id,
      tweetId: n.tweetId,
      tweetContent: n.tweetContent?.slice(0, 100) || '',
      authorHandle: n.authorHandle,
      direction: n.direction,
      createdAt: n.createdAt,
    })),
    pendingInstructions: pendingInstructions.map((p) => ({
      id: p.id,
      instruction: p.instruction,
      createdAt: p.createdAt,
    })),
    lastRegenAt: settings?.promptLastRegenAt || null,
  })
})

// ==================== PROMPT REGENERATION ====================

export async function regeneratePromptForUser(userId: string): Promise<string | null> {
  const ai = await getAiConfig(userId)
  if (!ai) return null
  const db = getDb(env.DATABASE_URL)

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

  const newPrompt = await callAI(ai.config, META_PROMPT, userMsg)

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
  try {
    const newPrompt = await regeneratePromptForUser(user.id)
    if (!newPrompt) return c.json({ ok: true, message: 'No pending changes' })
    return c.json({ ok: true, newPrompt })
  } catch (err) {
    console.error('[ai] Prompt regen error:', err instanceof Error ? err.message : err)
    return c.json({ error: 'Failed to regenerate prompt' }, 500)
  }
})

// ==================== FEED FILTERING ====================

aiRouter.post('/filter', async (c) => {
  const user = c.get('user')
  const ai = await getAiConfig(user.id)
  if (!ai) return c.json({ error: 'AI not configured' }, 400)
  const db = getDb(env.DATABASE_URL)

  // Get tweets without scores
  const unscored = await db
    .select()
    .from(tweets)
    .where(eq(tweets.userId, user.id))
    .orderBy(desc(tweets.publishedAt))
    .limit(200)

  // Filter out already scored
  const existingScores = await db.select({ tweetId: tweetScores.tweetId })
    .from(tweetScores).where(eq(tweetScores.userId, user.id))
  const scoredSet = new Set(existingScores.map((s) => s.tweetId))
  const toScore = unscored.filter((t) => !scoredSet.has(t.id))

  if (toScore.length === 0) return c.json({ ok: true, scored: 0 })

  const userPrefs = ai.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT
  let totalScored = 0

  // Process in batches of 50
  for (let i = 0; i < toScore.length; i += 50) {
    const batch = toScore.slice(i, i + 50)
    const tweetText = formatTweetsForAI(batch)
    const prompt = `${FILTER_SYSTEM_PROMPT}\n\nUser preferences:\n${userPrefs}`

    try {
      let response = await callAI(ai.config, prompt, tweetText)
      // Strip markdown code blocks if present
      response = response.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim()
      const scores: Array<{ id: string; score: number }> = JSON.parse(response)

      for (const s of scores) {
        if (typeof s.id === 'string' && typeof s.score === 'number') {
          await db.insert(tweetScores).values({
            userId: user.id,
            tweetId: s.id,
            score: Math.max(0, Math.min(100, Math.round(s.score))),
          }).onConflictDoNothing()
          totalScored++
        }
      }
    } catch (err) {
      console.error(`[ai] Filter batch error:`, err instanceof Error ? err.message : err)
    }
  }

  return c.json({ ok: true, scored: totalScored })
})

aiRouter.get('/filtered-feed', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const page = Math.max(1, Number(c.req.query('page') || '1') || 1)
  const limit = Math.max(1, Math.min(Number(c.req.query('limit') || '50') || 50, 100))
  const offset = (page - 1) * limit

  const result = await db
    .select({
      tweet: tweets,
      score: tweetScores.score,
    })
    .from(tweets)
    .innerJoin(tweetScores, and(
      eq(tweetScores.tweetId, tweets.id),
      eq(tweetScores.userId, user.id),
    ))
    .where(and(
      eq(tweets.userId, user.id),
      gte(tweetScores.score, 50),
    ))
    .orderBy(desc(tweetScores.score), desc(tweets.publishedAt))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tweets)
    .innerJoin(tweetScores, and(
      eq(tweetScores.tweetId, tweets.id),
      eq(tweetScores.userId, user.id),
    ))
    .where(and(eq(tweets.userId, user.id), gte(tweetScores.score, 50)))

  return c.json({
    data: result.map((r) => ({ ...r.tweet, score: r.score })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  })
})

// ==================== REPORTS ====================

aiRouter.post('/report', async (c) => {
  const user = c.get('user')
  const ai = await getAiConfig(user.id)
  if (!ai) return c.json({ error: 'AI not configured. Go to Settings to set up your AI provider.' }, 400)
  const db = getDb(env.DATABASE_URL)

  // Last 24 hours of tweets
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentTweets = await db.select().from(tweets)
    .where(and(eq(tweets.userId, user.id), gte(tweets.publishedAt, since)))
    .orderBy(desc(tweets.publishedAt))
    .limit(200)

  if (recentTweets.length === 0) {
    return c.json({ error: 'No posts from the last 24 hours to analyze.' }, 400)
  }

  try {
    const systemPrompt = `${ai.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\n${REPORT_SYSTEM_PROMPT}`
    const tweetText = formatTweetsForAI(recentTweets)
    const userContent = `Here are ${recentTweets.length} posts from the last 24 hours. Analyze and create a report:\n\n${tweetText}`

    const content = await callAI(ai.config, systemPrompt, userContent)

    // Extract tweet refs from [[tweet:ID]] markers
    const refMatches = [...content.matchAll(/\[\[tweet:([^\]]+)\]\]/g)]
    const tweetRefIds = refMatches.map((m) => m[1])

    const [report] = await db.insert(aiReports).values({
      userId: user.id,
      content,
      model: ai.settings.model,
      tweetCount: recentTweets.length,
      tweetRefs: tweetRefIds.length > 0 ? JSON.stringify(tweetRefIds) : null,
    }).returning()

    return c.json({
      content: report.content,
      model: report.model,
      tweetCount: report.tweetCount,
      tweetRefs: tweetRefIds,
      createdAt: report.createdAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Report generation failed'
    console.error(`[ai] Report error for user ${user.id}:`, msg)
    return c.json({ error: msg }, 500)
  }
})

aiRouter.get('/report', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [report] = await db.select().from(aiReports)
    .where(eq(aiReports.userId, user.id))
    .orderBy(desc(aiReports.createdAt))
    .limit(1)

  if (!report) return c.json({ report: null })

  const tweetRefIds: string[] = report.tweetRefs ? JSON.parse(report.tweetRefs) : []

  // Fetch referenced tweets
  let refTweets: any[] = []
  if (tweetRefIds.length > 0) {
    refTweets = await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
  }

  return c.json({
    report: {
      content: report.content,
      model: report.model,
      tweetCount: report.tweetCount,
      tweetRefs: tweetRefIds,
      refTweets,
      createdAt: report.createdAt,
    },
  })
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

  const tweetRefIds: string[] = report.tweetRefs ? JSON.parse(report.tweetRefs) : []
  let refTweets: any[] = []
  if (tweetRefIds.length > 0) {
    refTweets = await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
  }

  return c.json({
    report: {
      id: report.id,
      content: report.content,
      model: report.model,
      tweetCount: report.tweetCount,
      tweetRefs: tweetRefIds,
      refTweets,
      createdAt: report.createdAt,
    },
  })
})

export default aiRouter
