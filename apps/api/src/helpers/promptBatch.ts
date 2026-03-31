/**
 * Background prompt regeneration batcher.
 * Runs every 5 minutes, regenerates prompts for users with pending nudges/instructions.
 */

import { getDb, aiSettings, nudges, promptChanges } from '@omens/db'
import { and, eq } from 'drizzle-orm'
import env from '../env'
import { regeneratePromptForUser } from '../routes/ai'

let intervalHandle: ReturnType<typeof setInterval> | null = null

async function processAll() {
  const db = getDb(env.DATABASE_URL)

  // Find users with pending nudges
  const usersWithNudges = await db
    .selectDistinct({ userId: nudges.userId })
    .from(nudges)
    .where(eq(nudges.consumed, false))

  // Find users with pending instructions
  const usersWithInstructions = await db
    .selectDistinct({ userId: promptChanges.userId })
    .from(promptChanges)
    .where(eq(promptChanges.consumed, false))

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
  console.log('[promptBatch] Starting prompt batcher (every 5m)')

  // First run after 30 seconds
  setTimeout(() => void processAll(), 30_000)

  intervalHandle = setInterval(() => void processAll(), 5 * 60 * 1000)
}

export function stopPromptBatcher() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
