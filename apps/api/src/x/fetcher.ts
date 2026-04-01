/**
 * Periodic tweet fetcher — polls HomeLatestTimeline for all users with sessions
 */

import { aiSettings, getDb, tweets, xSessions } from '@omens/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import env from '../env'
import { decrypt } from '../helpers/crypto'
import { scoreUnscoredTweets } from '../routes/ai'
import { getHomeTimeline } from './graphql'
import { fetchOg } from './og'

// Per-user state tracking
const activeFetches = new Set<string>()

let intervalHandle: ReturnType<typeof setInterval> | null = null

/** After inserting tweets, prefetch OG metadata for tweets with URLs but no card/media */
async function prefetchOgForTweets(
  userId: string,
  tweetRows: Array<{ tweetId: string; content: string; card: string | null; mediaUrls: string | null }>,
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
            .where(
              and(eq(tweets.userId, userId), eq(tweets.tweetId, t.tweetId)),
            )
          break // Only use the first URL that returns OG data
        }
      } catch (err) {
        console.error(`[fetcher] OG prefetch error for ${url}:`, err instanceof Error ? err.message : err)
      }
    }
  }
}

async function fetchForUser(userId: string): Promise<{ count: number; error?: string }> {
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, userId))
    .limit(1)

  if (!session) return { count: 0 }

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)

    const { tweets: parsedTweets } = await getHomeTimeline({ authToken, ct0 })

    if (parsedTweets.length === 0) return { count: 0 }

    // Find which tweetIds already exist for this user so we can count only genuinely new inserts
    const incomingTweetIds = parsedTweets.map((t) => t.tweetId)
    const existingRows = await db
      .select({ tweetId: tweets.tweetId })
      .from(tweets)
      .where(
        and(
          eq(tweets.userId, userId),
          inArray(tweets.tweetId, incomingTweetIds),
        ),
      )
    const existingSet = new Set(existingRows.map((r) => r.tweetId))

    // Fix 3: Run all upserts concurrently instead of sequentially
    const results = await Promise.all(parsedTweets.map(async (tweet) => {
      try {
        await db
          .insert(tweets)
          .values({
            userId,
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
            url: tweet.url,
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
            views: tweet.views,
            publishedAt: tweet.publishedAt,
          })
          .onConflictDoUpdate({
            target: [tweets.userId, tweets.tweetId],
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
              likes: tweet.likes,
              retweets: tweet.retweets,
              replies: tweet.replies,
              views: tweet.views,
            },
          })
        return !existingSet.has(tweet.tweetId)
      } catch (err) {
        console.error(`[fetcher] Error upserting tweet:`, err)
        return false
      }
    }))

    const newCount = results.filter(Boolean).length

    // Fix 11: Persist lastFetchedAt in DB
    await db
      .update(xSessions)
      .set({ lastFetchedAt: new Date() })
      .where(eq(xSessions.userId, userId))

    if (newCount > 0) {
      console.log(`[fetcher] Inserted ${newCount} new tweets for user ${userId} (${parsedTweets.length - newCount} updated)`)
      // Score new tweets in background
      void scoreUnscoredTweets(userId).catch((err) =>
        console.error(`[fetcher] Scoring error for user ${userId}:`, err instanceof Error ? err.message : err),
      )
    }

    // Fix 4: Prefetch OG metadata in background for tweets without card/media
    const tweetsForOg = parsedTweets
      .filter((t) => !existingSet.has(t.tweetId))
      .map((t) => ({
        tweetId: t.tweetId,
        content: t.content,
        card: t.card ? JSON.stringify(t.card) : null,
        mediaUrls: t.media ? JSON.stringify(t.media) : null,
      }))
    if (tweetsForOg.length > 0) {
      void prefetchOgForTweets(userId, tweetsForOg).catch((err) =>
        console.error(`[fetcher] OG prefetch batch error:`, err instanceof Error ? err.message : err),
      )
    }

    return { count: newCount }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[fetcher] Error fetching for user ${userId}:`, err)
    const isSessionError = /401|403|session|unauthorized/i.test(errMsg)
    return { count: 0, error: isSessionError ? `X session error: ${errMsg}` : undefined }
  }
}

async function pollAll() {
  const db = getDb(env.DATABASE_URL)

  // Fix 2: Single JOIN query instead of N+1
  const sessionsWithSettings = await db
    .select({
      userId: xSessions.userId,
      fetchIntervalMinutes: aiSettings.fetchIntervalMinutes,
      lastFetchedAt: xSessions.lastFetchedAt,
    })
    .from(xSessions)
    .leftJoin(aiSettings, eq(aiSettings.userId, xSessions.userId))

  const tasks: Promise<void>[] = []

  for (const row of sessionsWithSettings) {
    const userId = row.userId
    // Skip if already fetching for this user
    if (activeFetches.has(userId)) continue

    // Check user's fetch interval
    const interval = row.fetchIntervalMinutes ?? 15
    if (interval === 0) continue // manual only

    // Fix 11: Use DB-persisted lastFetchedAt instead of in-memory Map
    const lastFetch = row.lastFetchedAt?.getTime() || 0
    const elapsed = (Date.now() - lastFetch) / 60_000
    if (elapsed < interval) continue

    // Run fetch in parallel
    activeFetches.add(userId)
    tasks.push(
      fetchForUser(userId)
        .then(() => {})
        .catch((err) => console.error(`[fetcher] Error for user ${userId}:`, err))
        .finally(() => activeFetches.delete(userId)),
    )
  }

  if (tasks.length > 0) await Promise.all(tasks)
}

// Auto-report scheduling
const activeReports = new Set<string>()

async function checkAutoReports() {
  const db = getDb(env.DATABASE_URL)
  const allSettings = await db.select({
    userId: aiSettings.userId,
    reportIntervalHours: aiSettings.reportIntervalHours,
    reportAtHour: aiSettings.reportAtHour,
    lastAutoReportAt: aiSettings.lastAutoReportAt,
  }).from(aiSettings)

  const { generateReportForUser } = await import('../routes/ai')

  const tasks: Promise<void>[] = []
  const currentUtcHour = new Date().getUTCHours()

  for (const s of allSettings) {
    if (s.reportIntervalHours === 0) continue // manual only
    if (activeReports.has(s.userId)) continue

    const lastReport = s.lastAutoReportAt?.getTime() || 0
    const elapsed = (Date.now() - lastReport) / 3_600_000
    if (elapsed < s.reportIntervalHours) continue

    // Fix 10: Handle midnight wraparound correctly
    const hourDiff = (currentUtcHour - s.reportAtHour + 24) % 24
    if (s.reportIntervalHours >= 24 && hourDiff > 0) continue

    activeReports.add(s.userId)
    tasks.push(
      generateReportForUser(s.userId)
        .catch((err: any) => console.error(`[auto-report] Error for ${s.userId}:`, err))
        .finally(() => activeReports.delete(s.userId)),
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
