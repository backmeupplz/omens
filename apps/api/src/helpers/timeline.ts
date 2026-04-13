import {
  contentItems,
  getDb,
  itemScores,
  redditPosts,
  xPosts,
} from '@omens/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

type TimelineXRow = {
  contentItem: typeof contentItems.$inferSelect
  xPost: typeof xPosts.$inferSelect | null
  redditPost: typeof redditPosts.$inferSelect | null
  score: number | null
}

export type TimelineItem =
  | {
      id: string
      provider: 'x'
      entityType: 'x_post'
      score: number | null
      publishedAt: Date | null
      payload: {
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
        url: string
        likes: number
        retweets: number
        replies: number
        views: number
        publishedAt: Date | null
      }
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

export function serializeTimelineItems(rows: TimelineXRow[]): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const row of rows) {
    if (row.contentItem.provider === 'x' && row.xPost) {
      items.push({
        id: row.contentItem.id,
        provider: 'x' as const,
        entityType: 'x_post' as const,
        score: row.score,
        publishedAt: row.contentItem.publishedAt,
        payload: {
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
          url: row.contentItem.url,
          likes: row.xPost.likes,
          retweets: row.xPost.retweets,
          replies: row.xPost.replies,
          views: row.xPost.views,
          publishedAt: row.contentItem.publishedAt,
        },
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
      score: itemScores.score,
    })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
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
    .leftJoin(itemScores, scoreJoin)
    .where(sql`${scope} ${scoreFilter}`)

  return {
    items: serializeTimelineItems(rows),
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
      score: sql<number | null>`null`,
    })
    .from(contentItems)
    .leftJoin(xPosts, eq(xPosts.contentItemId, contentItems.id))
    .leftJoin(redditPosts, eq(redditPosts.contentItemId, contentItems.id))
    .where(inArray(contentItems.id, ids))

  const byId = new Map(serializeTimelineItems(rows).map((item) => [item.id, item] as const))
  return ids.map((id) => byId.get(id)).filter((item): item is TimelineItem => !!item)
}
