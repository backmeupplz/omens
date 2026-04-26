import {
  contentItems,
  getDb,
  itemScores,
  redditPosts,
  rssPosts,
  telegramPosts,
  xPosts,
} from '@omens/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

type TimelineXRow = {
  contentItem: typeof contentItems.$inferSelect
  xPost: typeof xPosts.$inferSelect | null
  redditPost: typeof redditPosts.$inferSelect | null
  rssPost: typeof rssPosts.$inferSelect | null
  telegramPost: typeof telegramPosts.$inferSelect | null
  score: number | null
}

type TimelineParentRow = {
  contentItem: typeof contentItems.$inferSelect
  xPost: typeof xPosts.$inferSelect
}

export interface TimelineTweetPayload {
  id: string
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  authorBio: string | null
  content: string
  mediaUrls: string | null
  isRetweet: string | null
  card: string | null
  quotedTweet: string | null
  replyToHandle: string | null
  replyToTweetId: string | null
  hasSelfThreadReply: boolean
  selfThreadTweetCount: number
  parentTweet: TimelineTweetPayload | null
  url: string
  likes: number
  retweets: number
  replies: number
  views: number
  publishedAt: Date | null
}

export type TimelineItem =
  | {
      id: string
      provider: 'x'
      entityType: 'x_post'
      score: number | null
      publishedAt: Date | null
      payload: TimelineTweetPayload
    }
  | {
      id: string
      provider: 'reddit'
      entityType: 'reddit_post'
      score: number | null
      publishedAt: Date | null
      payload: {
        id: string
        redditPostId: string
        fullname: string
        subreddit: string
        authorName: string | null
        title: string
        body: string | null
        thumbnailUrl: string | null
        previewUrl: string | null
        media: string | null
        domain: string | null
        permalink: string
        url: string
        score: number
        commentCount: number
        over18: boolean
        spoiler: boolean
        isSelf: boolean
        linkFlairText: string | null
        postHint: string | null
        publishedAt: Date | null
      }
    }
  | {
      id: string
      provider: 'rss'
      entityType: 'rss_post'
      score: number | null
      publishedAt: Date | null
      payload: {
        id: string
        rssPostId: string
        feedUrl: string
        feedTitle: string | null
        authorName: string | null
        title: string
        body: string | null
        previewUrl: string | null
        thumbnailUrl: string | null
        media: string | null
        domain: string | null
        permalink: string
        guid: string | null
        publishedAt: Date | null
      }
    }
  | {
      id: string
      provider: 'telegram'
      entityType: 'telegram_post'
      score: number | null
      publishedAt: Date | null
      payload: {
        id: string
        telegramPostId: string
        channelUsername: string
        channelTitle: string | null
        messageId: number
        content: string | null
        media: string | null
        previewUrl: string | null
        thumbnailUrl: string | null
        domain: string | null
        linkUrl: string | null
        permalink: string
        viewCount: number
        postType: string | null
        publishedAt: Date | null
      }
    }

export function userInputsScope(userId: string) {
  return sql`exists (
    select 1
    from input_items ii
    inner join inputs i on i.id = ii.input_id
    where ii.content_item_id = ${contentItems.id}
      and i.user_id = ${userId}
      and i.enabled = true
  )`
}

export function feedInputsScope(userId: string, feedId: string) {
  return sql`exists (
    select 1
    from input_items ii
    inner join inputs i on i.id = ii.input_id
    inner join ai_scoring_feed_inputs fi on fi.input_id = i.id
    where ii.content_item_id = ${contentItems.id}
      and i.user_id = ${userId}
      and i.enabled = true
      and fi.feed_id = ${feedId}
  )`
}

function uniqueXPostIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => !!id))]
}

function sameHandle(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

async function resolveParentXPosts(rows: TimelineXRow[]) {
  const pendingBase = rows.flatMap((row) => (row.xPost ? [row.xPost.replyToXPostId] : []))
  if (pendingBase.length === 0) return new Map<string, TimelineParentRow>()

  const db = getDb()
  const parentMap = new Map<string, TimelineParentRow>()
  const seen = new Set<string>()
  let pending = uniqueXPostIds(pendingBase)

  while (pending.length > 0) {
    const batch = pending.filter((id) => !seen.has(id))
    if (batch.length === 0) break
    batch.forEach((id) => seen.add(id))

    const parents = await db
      .select({
        contentItem: contentItems,
        xPost: xPosts,
      })
      .from(xPosts)
      .innerJoin(contentItems, eq(contentItems.id, xPosts.contentItemId))
      .where(inArray(xPosts.xPostId, batch))

    for (const parent of parents) {
      if (!parentMap.has(parent.xPost.xPostId)) {
        parentMap.set(parent.xPost.xPostId, parent)
      }
    }

    pending = uniqueXPostIds(parents.map((parent) => parent.xPost.replyToXPostId))
  }

  return parentMap
}

async function resolveSelfThreadReplyIds(rows: TimelineXRow[]) {
  const visibleTweets = rows
    .filter((row) => !!row.xPost)
    .map((row) => ({ contentItem: row.contentItem, xPost: row.xPost! }))
  const visibleIds = uniqueXPostIds(visibleTweets.map((row) => row.xPost.xPostId))
  if (visibleIds.length === 0) return new Set<string>()

  const parentAuthorById = new Map(
    visibleTweets.map((row) => [row.xPost.xPostId, row.xPost.authorHandle] as const),
  )

  const db = getDb()
  const children = await db
    .select({
      replyToXPostId: xPosts.replyToXPostId,
      authorHandle: xPosts.authorHandle,
    })
    .from(xPosts)
    .where(inArray(xPosts.replyToXPostId, visibleIds))

  const ids = new Set<string>()
  for (const child of children) {
    const parentId = child.replyToXPostId
    if (!parentId) continue
    if (sameHandle(parentAuthorById.get(parentId), child.authorHandle)) {
      ids.add(parentId)
    }
  }

  return ids
}

async function resolveSelfThreadTweetCounts(
  rows: TimelineXRow[],
  parentMap: Map<string, TimelineParentRow>,
) {
  const visibleTweets = rows
    .filter((row) => !!row.xPost)
    .map((row) => ({ contentItem: row.contentItem, xPost: row.xPost! }))
  const knownRows = new Map<string, TimelineParentRow>()

  for (const row of visibleTweets) {
    knownRows.set(row.xPost.xPostId, row)
  }
  for (const row of parentMap.values()) {
    knownRows.set(row.xPost.xPostId, row)
  }

  if (knownRows.size === 0) return new Map<string, number>()

  const db = getDb()
  const seenAsParent = new Set<string>()
  let pendingParentIds = [...knownRows.keys()]

  while (pendingParentIds.length > 0) {
    const batch = pendingParentIds.filter((id) => !seenAsParent.has(id))
    if (batch.length === 0) break
    batch.forEach((id) => seenAsParent.add(id))

    const children = await db
      .select({
        contentItem: contentItems,
        xPost: xPosts,
      })
      .from(xPosts)
      .innerJoin(contentItems, eq(contentItems.id, xPosts.contentItemId))
      .where(inArray(xPosts.replyToXPostId, batch))

    const nextIds: string[] = []
    for (const child of children) {
      const parentId = child.xPost.replyToXPostId
      if (!parentId) continue

      const parent = knownRows.get(parentId)
      if (!parent) continue
      if (
        !sameHandle(child.xPost.authorHandle, parent.xPost.authorHandle)
        || !sameHandle(child.xPost.replyToHandle, parent.xPost.authorHandle)
      ) {
        continue
      }

      if (!knownRows.has(child.xPost.xPostId)) {
        knownRows.set(child.xPost.xPostId, child)
        nextIds.push(child.xPost.xPostId)
      }
    }

    pendingParentIds = nextIds
  }

  const neighbors = new Map<string, Set<string>>()
  const addEdge = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set())
    if (!neighbors.has(b)) neighbors.set(b, new Set())
    neighbors.get(a)!.add(b)
    neighbors.get(b)!.add(a)
  }

  for (const row of knownRows.values()) {
    const parentId = row.xPost.replyToXPostId
    if (!parentId) continue

    const parent = knownRows.get(parentId)
    if (!parent) continue
    if (
      sameHandle(row.xPost.authorHandle, parent.xPost.authorHandle)
      && sameHandle(row.xPost.replyToHandle, parent.xPost.authorHandle)
    ) {
      addEdge(parentId, row.xPost.xPostId)
    }
  }

  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const id of knownRows.keys()) {
    if (seen.has(id)) continue

    const component: string[] = []
    const stack = [id]
    seen.add(id)

    while (stack.length > 0) {
      const current = stack.pop()!
      component.push(current)
      for (const next of neighbors.get(current) || []) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }

    for (const componentId of component) {
      counts.set(componentId, component.length)
    }
  }

  return counts
}

function serializeTweetPayload(
  row: TimelineParentRow,
  parentMap: Map<string, TimelineParentRow>,
  selfThreadReplyIds: Set<string>,
  selfThreadTweetCounts: Map<string, number>,
  cache: Map<string, TimelineTweetPayload>,
): TimelineTweetPayload {
  const cached = cache.get(row.xPost.xPostId)
  if (cached) return cached

  const parent = row.xPost.replyToXPostId ? parentMap.get(row.xPost.replyToXPostId) ?? null : null
  const payload: TimelineTweetPayload = {
    id: row.contentItem.id,
    tweetId: row.xPost.xPostId,
    authorName: row.xPost.authorName,
    authorHandle: row.xPost.authorHandle,
    authorAvatar: row.xPost.authorAvatar,
    authorFollowers: row.xPost.authorFollowers,
    authorBio: row.xPost.authorBio,
    content: row.xPost.content,
    mediaUrls: row.xPost.mediaUrls,
    isRetweet: row.xPost.isRetweet,
    card: row.xPost.card,
    quotedTweet: row.xPost.quotedTweet,
    replyToHandle: row.xPost.replyToHandle,
    replyToTweetId: row.xPost.replyToXPostId,
    hasSelfThreadReply: selfThreadReplyIds.has(row.xPost.xPostId),
    selfThreadTweetCount: selfThreadTweetCounts.get(row.xPost.xPostId) ?? 1,
    parentTweet: parent ? serializeTweetPayload(parent, parentMap, selfThreadReplyIds, selfThreadTweetCounts, cache) : null,
    url: row.contentItem.url,
    likes: row.xPost.likes,
    retweets: row.xPost.retweets,
    replies: row.xPost.replies,
    views: row.xPost.views,
    publishedAt: row.contentItem.publishedAt,
  }
  cache.set(row.xPost.xPostId, payload)
  return payload
}

export async function serializeTimelineItems(rows: TimelineXRow[]): Promise<TimelineItem[]> {
  const parentMap = await resolveParentXPosts(rows)
  const selfThreadReplyIds = await resolveSelfThreadReplyIds(rows)
  const selfThreadTweetCounts = await resolveSelfThreadTweetCounts(rows, parentMap)
  const tweetCache = new Map<string, TimelineTweetPayload>()
  const items: TimelineItem[] = []
  for (const row of rows) {
    if (row.contentItem.provider === 'x' && row.xPost) {
      items.push({
        id: row.contentItem.id,
        provider: 'x' as const,
        entityType: 'x_post' as const,
        score: row.score,
        publishedAt: row.contentItem.publishedAt,
        payload: serializeTweetPayload(
          { contentItem: row.contentItem, xPost: row.xPost },
          parentMap,
          selfThreadReplyIds,
          selfThreadTweetCounts,
          tweetCache,
        ),
      })
      continue
    }

    if (row.contentItem.provider === 'reddit' && row.redditPost) {
      items.push({
        id: row.contentItem.id,
        provider: 'reddit' as const,
        entityType: 'reddit_post' as const,
        score: row.score,
        publishedAt: row.contentItem.publishedAt,
        payload: {
          id: row.contentItem.id,
          redditPostId: row.redditPost.redditPostId,
          fullname: row.redditPost.fullname,
          subreddit: row.redditPost.subreddit,
          authorName: row.redditPost.authorName,
          title: row.redditPost.title,
          body: row.redditPost.body,
          thumbnailUrl: row.redditPost.thumbnailUrl,
          previewUrl: row.redditPost.previewUrl,
          media: row.redditPost.media,
          domain: row.redditPost.domain,
          permalink: row.redditPost.permalink,
          url: row.contentItem.url,
          score: row.redditPost.score,
          commentCount: row.redditPost.commentCount,
          over18: row.redditPost.over18,
          spoiler: row.redditPost.spoiler,
          isSelf: row.redditPost.isSelf,
          linkFlairText: row.redditPost.linkFlairText,
          postHint: row.redditPost.postHint,
          publishedAt: row.contentItem.publishedAt,
        },
      })
      continue
    }

    if (row.contentItem.provider === 'rss' && row.rssPost) {
      items.push({
        id: row.contentItem.id,
        provider: 'rss' as const,
        entityType: 'rss_post' as const,
        score: row.score,
        publishedAt: row.contentItem.publishedAt,
        payload: {
          id: row.contentItem.id,
          rssPostId: row.rssPost.rssPostId,
          feedUrl: row.rssPost.feedUrl,
          feedTitle: row.rssPost.feedTitle,
          authorName: row.rssPost.authorName,
          title: row.rssPost.title,
          body: row.rssPost.body,
          previewUrl: row.rssPost.previewUrl,
          thumbnailUrl: row.rssPost.thumbnailUrl,
          media: row.rssPost.media,
          domain: row.rssPost.domain,
          permalink: row.rssPost.permalink,
          guid: row.rssPost.guid,
          publishedAt: row.contentItem.publishedAt,
        },
      })
      continue
    }

    if (row.contentItem.provider === 'telegram' && row.telegramPost) {
      items.push({
        id: row.contentItem.id,
        provider: 'telegram' as const,
        entityType: 'telegram_post' as const,
        score: row.score,
        publishedAt: row.contentItem.publishedAt,
        payload: {
          id: row.contentItem.id,
          telegramPostId: row.telegramPost.telegramPostId,
          channelUsername: row.telegramPost.channelUsername,
          channelTitle: row.telegramPost.channelTitle,
          messageId: row.telegramPost.messageId,
          content: row.telegramPost.content,
          media: row.telegramPost.media,
          previewUrl: row.telegramPost.previewUrl,
          thumbnailUrl: row.telegramPost.thumbnailUrl,
          domain: row.telegramPost.domain,
          linkUrl: row.telegramPost.linkUrl,
          permalink: row.telegramPost.permalink,
          viewCount: row.telegramPost.viewCount,
          postType: row.telegramPost.postType,
          publishedAt: row.contentItem.publishedAt,
        },
      })
    }
  }
  return items
}

export async function getTimelinePage(params: {
  userId: string
  page: number
  limit: number
  feedId?: string | null
  minScore?: number | null
}) {
  const db = getDb()
  const offset = (params.page - 1) * params.limit
  const scope = params.feedId ? feedInputsScope(params.userId, params.feedId) : userInputsScope(params.userId)
  const scoreJoin = and(
    eq(itemScores.contentItemId, contentItems.id),
    eq(itemScores.userId, params.userId),
    ...(params.feedId ? [eq(itemScores.feedId, params.feedId)] : []),
  )
  const scoreFilter = params.minScore != null
    ? sql`and ${itemScores.score} >= ${params.minScore}`
    : sql``

  const rows = await db
    .select({
      contentItem: contentItems,
      xPost: xPosts,
      redditPost: redditPosts,
      rssPost: rssPosts,
      telegramPost: telegramPosts,
      score: itemScores.score,
    })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
    .leftJoin(rssPosts, eq(rssPosts.contentItemId, contentItems.id))
    .leftJoin(telegramPosts, eq(telegramPosts.contentItemId, contentItems.id))
    .leftJoin(itemScores, scoreJoin)
    .where(sql`${scope} ${params.minScore != null ? sql`and ${itemScores.score} >= ${params.minScore}` : sql``}`)
    .orderBy(desc(contentItems.publishedAt))
    .limit(params.limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
    .leftJoin(rssPosts, eq(rssPosts.contentItemId, contentItems.id))
    .leftJoin(telegramPosts, eq(telegramPosts.contentItemId, contentItems.id))
    .leftJoin(itemScores, scoreJoin)
    .where(sql`${scope} ${scoreFilter}`)

  return {
    items: await serializeTimelineItems(rows),
    total: Number(count),
  }
}

export async function getPrimaryXTimelinePayloads(userId: string, page: number, limit: number, feedId?: string | null, minScore?: number | null) {
  const timeline = await getTimelinePage({ userId, page, limit, feedId, minScore })
  return {
    data: timeline.items
      .filter((item): item is Extract<TimelineItem, { provider: 'x' }> => item.provider === 'x')
      .map((item) => ({
        ...item.payload,
        score: item.score,
      })),
    total: timeline.total,
  }
}

export async function getTimelineItemsByIds(ids: string[]) {
  if (ids.length === 0) return []
  const db = getDb()
  const rows = await db
    .select({
      contentItem: contentItems,
      xPost: xPosts,
      redditPost: redditPosts,
      rssPost: rssPosts,
      telegramPost: telegramPosts,
      score: sql<number | null>`null`,
    })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
    .leftJoin(rssPosts, eq(rssPosts.contentItemId, contentItems.id))
    .leftJoin(telegramPosts, eq(telegramPosts.contentItemId, contentItems.id))
    .where(inArray(contentItems.id, ids))

  const byId = new Map((await serializeTimelineItems(rows)).map((item) => [item.id, item] as const))
  return ids.map((id) => byId.get(id)).filter((item): item is TimelineItem => !!item)
}
