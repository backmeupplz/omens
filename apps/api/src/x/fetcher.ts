/**
 * Periodic source fetcher.
 * X still owns the legacy file path, but this loop now syncs every configured source input.
 */

import {
  aiScoringFeeds,
  aiSettings,
  contentItems,
  getDb,
  inputItems,
  inputs,
  redditAccounts,
  redditInputs,
  redditPosts,
  tweets,
  userTweets,
  xAccounts,
  xInputs,
  xPosts,
  xSessions,
} from '@omens/db'
import { and, eq, inArray } from 'drizzle-orm'
import env from '../env'
import { decrypt, encrypt } from '../helpers/crypto'
import { ensureLegacyXInputForUser, ensureXAccountInput } from '../helpers/inputs'
import { scoreUnscoredTweetsForAllFeeds } from '../routes/ai'
import { getRedditBest, refreshRedditAccessToken, type RedditPostRecord } from '../reddit/api'
import { getHomeTimeline } from './graphql'
import { fetchOg } from './og'

// Per-user state tracking
const activeFetches = new Set<string>()

let intervalHandle: ReturnType<typeof setInterval> | null = null

/** After inserting tweets, prefetch OG metadata for tweets with URLs but no card/media */
async function prefetchOgForTweets(
  tweetRows: Array<{ id: string; content: string; card: string | null; mediaUrls: string | null }>,
) {
  const db = getDb(env.DATABASE_URL)
  for (const t of tweetRows) {
    if (t.card || t.mediaUrls) continue
    const urls = t.content.match(/https?:\/\/\S+/g)
    if (!urls || urls.length === 0) continue
    for (const url of urls) {
      try {
        const og = await fetchOg(url)
        if (og) {
          await db
            .update(tweets)
            .set({ card: JSON.stringify(og) })
            .where(eq(tweets.id, t.id))
          break // Only use the first URL that returns OG data
        }
      } catch (err) {
        console.error(`[fetcher] OG prefetch error for ${url}:`, err instanceof Error ? err.message : err)
      }
    }
  }
}

type ParsedTweet = Awaited<ReturnType<typeof getHomeTimeline>>['tweets'][number]

async function upsertUniversalXData(userId: string, inputId: string, parsedTweets: ParsedTweet[]) {
  await ensureLegacyXInputForUser(userId)
  const db = getDb(env.DATABASE_URL)

  for (const tweet of parsedTweets) {
    const [contentItem] = await db
      .insert(contentItems)
      .values({
        provider: 'x',
        entityType: 'x_post',
        externalId: tweet.tweetId,
        url: tweet.url,
        authorName: tweet.authorName,
        authorHandle: tweet.authorHandle,
        textPreview: tweet.content.slice(0, 280),
        mediaCount: tweet.media?.length || 0,
        publishedAt: tweet.publishedAt,
      })
      .onConflictDoUpdate({
        target: [contentItems.provider, contentItems.entityType, contentItems.externalId],
        set: {
          url: tweet.url,
          authorName: tweet.authorName,
          authorHandle: tweet.authorHandle,
          textPreview: tweet.content.slice(0, 280),
          mediaCount: tweet.media?.length || 0,
          publishedAt: tweet.publishedAt,
          fetchedAt: new Date(),
        },
      })
      .returning({ id: contentItems.id })

    await db
      .insert(xPosts)
      .values({
        contentItemId: contentItem.id,
        xPostId: tweet.tweetId,
        authorId: tweet.authorId,
        authorName: tweet.authorName,
        authorHandle: tweet.authorHandle,
        authorAvatar: tweet.authorAvatar,
        authorFollowers: tweet.authorFollowers,
        authorBio: tweet.authorBio,
        content: tweet.content,
        mediaUrls: tweet.media ? JSON.stringify(tweet.media) : null,
        isRetweet: tweet.isRetweet,
        quotedTweet: tweet.quotedTweet ? JSON.stringify(tweet.quotedTweet) : null,
        card: tweet.card ? JSON.stringify(tweet.card) : null,
        replyToHandle: tweet.replyToHandle,
        replyToXPostId: tweet.replyToTweetId,
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: tweet.replies,
        views: tweet.views,
      })
      .onConflictDoUpdate({
        target: xPosts.contentItemId,
        set: {
          xPostId: tweet.tweetId,
          authorId: tweet.authorId,
          authorName: tweet.authorName,
          authorHandle: tweet.authorHandle,
          authorAvatar: tweet.authorAvatar,
          authorFollowers: tweet.authorFollowers,
          authorBio: tweet.authorBio,
          content: tweet.content,
          mediaUrls: tweet.media ? JSON.stringify(tweet.media) : null,
          isRetweet: tweet.isRetweet,
          quotedTweet: tweet.quotedTweet ? JSON.stringify(tweet.quotedTweet) : null,
          card: tweet.card ? JSON.stringify(tweet.card) : null,
          replyToHandle: tweet.replyToHandle,
          replyToXPostId: tweet.replyToTweetId,
          likes: tweet.likes,
          retweets: tweet.retweets,
          replies: tweet.replies,
          views: tweet.views,
          fetchedAt: new Date(),
        },
      })

    await db
      .insert(inputItems)
      .values({
        inputId,
        contentItemId: contentItem.id,
      })
      .onConflictDoNothing()
  }
}

async function upsertUniversalRedditData(inputId: string, posts: RedditPostRecord[]) {
  const db = getDb(env.DATABASE_URL)

  for (const post of posts) {
    const [contentItem] = await db
      .insert(contentItems)
      .values({
        provider: 'reddit',
        entityType: 'reddit_post',
        externalId: post.redditPostId,
        url: post.url,
        authorName: post.authorName,
        authorHandle: post.authorName,
        textPreview: (post.body || post.title).slice(0, 280),
        mediaCount: post.media ? 1 : (post.previewUrl || post.thumbnailUrl ? 1 : 0),
        publishedAt: post.publishedAt,
      })
      .onConflictDoUpdate({
        target: [contentItems.provider, contentItems.entityType, contentItems.externalId],
        set: {
          url: post.url,
          authorName: post.authorName,
          authorHandle: post.authorName,
          textPreview: (post.body || post.title).slice(0, 280),
          mediaCount: post.media ? 1 : (post.previewUrl || post.thumbnailUrl ? 1 : 0),
          publishedAt: post.publishedAt,
          fetchedAt: new Date(),
        },
      })
      .returning({ id: contentItems.id })

    await db
      .insert(redditPosts)
      .values({
        contentItemId: contentItem.id,
        redditPostId: post.redditPostId,
        fullname: post.fullname,
        subreddit: post.subreddit,
        authorName: post.authorName,
        title: post.title,
        body: post.body,
        thumbnailUrl: post.thumbnailUrl,
        previewUrl: post.previewUrl,
        media: post.media,
        domain: post.domain,
        permalink: post.permalink,
        score: post.score,
        commentCount: post.commentCount,
        over18: post.over18,
        spoiler: post.spoiler,
        isSelf: post.isSelf,
        linkFlairText: post.linkFlairText,
        postHint: post.postHint,
      })
      .onConflictDoUpdate({
        target: redditPosts.contentItemId,
        set: {
          redditPostId: post.redditPostId,
          fullname: post.fullname,
          subreddit: post.subreddit,
          authorName: post.authorName,
          title: post.title,
          body: post.body,
          thumbnailUrl: post.thumbnailUrl,
          previewUrl: post.previewUrl,
          media: post.media,
          domain: post.domain,
          permalink: post.permalink,
          score: post.score,
          commentCount: post.commentCount,
          over18: post.over18,
          spoiler: post.spoiler,
          isSelf: post.isSelf,
          linkFlairText: post.linkFlairText,
          postHint: post.postHint,
          fetchedAt: new Date(),
        },
      })

    await db
      .insert(inputItems)
      .values({
        inputId,
        contentItemId: contentItem.id,
      })
      .onConflictDoNothing()
  }
}

async function listUniversalXInputs() {
  const db = getDb(env.DATABASE_URL)
  return db
    .select({
      inputId: inputs.id,
      userId: inputs.userId,
      pollIntervalMinutes: inputs.pollIntervalMinutes,
      lastFetchedAt: inputs.lastFetchedAt,
      sourceAccountId: inputs.sourceAccountId,
      username: xAccounts.username,
      authToken: xAccounts.authToken,
      ct0: xAccounts.ct0,
    })
    .from(inputs)
    .innerJoin(xInputs, eq(xInputs.inputId, inputs.id))
    .innerJoin(xAccounts, eq(xAccounts.sourceAccountId, inputs.sourceAccountId!))
    .where(and(eq(inputs.provider, 'x'), eq(inputs.enabled, true)))
}

async function listUniversalRedditInputs() {
  const db = getDb(env.DATABASE_URL)
  return db
    .select({
      inputId: inputs.id,
      userId: inputs.userId,
      pollIntervalMinutes: inputs.pollIntervalMinutes,
      lastFetchedAt: inputs.lastFetchedAt,
      sourceAccountId: inputs.sourceAccountId,
      username: redditAccounts.username,
      refreshToken: redditAccounts.refreshToken,
      accessToken: redditAccounts.accessToken,
      accessTokenExpiresAt: redditAccounts.accessTokenExpiresAt,
    })
    .from(inputs)
    .innerJoin(redditInputs, eq(redditInputs.inputId, inputs.id))
    .innerJoin(redditAccounts, eq(redditAccounts.sourceAccountId, inputs.sourceAccountId!))
    .where(and(eq(inputs.provider, 'reddit'), eq(inputs.enabled, true)))
}

async function getValidRedditAccessToken(row: {
  sourceAccountId: string | null
  refreshToken: string
  accessToken: string | null
  accessTokenExpiresAt: Date | null
}) {
  const db = getDb(env.DATABASE_URL)
  const expiresSoon = !row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() - Date.now() < 60_000

  if (row.accessToken && !expiresSoon) {
    return decrypt(row.accessToken)
  }

  const refreshToken = await decrypt(row.refreshToken)
  const refreshed = await refreshRedditAccessToken(refreshToken)
  const encryptedAccessToken = await encrypt(refreshed.access_token)

  if (row.sourceAccountId) {
    await db
      .update(redditAccounts)
      .set({
        accessToken: encryptedAccessToken,
        accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        scope: refreshed.scope || null,
        updatedAt: new Date(),
      })
      .where(eq(redditAccounts.sourceAccountId, row.sourceAccountId))
  }

  return refreshed.access_token
}

async function fetchLegacyTweetsForUser(userId: string, authToken: string, ct0: string): Promise<{ count: number; parsedTweets: ParsedTweet[]; tweetRows: Array<{ id: string; tweetId: string; content: string; card: string | null; mediaUrls: string | null }> }> {
  const db = getDb(env.DATABASE_URL)
  const { tweets: parsedTweets } = await getHomeTimeline({ authToken, ct0 })

  if (parsedTweets.length === 0) return { count: 0, parsedTweets, tweetRows: [] }

  const incomingTweetIds = parsedTweets.map((t) => t.tweetId)
  const existingLinks = await db
    .select({ tweetId: tweets.tweetId })
    .from(userTweets)
    .innerJoin(tweets, eq(tweets.id, userTweets.tweetId))
    .where(and(eq(userTweets.userId, userId), inArray(tweets.tweetId, incomingTweetIds)))

  const existingSet = new Set(existingLinks.map((row) => row.tweetId))

  await Promise.all(parsedTweets.map(async (tweet) => {
    try {
      await db
        .insert(tweets)
        .values({
          tweetId: tweet.tweetId,
          authorId: tweet.authorId,
          authorName: tweet.authorName,
          authorHandle: tweet.authorHandle,
          authorAvatar: tweet.authorAvatar,
          authorFollowers: tweet.authorFollowers,
          authorBio: tweet.authorBio,
          content: tweet.content,
          mediaUrls: tweet.media ? JSON.stringify(tweet.media) : null,
          isRetweet: tweet.isRetweet,
          quotedTweet: tweet.quotedTweet ? JSON.stringify(tweet.quotedTweet) : null,
          card: tweet.card ? JSON.stringify(tweet.card) : null,
          replyToHandle: tweet.replyToHandle,
          replyToTweetId: tweet.replyToTweetId,
          url: tweet.url,
          likes: tweet.likes,
          retweets: tweet.retweets,
          replies: tweet.replies,
          views: tweet.views,
          publishedAt: tweet.publishedAt,
        })
        .onConflictDoUpdate({
          target: tweets.tweetId,
          set: {
            authorName: tweet.authorName,
            authorHandle: tweet.authorHandle,
            authorAvatar: tweet.authorAvatar,
            authorFollowers: tweet.authorFollowers,
            authorBio: tweet.authorBio,
            content: tweet.content,
            mediaUrls: tweet.media ? JSON.stringify(tweet.media) : null,
            quotedTweet: tweet.quotedTweet ? JSON.stringify(tweet.quotedTweet) : null,
            card: tweet.card ? JSON.stringify(tweet.card) : null,
            replyToHandle: tweet.replyToHandle,
            replyToTweetId: tweet.replyToTweetId,
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
            views: tweet.views,
          },
        })
    } catch (err) {
      console.error('[fetcher] Error upserting legacy tweet:', err)
    }
  }))

  const tweetRows = await db
    .select({ id: tweets.id, tweetId: tweets.tweetId, content: tweets.content, card: tweets.card, mediaUrls: tweets.mediaUrls })
    .from(tweets)
    .where(inArray(tweets.tweetId, incomingTweetIds))

  await Promise.all(
    tweetRows.map((tweet) =>
      db.insert(userTweets).values({ userId, tweetId: tweet.id }).onConflictDoNothing(),
    ),
  )

  return {
    count: tweetRows.filter((tweet) => !existingSet.has(tweet.tweetId)).length,
    parsedTweets,
    tweetRows,
  }
}

async function fetchXInput(row: {
  inputId: string
  userId: string
  authToken: string
  ct0: string
}) {
  const db = getDb(env.DATABASE_URL)
  const authToken = await decrypt(row.authToken)
  const ct0 = await decrypt(row.ct0)
  const result = await fetchLegacyTweetsForUser(row.userId, authToken, ct0)

  await upsertUniversalXData(row.userId, row.inputId, result.parsedTweets)

  await db
    .update(inputs)
    .set({
      lastFetchedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(inputs.id, row.inputId))

  await db
    .update(xSessions)
    .set({ lastFetchedAt: new Date() })
    .where(eq(xSessions.userId, row.userId))

  if (result.count > 0) {
    console.log(`[fetcher] Inserted ${result.count} new tweets for user ${row.userId}`)
    void scoreUnscoredTweetsForAllFeeds(row.userId).catch((err) =>
      console.error(`[fetcher] Scoring error for user ${row.userId}:`, err instanceof Error ? err.message : err),
    )
  }

  const tweetsForOg = result.tweetRows.filter((tweet) => tweet.card == null && tweet.mediaUrls == null)
  if (tweetsForOg.length > 0) {
    void prefetchOgForTweets(tweetsForOg).catch((err) =>
      console.error(`[fetcher] OG prefetch batch error:`, err instanceof Error ? err.message : err),
    )
  }

  return result.count
}

async function fetchRedditInput(row: {
  inputId: string
  userId: string
  sourceAccountId: string | null
  refreshToken: string
  accessToken: string | null
  accessTokenExpiresAt: Date | null
}) {
  const db = getDb(env.DATABASE_URL)
  const accessToken = await getValidRedditAccessToken(row)
  const posts = await getRedditBest(accessToken)

  const incomingIds = posts.map((post) => post.redditPostId)
  const existingItems = incomingIds.length > 0
    ? await db
      .select({ externalId: contentItems.externalId })
      .from(contentItems)
      .where(and(
        eq(contentItems.provider, 'reddit'),
        eq(contentItems.entityType, 'reddit_post'),
        inArray(contentItems.externalId, incomingIds),
      ))
    : []
  const existingSet = new Set(existingItems.map((item) => item.externalId))

  await upsertUniversalRedditData(row.inputId, posts)

  await db
    .update(inputs)
    .set({
      lastFetchedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(inputs.id, row.inputId))

  const newCount = posts.filter((post) => !existingSet.has(post.redditPostId)).length
  if (newCount > 0) {
    console.log(`[fetcher] Inserted ${newCount} new reddit posts for user ${row.userId}`)
    void scoreUnscoredTweetsForAllFeeds(row.userId).catch((err) =>
      console.error(`[fetcher] Scoring error for user ${row.userId}:`, err instanceof Error ? err.message : err),
    )
  }

  return newCount
}

async function fetchForUser(userId: string): Promise<{ count: number; inputs: number; error?: string }> {
  try {
    await ensureLegacyXInputForUser(userId)
    const xInputsForUser = (await listUniversalXInputs()).filter((row) => row.userId === userId)
    const redditInputsForUser = (await listUniversalRedditInputs()).filter((row) => row.userId === userId)
    const universalInputs = [...xInputsForUser, ...redditInputsForUser]

    if (universalInputs.length === 0) return { count: 0, inputs: 0 }

    let totalCount = 0
    for (const input of universalInputs) {
      totalCount += 'ct0' in input ? await fetchXInput(input) : await fetchRedditInput(input)
    }

    return { count: totalCount, inputs: universalInputs.length }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[fetcher] Error fetching for user ${userId}:`, err)
    const isSessionError = /401|403|session|unauthorized|token/i.test(errMsg)
    return { count: 0, inputs: 0, error: isSessionError ? errMsg : undefined }
  }
}

async function pollAll() {
  const db = getDb(env.DATABASE_URL)
  const legacySessions = await db.select().from(xSessions)
  await Promise.all(
    legacySessions.map((session) =>
      ensureXAccountInput({
        userId: session.userId,
        xId: session.xId,
        username: session.username,
        authToken: session.authToken,
        ct0: session.ct0,
      }).catch((err) => console.error(`[fetcher] Legacy bootstrap failed for ${session.userId}:`, err)),
    ),
  )

  const syncRows = [
    ...await listUniversalXInputs(),
    ...await listUniversalRedditInputs(),
  ]

  const tasks: Promise<void>[] = []

  for (const row of syncRows) {
    const userId = row.userId
    // Skip if already fetching for this user
    const key = `${userId}:${row.inputId}`
    if (activeFetches.has(key)) continue

    const interval = row.pollIntervalMinutes ?? 15
    if (interval === 0) continue // manual only

    const lastFetch = row.lastFetchedAt?.getTime() || 0
    const elapsed = (Date.now() - lastFetch) / 60_000
    if (elapsed < interval) continue

    activeFetches.add(key)
    tasks.push(
      ('ct0' in row ? fetchXInput(row) : fetchRedditInput(row))
        .then(() => {})
        .catch((err) => console.error(`[fetcher] Error for input ${row.inputId}:`, err))
        .finally(() => activeFetches.delete(key)),
    )
  }

  if (tasks.length > 0) await Promise.all(tasks)
}

// Auto-report scheduling
const activeReports = new Set<string>()

async function checkAutoReports() {
  const db = getDb(env.DATABASE_URL)
  const allSettings = await db.select({
    userId: aiScoringFeeds.userId,
    feedId: aiScoringFeeds.id,
    reportIntervalHours: aiScoringFeeds.reportIntervalHours,
    reportAtHour: aiScoringFeeds.reportAtHour,
    lastAutoReportAt: aiScoringFeeds.lastAutoReportAt,
  })
    .from(aiScoringFeeds)
    .innerJoin(aiSettings, eq(aiSettings.userId, aiScoringFeeds.userId))

  const { generateReportForUser } = await import('../routes/ai')

  const tasks: Promise<void>[] = []
  const currentUtcHour = new Date().getUTCHours()

  for (const s of allSettings) {
    if (s.reportIntervalHours === 0) continue // manual only
    const key = `${s.userId}:${s.feedId}`
    if (activeReports.has(key)) continue

    const lastReport = s.lastAutoReportAt?.getTime() || 0
    const elapsed = (Date.now() - lastReport) / 3_600_000
    if (elapsed < s.reportIntervalHours) continue

    // Fix 10: Handle midnight wraparound correctly
    const hourDiff = (currentUtcHour - s.reportAtHour + 24) % 24
    if (s.reportIntervalHours >= 24 && hourDiff > 0) continue

    activeReports.add(key)
    tasks.push(
      generateReportForUser(s.userId, s.feedId, true)
        .catch((err: any) => console.error(`[auto-report] Error for ${s.userId}, feed ${s.feedId}:`, err))
        .finally(() => activeReports.delete(key)),
    )
  }

  if (tasks.length > 0) await Promise.all(tasks)
}

export function initFetcher() {
  console.log('[fetcher] Starting poll loop (every 15s, per-user intervals)')

  setTimeout(() => void pollAll(), 5000)
  intervalHandle = setInterval(() => void pollAll(), 15_000)

  // Check auto-reports every 5 minutes
  setTimeout(() => void checkAutoReports(), 60_000)
  setInterval(() => void checkAutoReports(), 5 * 60_000)
}

export function stopFetcher() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

export { fetchForUser }
