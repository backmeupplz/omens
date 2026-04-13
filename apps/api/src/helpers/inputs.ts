import {
  aiScoringFeedInputs,
  aiScoringFeeds,
  aiSettings,
  getDb,
  inputs,
  redditAccounts,
  redditInputs,
  sourceAccounts,
  xAccounts,
  xInputs,
  xSessions,
} from '@omens/db'
import { and, eq } from 'drizzle-orm'
import env from '../env'

async function syncInputToFeeds(userId: string, inputId: string) {
  const db = getDb(env.DATABASE_URL)
  const feeds = await db
    .select({ id: aiScoringFeeds.id })
    .from(aiScoringFeeds)
    .where(eq(aiScoringFeeds.userId, userId))

  await Promise.all(
    feeds.map((feed) =>
      db.insert(aiScoringFeedInputs).values({ feedId: feed.id, inputId }).onConflictDoNothing(),
    ),
  )
}

export async function ensureXAccountInput(params: {
  userId: string
  xId: string
  username: string
  authToken: string
  ct0: string
}) {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select({ fetchIntervalMinutes: aiSettings.fetchIntervalMinutes })
    .from(aiSettings)
    .where(eq(aiSettings.userId, params.userId))
    .limit(1)

  const [existing] = await db
    .select({
      sourceAccountId: sourceAccounts.id,
      inputId: inputs.id,
    })
    .from(sourceAccounts)
    .innerJoin(xAccounts, eq(xAccounts.sourceAccountId, sourceAccounts.id))
    .leftJoin(inputs, and(
      eq(inputs.sourceAccountId, sourceAccounts.id),
      eq(inputs.provider, 'x'),
      eq(inputs.kind, 'home_timeline'),
    ))
    .where(and(
      eq(sourceAccounts.userId, params.userId),
      eq(sourceAccounts.provider, 'x'),
      eq(sourceAccounts.externalAccountId, params.xId),
    ))
    .limit(1)

  let sourceAccountId = existing?.sourceAccountId || null
  let inputId = existing?.inputId || null

  if (!sourceAccountId) {
    const [created] = await db
      .insert(sourceAccounts)
      .values({
        userId: params.userId,
        provider: 'x',
        externalAccountId: params.xId,
        label: `@${params.username}`,
      })
      .returning({ id: sourceAccounts.id })
    sourceAccountId = created.id
  } else {
    await db
      .update(sourceAccounts)
      .set({
        label: `@${params.username}`,
        updatedAt: new Date(),
      })
      .where(eq(sourceAccounts.id, sourceAccountId))
  }

  await db
    .insert(xAccounts)
    .values({
      sourceAccountId,
      xId: params.xId,
      username: params.username,
      authToken: params.authToken,
      ct0: params.ct0,
    })
    .onConflictDoUpdate({
      target: xAccounts.sourceAccountId,
      set: {
        xId: params.xId,
        username: params.username,
        authToken: params.authToken,
        ct0: params.ct0,
        updatedAt: new Date(),
      },
    })

  if (!inputId) {
    const [createdInput] = await db
      .insert(inputs)
      .values({
        userId: params.userId,
        sourceAccountId,
        provider: 'x',
        kind: 'home_timeline',
        name: `@${params.username} Home`,
        pollIntervalMinutes: settings?.fetchIntervalMinutes ?? 15,
      })
      .returning({ id: inputs.id })
    inputId = createdInput.id
    await db.insert(xInputs).values({ inputId }).onConflictDoNothing()
  } else {
    await db
      .update(inputs)
      .set({
        name: `@${params.username} Home`,
        updatedAt: new Date(),
      })
      .where(eq(inputs.id, inputId))
  }

  await syncInputToFeeds(params.userId, inputId)

  return { sourceAccountId, inputId }
}

export async function ensureRedditAccountInput(params: {
  userId: string
  redditUserId: string
  username: string
  refreshToken: string
  accessToken?: string | null
  accessTokenExpiresAt?: Date | null
  scope?: string | null
}) {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select({ fetchIntervalMinutes: aiSettings.fetchIntervalMinutes })
    .from(aiSettings)
    .where(eq(aiSettings.userId, params.userId))
    .limit(1)

  const [existing] = await db
    .select({
      sourceAccountId: sourceAccounts.id,
      inputId: inputs.id,
    })
    .from(sourceAccounts)
    .innerJoin(redditAccounts, eq(redditAccounts.sourceAccountId, sourceAccounts.id))
    .leftJoin(inputs, and(
      eq(inputs.sourceAccountId, sourceAccounts.id),
      eq(inputs.provider, 'reddit'),
      eq(inputs.kind, 'home'),
    ))
    .where(and(
      eq(sourceAccounts.userId, params.userId),
      eq(sourceAccounts.provider, 'reddit'),
      eq(sourceAccounts.externalAccountId, params.redditUserId),
    ))
    .limit(1)

  let sourceAccountId = existing?.sourceAccountId || null
  let inputId = existing?.inputId || null

  if (!sourceAccountId) {
    const [created] = await db
      .insert(sourceAccounts)
      .values({
        userId: params.userId,
        provider: 'reddit',
        externalAccountId: params.redditUserId,
        label: `u/${params.username}`,
      })
      .returning({ id: sourceAccounts.id })
    sourceAccountId = created.id
  } else {
    await db
      .update(sourceAccounts)
      .set({
        label: `u/${params.username}`,
        updatedAt: new Date(),
      })
      .where(eq(sourceAccounts.id, sourceAccountId))
  }

  await db
    .insert(redditAccounts)
    .values({
      sourceAccountId,
      redditUserId: params.redditUserId,
      username: params.username,
      refreshToken: params.refreshToken,
      accessToken: params.accessToken || null,
      accessTokenExpiresAt: params.accessTokenExpiresAt || null,
      scope: params.scope || null,
    })
    .onConflictDoUpdate({
      target: redditAccounts.sourceAccountId,
      set: {
        redditUserId: params.redditUserId,
        username: params.username,
        refreshToken: params.refreshToken,
        accessToken: params.accessToken || null,
        accessTokenExpiresAt: params.accessTokenExpiresAt || null,
        scope: params.scope || null,
        updatedAt: new Date(),
      },
    })

  if (!inputId) {
    const [createdInput] = await db
      .insert(inputs)
      .values({
        userId: params.userId,
        sourceAccountId,
        provider: 'reddit',
        kind: 'home',
        name: `u/${params.username} Home`,
        pollIntervalMinutes: settings?.fetchIntervalMinutes ?? 15,
      })
      .returning({ id: inputs.id })
    inputId = createdInput.id
    await db.insert(redditInputs).values({ inputId }).onConflictDoNothing()
  } else {
    await db
      .update(inputs)
      .set({
        name: `u/${params.username} Home`,
        updatedAt: new Date(),
      })
      .where(eq(inputs.id, inputId))
  }

  await syncInputToFeeds(params.userId, inputId)

  return { sourceAccountId, inputId }
}

export async function ensureLegacyXInputForUser(userId: string) {
  const db = getDb(env.DATABASE_URL)
  const [existing] = await db
    .select({ id: inputs.id })
    .from(inputs)
    .where(and(eq(inputs.userId, userId), eq(inputs.provider, 'x')))
    .limit(1)

  if (existing) return existing.id

  const [legacy] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, userId))
    .limit(1)

  if (!legacy) return null

  const created = await ensureXAccountInput({
    userId,
    xId: legacy.xId,
    username: legacy.username,
    authToken: legacy.authToken,
    ct0: legacy.ct0,
  })

  return created.inputId
}
