import cron from 'node-cron'
import { eq } from 'drizzle-orm'
import { getDb, sources, items } from '@omens/db'
import { getAdapter } from '../adapters'
import { processingQueue } from '../llm/queue'
import env from '../env'

const scheduledTasks = new Map<string, cron.ScheduledTask>()

async function pollSource(source: {
  id: string
  userId: string
  type: string
  config: Record<string, unknown>
  lastPolledAt: Date | null
}) {
  const adapter = getAdapter(source.type)
  if (!adapter) {
    console.error(`[scheduler] No adapter for type: ${source.type}`)
    return
  }

  console.log(
    `[scheduler] Polling source ${source.id} (${source.type})`,
  )

  const rawItems = await adapter.fetch(
    source.config,
    source.lastPolledAt || undefined,
  )

  if (rawItems.length === 0) {
    console.log(`[scheduler] No new items from source ${source.id}`)
    return
  }

  const db = getDb(env.DATABASE_URL)
  const newItemIds: string[] = []

  for (const raw of rawItems) {
    try {
      const [inserted] = await db
        .insert(items)
        .values({
          sourceId: source.id,
          externalId: raw.externalId,
          title: raw.title,
          content: raw.content,
          url: raw.url,
          author: raw.author,
          publishedAt: raw.publishedAt,
        })
        .onConflictDoNothing()
        .returning({ id: items.id })

      if (inserted) {
        newItemIds.push(inserted.id)
      }
    } catch {
      // Dedup conflict, skip
    }
  }

  // Update last polled
  await db
    .update(sources)
    .set({ lastPolledAt: new Date() })
    .where(eq(sources.id, source.id))

  if (newItemIds.length > 0) {
    console.log(
      `[scheduler] ${newItemIds.length} new items from source ${source.id}, queuing for LLM`,
    )
    processingQueue.enqueue(source.userId, newItemIds)
  }
}

export function scheduleSource(source: {
  id: string
  userId: string
  type: string
  config: Record<string, unknown>
  pollIntervalMinutes: number
  lastPolledAt: Date | null
}) {
  unscheduleSource(source.id)

  const interval = Math.max(source.pollIntervalMinutes, 5)
  const cronExpr = `*/${interval} * * * *`

  const task = cron.schedule(cronExpr, () => {
    void (async () => {
      try {
        await pollSource(source)
      } catch (err) {
        console.error(
          `[scheduler] Error polling source ${source.id}:`,
          err,
        )
      }
    })()
  })

  scheduledTasks.set(source.id, task)
  console.log(
    `[scheduler] Scheduled source ${source.id} every ${interval}m`,
  )
}

export function unscheduleSource(id: string) {
  const existing = scheduledTasks.get(id)
  if (existing) {
    existing.stop()
    scheduledTasks.delete(id)
  }
}

export async function initScheduler() {
  const db = getDb(env.DATABASE_URL)
  const allSources = await db
    .select()
    .from(sources)
    .where(eq(sources.enabled, true))

  console.log(
    `[scheduler] Initializing ${allSources.length} source(s)`,
  )

  for (const source of allSources) {
    scheduleSource(source)

    // Poll immediately on first start if never polled
    if (!source.lastPolledAt) {
      void (async () => {
        try {
          await pollSource(source)
        } catch (err) {
          console.error(
            `[scheduler] Initial poll error for ${source.id}:`,
            err,
          )
        }
      })()
    }
  }
}
