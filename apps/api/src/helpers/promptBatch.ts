/**
 * Background prompt regeneration batcher.
 * Checks every 60 seconds, but only processes changes that are >= 5 minutes old.
 * This ensures the frontend countdown (earliest pending + 5min) matches reality.
 */

import { getDb, aiSettings, nudges, promptChanges } from '@omens/db'
import { and, eq, lte } from 'drizzle-orm'
import env from '../env'
import { regeneratePromptForUser } from '../routes/ai'

let intervalHandle: ReturnType<typeof setInterval> | null = null

async function processAll() {
  const db = getDb(env.DATABASE_URL)

  // Fix 7: Only select nudges/instructions where createdAt <= now() - 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  // Find users with pending nudges that are old enough
  const usersWithNudges = await db
    .selectDistinct({ userId: nudges.userId })
    .from(nudges)
    .where(and(eq(nudges.consumed, false), lte(nudges.createdAt, fiveMinutesAgo)))

  // Find users with pending instructions that are old enough
  const usersWithInstructions = await db
    .selectDistinct({ userId: promptChanges.userId })
    .from(promptChanges)
    .where(and(eq(promptChanges.consumed, false), lte(promptChanges.createdAt, fiveMinutesAgo)))

  // Combine unique user IDs
  const userIds = new Set([
    ...usersWithNudges.map((r) => r.userId),
    ...usersWithInstructions.map((r) => r.userId),
  ])

  if (userIds.size === 0) return

  for (const userId of userIds) {
    // Check user has AI configured
    const [settings] = await db
      .select({ id: aiSettings.id })
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId))
      .limit(1)

    if (!settings) continue

    try {
      await regeneratePromptForUser(userId)
    } catch (err) {
      console.error(`[promptBatch] Error for user ${userId}:`, err instanceof Error ? err.message : err)
    }
  }
}

export function initPromptBatcher() {
  console.log('[promptBatch] Starting prompt batcher (every 60s, processes changes >= 5m old)')

  // First run after 30 seconds
  setTimeout(() => void processAll(), 30_000)

  // Fix 7: Check every 60 seconds instead of every 5 minutes
  intervalHandle = setInterval(() => void processAll(), 60 * 1000)
}

export function stopPromptBatcher() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
