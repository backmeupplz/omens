import {
  aiScoringFeedInputs,
  aiScoringFeeds,
  aiSettings,
  getDb,
  inputs,
  rssInputs,
  sourceAccounts,
  telegramInputs,
  xAccounts,
  xInputs,
  xSessions,
} from '@omens/db'
import { and, eq, isNull } from 'drizzle-orm'
import env from '../env'
import { normalizeFeedUrl } from '../rss/generic'
import {
  buildRedditSubredditFeedConfig,
  type RedditRssListingType,
  type RedditRssTimeRange,
} from '../rss/reddit'
import { normalizeTelegramChannelUsername } from '../telegram/public'

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

export async function ensureRedditSubredditRssInput(params: {
  userId: string
  subreddit: string
  listingType: RedditRssListingType
  timeRange?: RedditRssTimeRange | null
}) {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select({ fetchIntervalMinutes: aiSettings.fetchIntervalMinutes })
    .from(aiSettings)
    .where(eq(aiSettings.userId, params.userId))
    .limit(1)

  const config = buildRedditSubredditFeedConfig(params)

  const [existing] = await db
    .select({
      inputId: inputs.id,
    })
    .from(inputs)
    .innerJoin(rssInputs, eq(rssInputs.inputId, inputs.id))
    .where(and(
      eq(inputs.userId, params.userId),
      eq(inputs.provider, 'rss'),
      eq(inputs.kind, 'reddit_subreddit'),
      eq(rssInputs.sourceProvider, 'reddit'),
      eq(rssInputs.sourceKey, config.subreddit.toLowerCase()),
      eq(rssInputs.listingType, config.listingType),
      config.timeRange
        ? eq(rssInputs.timeRange, config.timeRange)
        : isNull(rssInputs.timeRange),
    ))
    .limit(1)

  let inputId = existing?.inputId || null

  if (!inputId) {
    const [createdInput] = await db
      .insert(inputs)
      .values({
        userId: params.userId,
        provider: 'rss',
        kind: 'reddit_subreddit',
        name: config.inputName,
        pollIntervalMinutes: settings?.fetchIntervalMinutes ?? 15,
      })
      .returning({ id: inputs.id })

    inputId = createdInput.id
    await db.insert(rssInputs).values({
      inputId,
      feedUrl: config.feedUrl,
      siteUrl: config.siteUrl,
      title: config.inputName,
      sourceProvider: 'reddit',
      sourceKey: config.subreddit.toLowerCase(),
      sourceLabel: config.sourceLabel,
      listingType: config.listingType,
      timeRange: config.timeRange,
    })
  } else {
    await db
      .update(inputs)
      .set({
        name: config.inputName,
        updatedAt: new Date(),
      })
      .where(eq(inputs.id, inputId))

    await db
      .update(rssInputs)
      .set({
        feedUrl: config.feedUrl,
        siteUrl: config.siteUrl,
        title: config.inputName,
        sourceProvider: 'reddit',
        sourceKey: config.subreddit.toLowerCase(),
        sourceLabel: config.sourceLabel,
        listingType: config.listingType,
        timeRange: config.timeRange,
      })
      .where(eq(rssInputs.inputId, inputId))
  }

  await syncInputToFeeds(params.userId, inputId)

  return { inputId }
}

export async function ensureGenericRssInput(params: {
  userId: string
  feedUrl: string
  title?: string | null
  siteUrl?: string | null
  description?: string | null
}) {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select({ fetchIntervalMinutes: aiSettings.fetchIntervalMinutes })
    .from(aiSettings)
    .where(eq(aiSettings.userId, params.userId))
    .limit(1)

  const feedUrl = normalizeFeedUrl(params.feedUrl)
  const title = params.title?.trim() || null
  const siteUrl = params.siteUrl?.trim() || null
  const description = params.description?.trim() || null

  const [existing] = await db
    .select({
      inputId: inputs.id,
    })
    .from(inputs)
    .innerJoin(rssInputs, eq(rssInputs.inputId, inputs.id))
    .where(and(
      eq(inputs.userId, params.userId),
      eq(inputs.provider, 'rss'),
      eq(inputs.kind, 'generic_feed'),
      eq(rssInputs.sourceProvider, 'generic'),
      eq(rssInputs.feedUrl, feedUrl),
    ))
    .limit(1)

  let inputId = existing?.inputId || null
  const inputName = title || siteUrl || feedUrl

  if (!inputId) {
    const [createdInput] = await db
      .insert(inputs)
      .values({
        userId: params.userId,
        provider: 'rss',
        kind: 'generic_feed',
        name: inputName,
        pollIntervalMinutes: settings?.fetchIntervalMinutes ?? 15,
      })
      .returning({ id: inputs.id })

    inputId = createdInput.id
    await db.insert(rssInputs).values({
      inputId,
      feedUrl,
      siteUrl,
      title,
      description,
      sourceProvider: 'generic',
      sourceKey: feedUrl,
      sourceLabel: title || siteUrl || feedUrl,
    })
  } else {
    await db
      .update(inputs)
      .set({
        name: inputName,
        updatedAt: new Date(),
      })
      .where(eq(inputs.id, inputId))

    await db
      .update(rssInputs)
      .set({
        feedUrl,
        siteUrl,
        title,
        description,
        sourceProvider: 'generic',
        sourceKey: feedUrl,
        sourceLabel: title || siteUrl || feedUrl,
      })
      .where(eq(rssInputs.inputId, inputId))
  }

  await syncInputToFeeds(params.userId, inputId)

  return { inputId, feedUrl }
}

export async function ensureTelegramPublicChannelInput(params: {
  userId: string
  channel: string
  channelTitle?: string | null
}) {
  const db = getDb(env.DATABASE_URL)
  const [settings] = await db
    .select({ fetchIntervalMinutes: aiSettings.fetchIntervalMinutes })
    .from(aiSettings)
    .where(eq(aiSettings.userId, params.userId))
    .limit(1)

  const channelUsername = normalizeTelegramChannelUsername(params.channel)
  const channelTitle = params.channelTitle?.trim() || null
  const siteUrl = `https://t.me/${channelUsername}`

  const [existing] = await db
    .select({
      inputId: inputs.id,
    })
    .from(inputs)
    .innerJoin(telegramInputs, eq(telegramInputs.inputId, inputs.id))
    .where(and(
      eq(inputs.userId, params.userId),
      eq(inputs.provider, 'telegram'),
      eq(inputs.kind, 'public_channel'),
      eq(telegramInputs.channelUsername, channelUsername),
    ))
    .limit(1)

  let inputId = existing?.inputId || null

  if (!inputId) {
    const [createdInput] = await db
      .insert(inputs)
      .values({
        userId: params.userId,
        provider: 'telegram',
        kind: 'public_channel',
        name: `@${channelUsername}`,
        pollIntervalMinutes: settings?.fetchIntervalMinutes ?? 15,
      })
      .returning({ id: inputs.id })

    inputId = createdInput.id
    await db.insert(telegramInputs).values({
      inputId,
      channelUsername,
      channelTitle,
      siteUrl,
    })
  } else {
    await db
      .update(inputs)
      .set({
        name: `@${channelUsername}`,
        updatedAt: new Date(),
      })
      .where(eq(inputs.id, inputId))

    await db
      .update(telegramInputs)
      .set({
        channelTitle,
        siteUrl,
      })
      .where(eq(telegramInputs.inputId, inputId))
  }

  await syncInputToFeeds(params.userId, inputId)

  return { inputId, channelUsername }
}
