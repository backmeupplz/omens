import { generateObject } from 'ai'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, signals, items, llmConfigs, users } from '@omens/db'
import { createLLMClient } from './client'
import env from '../env'

const batchSignalSchema = z.object({
  signals: z.array(
    z.object({
      index: z.number().describe('Index of the item in the batch'),
      score: z
        .number()
        .min(0)
        .max(100)
        .describe('Relevance score 0-100'),
      summary: z
        .string()
        .max(500)
        .describe('Why this is relevant signal'),
      tags: z
        .array(z.string())
        .max(5)
        .describe('Category tags'),
    }),
  ),
})

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function processItems(
  userId: string,
  itemIds: string[],
) {
  const db = getDb(env.DATABASE_URL)

  // Get user's LLM config
  const [llmConfig] = await db
    .select()
    .from(llmConfigs)
    .where(eq(llmConfigs.userId, userId))
    .limit(1)

  const config = llmConfig || {
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    apiKey: env.LLM_API_KEY || null,
    baseUrl: env.LLM_BASE_URL || null,
  }

  if (!config.apiKey) {
    console.error(`[llm] No API key for user ${userId}, skipping`)
    return
  }

  // Get user's interests
  const [user] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const interests =
    user?.settings?.interests || 'general technology and news'
  const minScore = user?.settings?.minScore ?? 30

  // Get items
  const itemRows = await db
    .select()
    .from(items)
    .where(
      // Only items in our batch
      ...itemIds.map((id) => eq(items.id, id)) as any,
    )

  // Simpler: just fetch by IDs
  const allItems = []
  for (const id of itemIds) {
    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .limit(1)
    if (item) allItems.push(item)
  }

  if (allItems.length === 0) return

  const model = createLLMClient(config)
  const batches = chunk(allItems, 10)

  for (const batch of batches) {
    try {
      const prompt = batch
        .map(
          (item, i) =>
            `[${i}] ${item.title}\n${item.content.substring(0, 500)}\nSource: ${item.url}`,
        )
        .join('\n\n---\n\n')

      const { object } = await generateObject({
        model,
        system: `You are a signal extraction tool called Omens. Your job is to find signal in noise.

The user is interested in: ${interests}

Analyze each item and score its relevance to the user's interests from 0-100:
- 80-100: Must-see, highly relevant breakthrough or critical news
- 60-79: Interesting and relevant, worth reading
- 40-59: Somewhat relevant, might be useful
- 20-39: Tangentially related
- 0-19: Noise, not relevant

For each item, provide:
- score: relevance score
- summary: 1-2 sentence explanation of why this matters (or doesn't)
- tags: up to 5 category tags`,
        prompt,
        schema: batchSignalSchema,
      })

      // Store signals above threshold
      for (const sig of object.signals) {
        if (sig.index < 0 || sig.index >= batch.length) continue
        if (sig.score < minScore) continue

        await db.insert(signals).values({
          userId,
          itemId: batch[sig.index].id,
          score: sig.score,
          summary: sig.summary,
          tags: sig.tags,
        })
      }
    } catch (err) {
      console.error(`[llm] Error processing batch:`, err)
    }
  }
}
