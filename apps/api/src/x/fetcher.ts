/**
 * Periodic tweet fetcher — polls HomeLatestTimeline for all users with sessions
 */

import { getDb, tweets, xSessions } from '@omens/db'
import { eq } from 'drizzle-orm'
import env from '../env'
import { decrypt } from '../helpers/crypto'
import { getHomeTimeline } from './graphql'

let intervalHandle: ReturnType<typeof setInterval> | null = null

async function fetchForUser(userId: string): Promise<number> {
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, userId))
    .limit(1)

  if (!session) return 0

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)

    const { tweets: parsedTweets } = await getHomeTimeline({ authToken, ct0 })

    let upserted = 0
    for (const tweet of parsedTweets) {
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
              likes: tweet.likes,
              retweets: tweet.retweets,
              replies: tweet.replies,
              views: tweet.views,
            },
          })
        upserted++
      } catch (err) {
        console.error(`[fetcher] Error upserting tweet:`, err)
      }
    }

    if (upserted > 0) {
      console.log(`[fetcher] Upserted ${upserted} tweets for user ${userId}`)
    }
    return upserted
  } catch (err) {
    console.error(`[fetcher] Error fetching for user ${userId}:`, err)
    return 0
  }
}

async function pollAll() {
  const db = getDb(env.DATABASE_URL)
  const sessions = await db.select({ userId: xSessions.userId }).from(xSessions)

  for (const { userId } of sessions) {
    await fetchForUser(userId)
  }
}

export function initFetcher() {
  const intervalMs = env.POLL_INTERVAL_MINUTES * 60 * 1000
  console.log(`[fetcher] Starting poll every ${env.POLL_INTERVAL_MINUTES}m`)

  setTimeout(() => {
    void pollAll()
  }, 5000)

  intervalHandle = setInterval(() => {
    void pollAll()
  }, intervalMs)
}

export function stopFetcher() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

export { fetchForUser }
