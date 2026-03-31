import { zValidator } from '@hono/zod-validator'
import { aiReports, aiSettings, getDb, tweets } from '@omens/db'
import { aiSettingsSchema } from '@omens/shared'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import {
  DEFAULT_SYSTEM_PROMPT,
  callAI,
  formatTweetsForAI,
  listModels,
} from '../helpers/ai'
import type { AppEnv } from '../middleware/auth'
import { decrypt, encrypt } from '../helpers/crypto'

const aiRouter = new Hono<AppEnv>()

// --- GET /settings ---
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

  // Mask the API key
  let maskedKey = '••••••••'
  try {
    const raw = await decrypt(settings.apiKey)
    if (raw.length > 8) {
      maskedKey = raw.slice(0, 4) + '••••' + raw.slice(-4)
    }
  } catch {}

  return c.json({
    configured: true,
    provider: settings.provider,
    apiKeyMasked: maskedKey,
    baseUrl: settings.baseUrl || '',
    model: settings.model,
    systemPrompt: settings.systemPrompt || '',
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
  })
})

// --- PUT /settings ---
aiRouter.put('/settings', zValidator('json', aiSettingsSchema), async (c) => {
  const user = c.get('user')
  const { provider, apiKey, baseUrl, model, systemPrompt } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  const existing = await db
    .select({ id: aiSettings.id, apiKey: aiSettings.apiKey })
    .from(aiSettings)
    .where(eq(aiSettings.userId, user.id))
    .limit(1)

  // Keep existing key if sentinel value sent
  const keepKey = apiKey === 'keep-existing' && existing.length > 0
  const encryptedKey = keepKey ? existing[0].apiKey : await encrypt(apiKey)

  if (existing.length > 0) {
    await db
      .update(aiSettings)
      .set({
        provider,
        apiKey: encryptedKey,
        baseUrl: baseUrl || null,
        model,
        systemPrompt: systemPrompt || null,
        updatedAt: new Date(),
      })
      .where(eq(aiSettings.userId, user.id))
  } else {
    if (keepKey) {
      return c.json({ error: 'API key is required for new configuration' }, 400)
    }
    await db.insert(aiSettings).values({
      userId: user.id,
      provider,
      apiKey: encryptedKey,
      baseUrl: baseUrl || null,
      model,
      systemPrompt: systemPrompt || null,
    })
  }

  console.log(`[ai] User ${user.id} updated AI settings: ${provider}/${model}`)
  return c.json({ ok: true })
})

// --- PUT /settings/prompt ---
aiRouter.put('/settings/prompt', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ systemPrompt?: string }>()
  const db = getDb(env.DATABASE_URL)

  const existing = await db
    .select({ id: aiSettings.id })
    .from(aiSettings)
    .where(eq(aiSettings.userId, user.id))
    .limit(1)

  if (existing.length === 0) {
    return c.json({ error: 'AI not configured' }, 400)
  }

  await db
    .update(aiSettings)
    .set({ systemPrompt: body.systemPrompt || null, updatedAt: new Date() })
    .where(eq(aiSettings.userId, user.id))

  return c.json({ ok: true })
})

// --- GET /models ---
aiRouter.get('/models', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [settings] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, user.id))
    .limit(1)

  if (!settings) {
    return c.json({ models: [], error: 'AI not configured' })
  }

  try {
    const apiKey = await decrypt(settings.apiKey)
    const models = await listModels({
      provider: settings.provider as any,
      apiKey,
      baseUrl: settings.baseUrl || '',
    })
    return c.json({ models })
  } catch (err) {
    console.error('[ai] Model list error:', err instanceof Error ? err.message : err)
    return c.json({ models: [], error: 'Failed to fetch models' })
  }
})

// --- GET /models/:provider — fetch models for a provider before settings are saved ---
aiRouter.post('/models/preview', zValidator('json', aiSettingsSchema.pick({ provider: true, apiKey: true, baseUrl: true })), async (c) => {
  const { provider, apiKey, baseUrl } = c.req.valid('json')

  try {
    const models = await listModels({
      provider,
      apiKey,
      baseUrl: baseUrl || '',
    })
    return c.json({ models })
  } catch (err) {
    console.error('[ai] Model preview error:', err instanceof Error ? err.message : err)
    return c.json({ models: [], error: 'Failed to fetch models' })
  }
})

// --- POST /report ---
aiRouter.post('/report', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [settings] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, user.id))
    .limit(1)

  if (!settings) {
    return c.json({ error: 'AI not configured. Go to Settings to set up your AI provider.' }, 400)
  }

  // Fetch recent tweets
  const recentTweets = await db
    .select()
    .from(tweets)
    .where(eq(tweets.userId, user.id))
    .orderBy(desc(tweets.publishedAt))
    .limit(200)

  if (recentTweets.length === 0) {
    return c.json({ error: 'No posts to analyze. Refresh your feed first.' }, 400)
  }

  try {
    const apiKey = await decrypt(settings.apiKey)
    const systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT
    const tweetText = formatTweetsForAI(recentTweets)

    const userContent = `Here are ${recentTweets.length} recent posts from my X/Twitter feed. Please analyze them and give me a report:\n\n${tweetText}`

    const content = await callAI(
      {
        provider: settings.provider as any,
        apiKey,
        baseUrl: settings.baseUrl || '',
        model: settings.model,
      },
      systemPrompt,
      userContent,
    )

    // Save report
    const [report] = await db
      .insert(aiReports)
      .values({
        userId: user.id,
        content,
        model: settings.model,
        tweetCount: recentTweets.length,
      })
      .returning()

    return c.json({
      content: report.content,
      model: report.model,
      tweetCount: report.tweetCount,
      createdAt: report.createdAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Report generation failed'
    console.error(`[ai] Report error for user ${user.id}:`, msg)
    return c.json({ error: msg }, 500)
  }
})

// --- GET /report ---
aiRouter.get('/report', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [report] = await db
    .select()
    .from(aiReports)
    .where(eq(aiReports.userId, user.id))
    .orderBy(desc(aiReports.createdAt))
    .limit(1)

  if (!report) {
    return c.json({ report: null })
  }

  return c.json({
    report: {
      content: report.content,
      model: report.model,
      tweetCount: report.tweetCount,
      createdAt: report.createdAt,
    },
  })
})

export default aiRouter
