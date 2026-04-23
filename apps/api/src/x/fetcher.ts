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
  redditPosts,
  rssInputs,
  rssPosts,
  telegramInputs,
  telegramPosts,
  tweets,
  userTweets,
  xAccounts,
  xInputs,
  xPosts,
  xSessions,
} from '@omens/db'
import { and, eq, inArray } from 'drizzle-orm'
import env from '../env'
import { decrypt } from '../helpers/crypto'
import { ensureLegacyXInputForUser, ensureXAccountInput } from '../helpers/inputs'
import { fetchRedditPublicGalleryMedia, type RedditPostRecord } from '../reddit/public'
import { scoreUnscoredTweetsForAllFeeds } from '../routes/ai'
import { parseGenericRssFeed, type GenericRssPostRecord } from '../rss/generic'
import { parseRedditRssFeed } from '../rss/reddit'
import {
  fetchTelegramChannelPosts,
  type TelegramPostRecord,
} from '../telegram/public'
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
type UniversalRssInputRow = Awaited<ReturnType<typeof listUniversalRssInputs>>[number]
type UniversalTelegramInputRow = Awaited<ReturnType<typeof listUniversalTelegramInputs>>[number]

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

async function upsertUniversalRedditData(inputIds: string | string[], posts: RedditPostRecord[]) {
  const db = getDb(env.DATABASE_URL)
  const targetInputIds = [...new Set(Array.isArray(inputIds) ? inputIds : [inputIds])]

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

    await Promise.all(
      targetInputIds.map((inputId) =>
        db
          .insert(inputItems)
          .values({
            inputId,
            contentItemId: contentItem.id,
          })
          .onConflictDoNothing(),
      ),
    )
  }
}

async function upsertUniversalTelegramData(targets: Array<{ post: TelegramPostRecord; inputIds: string[] }>) {
  const db = getDb(env.DATABASE_URL)

  for (const target of targets) {
    const inputIds = [...new Set(target.inputIds)]
    if (inputIds.length === 0) continue

    const { post } = target
    const mediaPayload = post.media ? JSON.parse(post.media) as { items?: unknown[]; files?: unknown[] } : null
    const mediaCount = (Array.isArray(mediaPayload?.items) ? mediaPayload.items.length : 0)
      + (Array.isArray(mediaPayload?.files) ? mediaPayload.files.length : 0)

    const [contentItem] = await db
      .insert(contentItems)
      .values({
        provider: 'telegram',
        entityType: 'telegram_post',
        externalId: post.telegramPostId,
        url: post.permalink,
        authorName: post.channelTitle,
        authorHandle: post.channelUsername,
        textPreview: (post.content || post.linkUrl || `@${post.channelUsername}`).slice(0, 280),
        mediaCount,
        publishedAt: post.publishedAt,
      })
      .onConflictDoUpdate({
        target: [contentItems.provider, contentItems.entityType, contentItems.externalId],
        set: {
          url: post.permalink,
          authorName: post.channelTitle,
          authorHandle: post.channelUsername,
          textPreview: (post.content || post.linkUrl || `@${post.channelUsername}`).slice(0, 280),
          mediaCount,
          publishedAt: post.publishedAt,
          fetchedAt: new Date(),
        },
      })
      .returning({ id: contentItems.id })

    await db
      .insert(telegramPosts)
      .values({
        contentItemId: contentItem.id,
        telegramPostId: post.telegramPostId,
        channelUsername: post.channelUsername,
        channelTitle: post.channelTitle,
        messageId: post.messageId,
        content: post.content,
        media: post.media,
        previewUrl: post.previewUrl,
        thumbnailUrl: post.thumbnailUrl,
        domain: post.domain,
        linkUrl: post.linkUrl,
        permalink: post.permalink,
        viewCount: post.viewCount,
        postType: post.postType,
      })
      .onConflictDoUpdate({
        target: telegramPosts.contentItemId,
        set: {
          telegramPostId: post.telegramPostId,
          channelUsername: post.channelUsername,
          channelTitle: post.channelTitle,
          messageId: post.messageId,
          content: post.content,
          media: post.media,
          previewUrl: post.previewUrl,
          thumbnailUrl: post.thumbnailUrl,
          domain: post.domain,
          linkUrl: post.linkUrl,
          permalink: post.permalink,
          viewCount: post.viewCount,
          postType: post.postType,
          fetchedAt: new Date(),
        },
      })

    await Promise.all(
      inputIds.map((inputId) =>
        db
          .insert(inputItems)
          .values({
            inputId,
            contentItemId: contentItem.id,
          })
          .onConflictDoNothing(),
      ),
    )
  }
}

async function upsertUniversalRssData(inputIds: string | string[], posts: GenericRssPostRecord[]) {
  const db = getDb(env.DATABASE_URL)
  const targetInputIds = [...new Set(Array.isArray(inputIds) ? inputIds : [inputIds])]

  for (const post of posts) {
    const mediaPayload = post.media ? JSON.parse(post.media) as { items?: unknown[] } : null
    const mediaCount = Array.isArray(mediaPayload?.items) ? mediaPayload.items.length : 0

    const [contentItem] = await db
      .insert(contentItems)
      .values({
        provider: 'rss',
        entityType: 'rss_post',
        externalId: post.rssPostId,
        url: post.permalink,
        authorName: post.authorName || post.feedTitle,
        authorHandle: post.domain,
        textPreview: (post.body || post.title).slice(0, 280),
        mediaCount,
        publishedAt: post.publishedAt,
      })
      .onConflictDoUpdate({
        target: [contentItems.provider, contentItems.entityType, contentItems.externalId],
        set: {
          url: post.permalink,
          authorName: post.authorName || post.feedTitle,
          authorHandle: post.domain,
          textPreview: (post.body || post.title).slice(0, 280),
          mediaCount,
          publishedAt: post.publishedAt,
          fetchedAt: new Date(),
        },
      })
      .returning({ id: contentItems.id })

    await db
      .insert(rssPosts)
      .values({
        contentItemId: contentItem.id,
        rssPostId: post.rssPostId,
        feedUrl: post.feedUrl,
        feedTitle: post.feedTitle,
        authorName: post.authorName,
        title: post.title,
        body: post.body,
        previewUrl: post.previewUrl,
        thumbnailUrl: post.thumbnailUrl,
        media: post.media,
        domain: post.domain,
        permalink: post.permalink,
        guid: post.guid,
      })
      .onConflictDoUpdate({
        target: rssPosts.contentItemId,
        set: {
          rssPostId: post.rssPostId,
          feedUrl: post.feedUrl,
          feedTitle: post.feedTitle,
          authorName: post.authorName,
          title: post.title,
          body: post.body,
          previewUrl: post.previewUrl,
          thumbnailUrl: post.thumbnailUrl,
          media: post.media,
          domain: post.domain,
          permalink: post.permalink,
          guid: post.guid,
          fetchedAt: new Date(),
        },
      })

    await Promise.all(
      targetInputIds.map((inputId) =>
        db
          .insert(inputItems)
          .values({
            inputId,
            contentItemId: contentItem.id,
          })
          .onConflictDoNothing(),
      ),
    )
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

async function listUniversalRssInputs() {
  const db = getDb(env.DATABASE_URL)
  return db
    .select({
      inputId: inputs.id,
      userId: inputs.userId,
      pollIntervalMinutes: inputs.pollIntervalMinutes,
      lastFetchedAt: inputs.lastFetchedAt,
      feedUrl: rssInputs.feedUrl,
      sourceProvider: rssInputs.sourceProvider,
      sourceKey: rssInputs.sourceKey,
      sourceLabel: rssInputs.sourceLabel,
      listingType: rssInputs.listingType,
      timeRange: rssInputs.timeRange,
      etag: rssInputs.etag,
      lastModified: rssInputs.lastModified,
    })
    .from(inputs)
    .innerJoin(rssInputs, eq(rssInputs.inputId, inputs.id))
    .where(and(eq(inputs.provider, 'rss'), eq(inputs.enabled, true)))
}

async function listUniversalTelegramInputs() {
  const db = getDb(env.DATABASE_URL)
  return db
    .select({
      inputId: inputs.id,
      userId: inputs.userId,
      pollIntervalMinutes: inputs.pollIntervalMinutes,
      lastFetchedAt: inputs.lastFetchedAt,
      channelUsername: telegramInputs.channelUsername,
      channelTitle: telegramInputs.channelTitle,
      siteUrl: telegramInputs.siteUrl,
      latestSeenMessageId: telegramInputs.latestSeenMessageId,
      lastCheckedAt: telegramInputs.lastCheckedAt,
    })
    .from(inputs)
    .innerJoin(telegramInputs, eq(telegramInputs.inputId, inputs.id))
    .where(and(eq(inputs.provider, 'telegram'), eq(inputs.enabled, true)))
}

async function fetchRssFeed(feedUrl: string, etag?: string | null, lastModified?: string | null) {
  const headers = new Headers({
    'User-Agent': 'Omens RSS fetcher/1.0 (+https://omens.online)',
    Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  })
  if (etag) headers.set('If-None-Match', etag)
  if (lastModified) headers.set('If-Modified-Since', lastModified)

  const response = await fetch(feedUrl, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })

  if (response.status === 304) {
    return {
      status: 'not_modified' as const,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`RSS request failed (${response.status}): ${text.slice(0, 200) || 'unknown error'}`)
  }

  return {
    status: 'ok' as const,
    body: await response.text(),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
}

async function enrichRedditRssGalleryPosts(posts: RedditPostRecord[]) {
  const getMediaUrlCount = (media: string | null) => {
    if (!media) return 0
    try {
      const parsed = JSON.parse(media)
      if (Array.isArray(parsed?.galleryItems)) return parsed.galleryItems.length
      if (Array.isArray(parsed?.galleryUrls)) return parsed.galleryUrls.length
      if (Array.isArray(parsed?.urls)) return parsed.urls.length
    } catch {}
    return 0
  }

  const galleryPosts = posts.filter((post) =>
    /:\/\/(?:www\.)?reddit\.com\/gallery\//i.test(post.url) &&
    getMediaUrlCount(post.media) < 2,
  )

  if (galleryPosts.length === 0) return posts

  const enrichedById = new Map<string, Pick<RedditPostRecord, 'previewUrl' | 'thumbnailUrl' | 'media'>>()

  await Promise.all(galleryPosts.map(async (post) => {
    try {
      const publicGalleryItems = await fetchRedditPublicGalleryMedia(post.permalink || post.url)
      const enriched = publicGalleryItems.length > 0
        ? {
            ...post,
            previewUrl: publicGalleryItems[0]?.thumbnail || post.previewUrl,
            thumbnailUrl: publicGalleryItems[0]?.thumbnail || post.thumbnailUrl,
            media: JSON.stringify({ galleryItems: publicGalleryItems }),
          }
        : null

      if (enriched && (enriched.media || enriched.previewUrl || enriched.thumbnailUrl)) {
        enrichedById.set(post.redditPostId, {
          previewUrl: enriched.previewUrl,
          thumbnailUrl: enriched.thumbnailUrl,
          media: enriched.media,
        })
      }
    } catch (err) {
      console.error(
        `[fetcher] Reddit gallery enrichment failed for ${post.redditPostId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }))

  return posts.map((post) => {
    const enriched = enrichedById.get(post.redditPostId)
    return enriched ? { ...post, ...enriched } : post
  })
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

async function fetchRssInput(row: {
  inputId: string
  userId: string
  feedUrl: string
  sourceProvider: string
  sourceKey: string | null
  etag: string | null
  lastModified: string | null
}) {
  const db = getDb(env.DATABASE_URL)
  const fetched = await fetchRssFeed(row.feedUrl, row.etag, row.lastModified)
  const now = new Date()

  if (fetched.status === 'not_modified') {
    await db
      .update(rssInputs)
      .set({
        etag: fetched.etag || row.etag,
        lastModified: fetched.lastModified || row.lastModified,
        lastCheckedAt: now,
      })
      .where(eq(rssInputs.inputId, row.inputId))

    await db
      .update(inputs)
      .set({
        lastFetchedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(inputs.id, row.inputId))

    return 0
  }

  let newCount = 0

  if (row.sourceProvider === 'reddit') {
    const parsedPosts = parseRedditRssFeed(fetched.body, row.sourceKey || undefined)
    const posts = await enrichRedditRssGalleryPosts(parsedPosts)
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

    await upsertUniversalRedditData([row.inputId], posts)
    newCount = posts.filter((post) => !existingSet.has(post.redditPostId)).length
  } else if (row.sourceProvider === 'generic') {
    const { posts } = parseGenericRssFeed(fetched.body, row.feedUrl)
    const incomingIds = posts.map((post) => post.rssPostId)
    const existingItems = incomingIds.length > 0
      ? await db
        .select({ externalId: contentItems.externalId })
        .from(contentItems)
        .where(and(
          eq(contentItems.provider, 'rss'),
          eq(contentItems.entityType, 'rss_post'),
          inArray(contentItems.externalId, incomingIds),
        ))
      : []
    const existingSet = new Set(existingItems.map((item) => item.externalId))

    await upsertUniversalRssData([row.inputId], posts)
    newCount = posts.filter((post) => !existingSet.has(post.rssPostId)).length
  } else {
    throw new Error(`Unsupported RSS provider: ${row.sourceProvider}`)
  }

  await db
    .update(rssInputs)
    .set({
      etag: fetched.etag || row.etag,
      lastModified: fetched.lastModified || row.lastModified,
      lastCheckedAt: now,
    })
    .where(eq(rssInputs.inputId, row.inputId))

  await db
    .update(inputs)
    .set({
      lastFetchedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(inputs.id, row.inputId))

  if (newCount > 0) {
    console.log(`[fetcher] Inserted ${newCount} new rss posts for user ${row.userId}`)
    void scoreUnscoredTweetsForAllFeeds(row.userId).catch((err) =>
      console.error(`[fetcher] Scoring error for user ${row.userId}:`, err instanceof Error ? err.message : err),
    )
  }

  return newCount
}

function buildTelegramFetchGroupKey(row: UniversalTelegramInputRow) {
  return row.channelUsername.toLowerCase()
}

async function fetchTelegramChannelForRows(rows: UniversalTelegramInputRow[]) {
  const oldestSeenMessageId = rows.reduce<number | null>((oldest, row) => {
    if (row.latestSeenMessageId == null) return oldest
    if (oldest == null) return row.latestSeenMessageId
    return Math.min(oldest, row.latestSeenMessageId)
  }, null)

  return fetchTelegramChannelPosts({
    channelUsername: rows[0]!.channelUsername,
    stopAtMessageId: oldestSeenMessageId,
    maxPages: oldestSeenMessageId == null ? 1 : 10,
    overlapCount: oldestSeenMessageId == null ? 0 : 20,
  })
}

async function updateFetchedStateForTelegramInputs(
  rows: UniversalTelegramInputRow[],
  now: Date,
  channelTitle: string | null,
  newestMessageId: number | null,
) {
  const db = getDb(env.DATABASE_URL)
  const inputIds = rows.map((row) => row.inputId)

  for (const row of rows) {
    await db
      .update(telegramInputs)
      .set({
        channelTitle: channelTitle || row.channelTitle || null,
        latestSeenMessageId: newestMessageId != null
          ? Math.max(row.latestSeenMessageId || 0, newestMessageId)
          : row.latestSeenMessageId,
        lastCheckedAt: now,
      })
      .where(eq(telegramInputs.inputId, row.inputId))
  }

  await db
    .update(inputs)
    .set({
      lastFetchedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(inArray(inputs.id, inputIds))
}

async function setTelegramFetchError(inputIds: string[], message: string) {
  const db = getDb(env.DATABASE_URL)
  await db
    .update(inputs)
    .set({
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(inArray(inputs.id, inputIds))
}

async function fetchTelegramInput(row: UniversalTelegramInputRow) {
  try {
    const db = getDb(env.DATABASE_URL)
    const fetched = await fetchTelegramChannelForRows([row])
    const now = new Date()
    const incomingIds = fetched.posts.map((post) => post.telegramPostId)
    const existingItems = incomingIds.length > 0
      ? await db
        .select({ externalId: contentItems.externalId })
        .from(contentItems)
        .where(and(
          eq(contentItems.provider, 'telegram'),
          eq(contentItems.entityType, 'telegram_post'),
          inArray(contentItems.externalId, incomingIds),
        ))
      : []
    const existingSet = new Set(existingItems.map((item) => item.externalId))
    const newPosts = fetched.posts.filter((post) => row.latestSeenMessageId == null || post.messageId > row.latestSeenMessageId)

    await upsertUniversalTelegramData(fetched.posts.map((post) => ({ post, inputIds: [row.inputId] })))
    await updateFetchedStateForTelegramInputs([row], now, fetched.channelTitle, fetched.newestMessageId)

    const newCount = newPosts.filter((post) => !existingSet.has(post.telegramPostId)).length
    if (newCount > 0) {
      console.log(`[fetcher] Inserted ${newCount} new telegram posts for user ${row.userId}`)
      void scoreUnscoredTweetsForAllFeeds(row.userId).catch((err) =>
        console.error(`[fetcher] Scoring error for user ${row.userId}:`, err instanceof Error ? err.message : err),
      )
    }

    return newCount
  } catch (err) {
    await setTelegramFetchError([row.inputId], err instanceof Error ? err.message : String(err))
    throw err
  }
}

function buildRssFetchGroupKey(row: UniversalRssInputRow) {
  return [
    row.sourceProvider,
    row.feedUrl,
    row.sourceKey || '',
    row.listingType || '',
    row.timeRange || '',
  ].join('::')
}

function getNextFetchAt(lastFetchedAt: Date | null, intervalMinutes: number) {
  const lastFetch = lastFetchedAt?.getTime() || 0
  return lastFetch + intervalMinutes * 60_000
}

function pickRssValidatorRow(rows: UniversalRssInputRow[]) {
  return rows.reduce((best, row) => {
    const bestScore = (best.etag ? 1 : 0) + (best.lastModified ? 1 : 0)
    const rowScore = (row.etag ? 1 : 0) + (row.lastModified ? 1 : 0)

    if (rowScore !== bestScore) {
      return rowScore > bestScore ? row : best
    }

    const bestFetchedAt = best.lastFetchedAt?.getTime() || 0
    const rowFetchedAt = row.lastFetchedAt?.getTime() || 0
    return rowFetchedAt > bestFetchedAt ? row : best
  }, rows[0]!)
}

async function updateFetchedStateForRssInputs(
  rows: UniversalRssInputRow[],
  now: Date,
  etag: string | null | undefined,
  lastModified: string | null | undefined,
) {
  const db = getDb(env.DATABASE_URL)
  const inputIds = rows.map((row) => row.inputId)
  const validatorRow = pickRssValidatorRow(rows)

  await db
    .update(rssInputs)
    .set({
      etag: etag || validatorRow.etag || null,
      lastModified: lastModified || validatorRow.lastModified || null,
      lastCheckedAt: now,
    })
    .where(inArray(rssInputs.inputId, inputIds))

  await db
    .update(inputs)
    .set({
      lastFetchedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(inArray(inputs.id, inputIds))
}

async function fetchSharedRssInputGroup(rows: UniversalRssInputRow[]) {
  if (rows.length === 0) return 0

  const db = getDb(env.DATABASE_URL)
  const validatorRow = pickRssValidatorRow(rows)
  const fetched = await fetchRssFeed(rows[0]!.feedUrl, validatorRow.etag, validatorRow.lastModified)
  const now = new Date()

  if (fetched.status === 'not_modified') {
    await updateFetchedStateForRssInputs(rows, now, fetched.etag, fetched.lastModified)
    return 0
  }

  let newCount = 0

  if (rows[0]!.sourceProvider === 'reddit') {
    const parsedPosts = parseRedditRssFeed(fetched.body, rows[0]!.sourceKey || undefined)
    const posts = await enrichRedditRssGalleryPosts(parsedPosts)
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

    await upsertUniversalRedditData(rows.map((row) => row.inputId), posts)
    newCount = posts.filter((post) => !existingSet.has(post.redditPostId)).length
  } else if (rows[0]!.sourceProvider === 'generic') {
    const { posts } = parseGenericRssFeed(fetched.body, rows[0]!.feedUrl)
    const incomingIds = posts.map((post) => post.rssPostId)
    const existingItems = incomingIds.length > 0
      ? await db
        .select({ externalId: contentItems.externalId })
        .from(contentItems)
        .where(and(
          eq(contentItems.provider, 'rss'),
          eq(contentItems.entityType, 'rss_post'),
          inArray(contentItems.externalId, incomingIds),
        ))
      : []
    const existingSet = new Set(existingItems.map((item) => item.externalId))

    await upsertUniversalRssData(rows.map((row) => row.inputId), posts)
    newCount = posts.filter((post) => !existingSet.has(post.rssPostId)).length
  } else {
    throw new Error(`Unsupported RSS provider: ${rows[0]!.sourceProvider}`)
  }

  await updateFetchedStateForRssInputs(rows, now, fetched.etag, fetched.lastModified)

  if (newCount > 0) {
    const watcherIds = [...new Set(rows.map((row) => row.userId))]
    const watcherCount = watcherIds.length
    console.log(`[fetcher] Inserted ${newCount} new rss posts shared across ${watcherCount} watcher(s)`)
    await Promise.all(
      watcherIds.map((userId) =>
        scoreUnscoredTweetsForAllFeeds(userId).catch((err) =>
          console.error(`[fetcher] Scoring error for user ${userId}:`, err instanceof Error ? err.message : err),
        ),
      ),
    )
  }

  return newCount
}

async function fetchSharedTelegramInputGroup(rows: UniversalTelegramInputRow[]) {
  if (rows.length === 0) return 0

  try {
    const db = getDb(env.DATABASE_URL)
    const fetched = await fetchTelegramChannelForRows(rows)
    const now = new Date()
    const incomingIds = fetched.posts.map((post) => post.telegramPostId)
    const existingItems = incomingIds.length > 0
      ? await db
        .select({ externalId: contentItems.externalId })
        .from(contentItems)
        .where(and(
          eq(contentItems.provider, 'telegram'),
          eq(contentItems.entityType, 'telegram_post'),
          inArray(contentItems.externalId, incomingIds),
        ))
      : []
    const existingSet = new Set(existingItems.map((item) => item.externalId))

    const targetPosts = fetched.posts.map((post) => ({
      post,
      inputIds: rows.map((row) => row.inputId),
    }))

    await upsertUniversalTelegramData(targetPosts)
    await updateFetchedStateForTelegramInputs(rows, now, fetched.channelTitle, fetched.newestMessageId)

    const newCount = targetPosts
      .map((target) => target.post)
      .filter((post) => !existingSet.has(post.telegramPostId))
      .length

    if (newCount > 0) {
      const watcherIds = [...new Set(rows.map((row) => row.userId))]
      console.log(`[fetcher] Inserted ${newCount} new telegram posts shared across ${watcherIds.length} watcher(s)`)
      await Promise.all(
        watcherIds.map((userId) =>
          scoreUnscoredTweetsForAllFeeds(userId).catch((err) =>
            console.error(`[fetcher] Scoring error for user ${userId}:`, err instanceof Error ? err.message : err),
          ),
        ),
      )
    }

    return newCount
  } catch (err) {
    await setTelegramFetchError(rows.map((row) => row.inputId), err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function fetchForUser(userId: string): Promise<{ count: number; inputs: number; error?: string }> {
  try {
    await ensureLegacyXInputForUser(userId)
    const xInputsForUser = (await listUniversalXInputs()).filter((row) => row.userId === userId)
    const rssInputsForUser = (await listUniversalRssInputs()).filter((row) => row.userId === userId)
    const telegramInputsForUser = (await listUniversalTelegramInputs()).filter((row) => row.userId === userId)
    const universalInputs = [...xInputsForUser, ...rssInputsForUser, ...telegramInputsForUser]

    if (universalInputs.length === 0) return { count: 0, inputs: 0 }

    let totalCount = 0
    for (const input of universalInputs) {
      totalCount += 'ct0' in input
        ? await fetchXInput(input)
        : 'feedUrl' in input
          ? await fetchRssInput(input)
          : await fetchTelegramInput(input)
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

  const xRows = await listUniversalXInputs()
  const rssRows = await listUniversalRssInputs()
  const telegramRows = await listUniversalTelegramInputs()

  const tasks: Promise<void>[] = []

  for (const row of xRows) {
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
      fetchXInput(row)
        .then(() => {})
        .catch((err) => console.error(`[fetcher] Error for input ${row.inputId}:`, err))
        .finally(() => activeFetches.delete(key)),
    )
  }

  const rssGroups = new Map<string, UniversalRssInputRow[]>()
  for (const row of rssRows) {
    const interval = row.pollIntervalMinutes ?? 15
    if (interval === 0) continue

    const groupKey = buildRssFetchGroupKey(row)
    const group = rssGroups.get(groupKey)
    if (group) {
      group.push(row)
    } else {
      rssGroups.set(groupKey, [row])
    }
  }

  const telegramGroups = new Map<string, UniversalTelegramInputRow[]>()
  for (const row of telegramRows) {
    const interval = row.pollIntervalMinutes ?? 15
    if (interval === 0) continue

    const groupKey = buildTelegramFetchGroupKey(row)
    const group = telegramGroups.get(groupKey)
    if (group) {
      group.push(row)
    } else {
      telegramGroups.set(groupKey, [row])
    }
  }

  for (const [groupKey, groupRows] of rssGroups) {
    const nextFetchAt = Math.min(
      ...groupRows.map((row) => getNextFetchAt(row.lastFetchedAt, row.pollIntervalMinutes ?? 15)),
    )
    if (Date.now() < nextFetchAt) continue

    const key = `rss:${groupKey}`
    if (activeFetches.has(key)) continue

    activeFetches.add(key)
    tasks.push(
      fetchSharedRssInputGroup(groupRows)
        .then(() => {})
        .catch((err) => console.error(`[fetcher] Error for rss group ${groupKey}:`, err))
        .finally(() => activeFetches.delete(key)),
    )
  }

  for (const [groupKey, groupRows] of telegramGroups) {
    const nextFetchAt = Math.min(
      ...groupRows.map((row) => getNextFetchAt(row.lastFetchedAt, row.pollIntervalMinutes ?? 15)),
    )
    if (Date.now() < nextFetchAt) continue

    const key = `telegram:${groupKey}`
    if (activeFetches.has(key)) continue

    activeFetches.add(key)
    tasks.push(
      fetchSharedTelegramInputGroup(groupRows)
        .then(() => {})
        .catch((err) => console.error(`[fetcher] Error for telegram group ${groupKey}:`, err))
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
