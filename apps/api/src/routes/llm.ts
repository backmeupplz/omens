import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { llmConfigSchema } from '@omens/shared'
import { getDb, llmConfigs } from '@omens/db'
import { PROVIDERS } from '../helpers/providers'
import type { AuthUser } from '../middleware/auth'
import env from '../env'

const llmRouter = new Hono<{ Variables: { user: AuthUser } }>()

llmRouter.get('/config', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [config] = await db
    .select()
    .from(llmConfigs)
    .where(eq(llmConfigs.userId, user.id))
    .limit(1)

  if (!config) {
    return c.json({
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      baseUrl: env.LLM_BASE_URL,
      hasApiKey: !!env.LLM_API_KEY,
    })
  }

  return c.json({
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    hasApiKey: !!config.apiKey,
    options: config.options,
  })
})

llmRouter.put(
  '/config',
  zValidator('json', llmConfigSchema),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')
    const db = getDb(env.DATABASE_URL)

    const [existing] = await db
      .select()
      .from(llmConfigs)
      .where(eq(llmConfigs.userId, user.id))
      .limit(1)

    if (existing) {
      const [updated] = await db
        .update(llmConfigs)
        .set({
          provider: body.provider,
          model: body.model,
          apiKey: body.apiKey ?? existing.apiKey,
          baseUrl: body.baseUrl,
          options: body.options as Record<string, unknown> | undefined,
        })
        .where(eq(llmConfigs.userId, user.id))
        .returning()
      return c.json({
        provider: updated.provider,
        model: updated.model,
        baseUrl: updated.baseUrl,
        hasApiKey: !!updated.apiKey,
        options: updated.options,
      })
    }

    const [created] = await db
      .insert(llmConfigs)
      .values({
        userId: user.id,
        provider: body.provider,
        model: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
        options: body.options as Record<string, unknown> | undefined,
      })
      .returning()

    return c.json({
      provider: created.provider,
      model: created.model,
      baseUrl: created.baseUrl,
      hasApiKey: !!created.apiKey,
      options: created.options,
    })
  },
)

llmRouter.get('/providers', (c) => {
  return c.json(PROVIDERS)
})

export default llmRouter
