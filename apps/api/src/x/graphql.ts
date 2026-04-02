/**
 * X internal GraphQL API client
 * Based on Nitter's apiutils.nim and consts.nim
 */

const API_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const GRAPHQL_BASE = 'https://x.com/i/api/graphql'

// These rotate with X deploys — update as needed
const ENDPOINTS = {
  HomeTimeline: 'c-CzHF1LboFilMpsx4ZCrQ/HomeTimeline',
  HomeLatestTimeline: 'BKB7oi212Fi7kQtCBGE4zA/HomeLatestTimeline',
  TweetDetail: 'YVyS4SfwYW7Uw5qwy0mQCA/TweetDetail',
} as const

const GQL_FEATURES = {
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
}

export interface ParsedTweet {
  tweetId: string
  authorId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  authorBio: string | null
  content: string
  media: MediaItem[] | null
  isRetweet: string | null
  card: {
    title: string
    description: string | null
    thumbnail: string | null
    domain: string
    url: string
  } | null
  quotedTweet: {
    authorName: string
    authorHandle: string
    authorAvatar: string | null
    content: string
    media: MediaItem[] | null
    card: ParsedTweet['card'] | null
    url: string
  } | null
  url: string
  likes: number
  retweets: number
  replies: number
  views: number
  replyToHandle: string | null
  replyToTweetId: string | null
  publishedAt: Date
}

interface Session {
  authToken: string
  ct0: string
}

function buildHeaders(session: Session): Record<string, string> {
  return {
    Authorization: `Bearer ${API_BEARER}`,
    'X-Csrf-Token': session.ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Client-Language': 'en',
    Cookie: `auth_token=${session.authToken}; ct0=${session.ct0}`,
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Encoding': 'gzip',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    Origin: 'https://x.com',
    Referer: 'https://x.com/',
  }
}

async function graphqlRequest(
  endpoint: string,
  variables: Record<string, unknown>,
  session: Session,
): Promise<any> {
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GQL_FEATURES),
  })

  const url = `${GRAPHQL_BASE}/${endpoint}?${params}`
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(session),
  })

  if (res.status === 429) {
    throw new Error('X rate limited, try again later')
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('X session expired, please reconnect')
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`[graphql] X API error (${res.status}):`, text.slice(0, 500))
    throw new Error(`X API error (${res.status})`)
  }

  return res.json()
}

interface MediaItem {
  type: 'photo' | 'video'
  url: string // image URL or video URL
  thumbnail: string // preview image
}

function extractMedia(legacy: any): MediaItem[] | null {
  const media = legacy.extended_entities?.media || legacy.entities?.media
  if (!media || media.length === 0) return null

  const items: MediaItem[] = []
  for (const m of media) {
    if (m.type === 'video' || m.type === 'animated_gif') {
      // Get highest bitrate mp4 variant
      const variants = m.video_info?.variants || []
      const mp4s = variants
        .filter((v: any) => v.content_type === 'video/mp4')
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
      const videoUrl = mp4s[0]?.url || variants[0]?.url
      if (videoUrl) {
        items.push({
          type: 'video',
          url: videoUrl,
          thumbnail: m.media_url_https || m.media_url,
        })
      }
    } else {
      items.push({
        type: 'photo',
        url: m.media_url_https || m.media_url,
        thumbnail: m.media_url_https || m.media_url,
      })
    }
  }
  return items.length > 0 ? items : null
}

function getFullText(tweetResult: any, legacy: any): string {
  const noteText = tweetResult.note_tweet?.note_tweet_results?.result?.text
  let text = noteText || legacy.full_text || ''

  // Strip trailing t.co URLs when media, cards, articles, or quoted tweets are present (X's web client does this)
  const hasMedia = legacy.extended_entities?.media?.length > 0 ||
    legacy.entities?.media?.length > 0
  const hasCard = tweetResult.card?.legacy?.binding_values?.length > 0
  const hasArticle = !!tweetResult.article?.article_results?.result
  const hasQuote = !!tweetResult.quoted_status_result?.result
  if (hasMedia || hasCard || hasArticle || hasQuote) {
    text = text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, '')
  }

  // Decode HTML entities — X's API returns &amp; &lt; &gt; etc.
  return text.trim()
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function extractCard(tweetResult: any, tweetUrl?: string): ParsedTweet['card'] {
  // Check for X article data
  const article = tweetResult.article?.article_results?.result
  if (article) {
    const title = article.title || article.preview_title
    if (title) {
      const coverImg = article.cover_image?.media_info?.original_img_url ||
        article.cover_image?.media?.media_info?.original_img_url
      return {
        title,
        description: article.preview_body || article.subtitle || null,
        thumbnail: coverImg || null,
        domain: 'x.com',
        url: article.url || tweetUrl || '',
      }
    }
  }

  const card = tweetResult.card?.legacy
  if (!card?.binding_values) return null

  const vals: Record<string, string> = {}
  for (const bv of card.binding_values) {
    if (bv.value?.string_value) vals[bv.key] = bv.value.string_value
    if (bv.value?.image_value?.url) vals[bv.key] = bv.value.image_value.url
  }

  const title = vals.title
  if (!title) return null

  return {
    title,
    description: vals.description || null,
    thumbnail: vals.thumbnail_image_original || vals.thumbnail_image || vals.player_image_original || vals.player_image || null,
    domain: vals.vanity_url || vals.domain || '',
    url: vals.card_url || vals.url || card.url || '',
  }
}

function extractQuotedTweet(tweetResult: any): ParsedTweet['quotedTweet'] {
  let qt = tweetResult.quoted_status_result?.result
  if (!qt) return null
  if (qt.__typename === 'TweetWithVisibilityResults') qt = qt.tweet
  if (!qt?.legacy) return null
  const qLegacy = qt.legacy
  const qUserResult = qt.core?.user_results?.result
  const qUserLegacy = qUserResult?.legacy
  const qUserCore = qUserResult?.core
  if (!qUserLegacy && !qUserCore) return null

  const name = qUserCore?.name || qUserLegacy?.name || ''
  const handle = qUserCore?.screen_name || qUserLegacy?.screen_name || ''
  const avatar =
    qUserResult?.avatar?.image_url?.replace('_normal', '_bigger') ||
    qUserLegacy?.profile_image_url_https?.replace('_normal', '_bigger') ||
    null

  return {
    authorName: name,
    authorHandle: handle,
    authorAvatar: avatar,
    content: getFullText(qt, qLegacy),
    media: extractMedia(qLegacy),
    card: extractCard(qt, `https://x.com/${handle}/status/${qLegacy.id_str || qt.rest_id}`),
    url: `https://x.com/${handle}/status/${qLegacy.id_str || qt.rest_id}`,
  }
}

function parseTweetData(tweetResult: any): ParsedTweet | null {
  if (tweetResult.__typename === 'TweetWithVisibilityResults') {
    tweetResult = tweetResult.tweet
  }

  if (
    tweetResult.__typename !== 'Tweet' &&
    tweetResult.__typename !== 'TimelineTweet'
  )
    return null

  const legacy = tweetResult.legacy
  if (!legacy) return null

  // Skip ads/promoted content
  if (tweetResult.promotedMetadata || legacy.is_ad) return null

  const userResult = tweetResult.core?.user_results?.result
  const userLegacy = userResult?.legacy
  const userCore = userResult?.core
  if (!userLegacy && !userCore) return null

  // Check for retweet
  const rtResult = legacy.retweeted_status_result?.result
  if (rtResult) {
    const original = parseTweetData(rtResult)
    if (original) {
      const handle = userCore?.screen_name || userLegacy?.screen_name || ''
      return {
        ...original,
        tweetId: legacy.id_str || tweetResult.rest_id,
        isRetweet: handle,
        publishedAt: new Date(legacy.created_at),
      }
    }
  }

  // User data: try new API paths first, fall back to legacy
  const name = userCore?.name || userLegacy?.name || ''
  const handle = userCore?.screen_name || userLegacy?.screen_name || ''
  const avatar =
    userResult?.avatar?.image_url?.replace('_normal', '_bigger') ||
    userLegacy?.profile_image_url_https?.replace('_normal', '_bigger') ||
    null

  return {
    tweetId: legacy.id_str || tweetResult.rest_id,
    authorId: userResult?.rest_id || '',
    authorName: name,
    authorHandle: handle,
    authorAvatar: avatar,
    authorFollowers: userLegacy?.followers_count || 0,
    authorBio: userLegacy?.description || null,
    content: getFullText(tweetResult, legacy),
    media: extractMedia(legacy),
    isRetweet: null,
    card: extractCard(tweetResult, `https://x.com/${userLegacy.screen_name}/status/${legacy.id_str || tweetResult.rest_id}`),
    quotedTweet: extractQuotedTweet(tweetResult),
    url: `https://x.com/${userLegacy.screen_name}/status/${legacy.id_str || tweetResult.rest_id}`,
    likes: legacy.favorite_count || 0,
    retweets: legacy.retweet_count || 0,
    replies: legacy.reply_count || 0,
    views: Number(tweetResult.views?.count) || 0,
    replyToHandle: legacy.in_reply_to_screen_name || null,
    replyToTweetId: legacy.in_reply_to_status_id_str || null,
    publishedAt: new Date(legacy.created_at),
  }
}

function parseTweetEntry(entry: any): ParsedTweet | null {
  try {
    const content = entry?.content
    if (!content) return null

    if (
      content.entryType === 'TimelineTimelineCursor' ||
      content.__typename === 'TimelineTimelineCursor'
    )
      return null

    const itemContent = content.itemContent
    if (!itemContent) return null

    const tweetResult = itemContent.tweet_results?.result
    if (!tweetResult) return null

    return parseTweetData(tweetResult)
  } catch {
    return null
  }
}

export interface TimelineResult {
  tweets: ParsedTweet[]
  bottomCursor: string | null
}

function parseTimelineInstructions(instructions: any[]): { tweets: ParsedTweet[]; bottomCursor: string | null } {
  const tweets: ParsedTweet[] = []
  let bottomCursor: string | null = null

  for (const instruction of instructions) {
    if (
      instruction.type !== 'TimelineAddEntries' &&
      instruction.type !== 'TimelineAddToModule'
    )
      continue

    const entries = instruction.entries || []
    for (const entry of entries) {
      const cursorContent = entry?.content
      if (
        cursorContent?.entryType === 'TimelineTimelineCursor' ||
        cursorContent?.__typename === 'TimelineTimelineCursor'
      ) {
        if (cursorContent.cursorType === 'Bottom') {
          bottomCursor = cursorContent.value
        }
        continue
      }

      if (
        cursorContent?.entryType === 'TimelineTimelineModule' ||
        cursorContent?.__typename === 'TimelineTimelineModule'
      ) {
        const moduleItems = cursorContent.items || []
        for (const moduleItem of moduleItems) {
          const tweet = parseTweetEntry({ content: moduleItem.item })
          if (tweet) tweets.push(tweet)
        }
        continue
      }

      const tweet = parseTweetEntry(entry)
      if (tweet) tweets.push(tweet)
    }
  }

  return { tweets, bottomCursor }
}

async function fetchTimeline(
  endpoint: string,
  instructionsPath: (data: any) => any[],
  session: Session,
  cursor?: string,
): Promise<TimelineResult> {
  const variables: Record<string, unknown> = {
    count: 40,
    includePromotedContent: false,
    latestControlAvailable: true,
    requestContext: 'launch',
  }
  if (cursor) variables.cursor = cursor

  const data = await graphqlRequest(endpoint, variables, session)
  return parseTimelineInstructions(instructionsPath(data))
}

export async function getHomeTimeline(
  session: Session,
): Promise<TimelineResult> {
  const [forYou, following] = await Promise.all([
    fetchTimeline(
      ENDPOINTS.HomeTimeline,
      (d) => d?.data?.home?.home_timeline_urt?.instructions || [],
      session,
    ),
    fetchTimeline(
      ENDPOINTS.HomeLatestTimeline,
      (d) => d?.data?.home?.home_timeline_urt?.instructions || [],
      session,
    ).catch(() => ({ tweets: [], bottomCursor: null } as TimelineResult)),
  ])

  // Deduplicate by tweetId, preferring For You entries
  const seen = new Set<string>()
  const tweets: ParsedTweet[] = []
  for (const tweet of [...forYou.tweets, ...following.tweets]) {
    if (!seen.has(tweet.tweetId)) {
      seen.add(tweet.tweetId)
      tweets.push(tweet)
    }
  }

  return { tweets, bottomCursor: null }
}

export interface Reply {
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  authorFollowers: number
  content: string
  likes: number
  publishedAt: Date
}

export interface RepliesResult {
  replies: Reply[]
  cursor: string | null
}

export interface ThreadResult {
  tweets: ParsedTweet[]
}

export async function getTweetThread(
  session: Session,
  tweetId: string,
): Promise<ThreadResult> {
  const variables: Record<string, unknown> = {
    focalTweetId: tweetId,
    referrer: 'tweet',
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: false,
    withVoice: false,
    withV2Timeline: true,
  }

  const fieldToggles = {
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false,
  }

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GQL_FEATURES),
    fieldToggles: JSON.stringify(fieldToggles),
  })

  const url = `${GRAPHQL_BASE}/${ENDPOINTS.TweetDetail}?${params}`
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(session),
  })

  if (!res.ok) return { tweets: [] }

  const data = await res.json()
  const instructions =
    data?.data?.threaded_conversation_with_injections_v2?.instructions || []

  // Collect all tweets from the conversation
  const allTweets: ParsedTweet[] = []

  function tryExtract(obj: any): ParsedTweet | null {
    if (!obj) return null
    const itemContent = obj.itemContent || obj
    let result = itemContent?.tweet_results?.result
    if (!result) return null
    return parseTweetData(result)
  }

  for (const instruction of instructions) {
    const entries = instruction.entries || []
    for (const entry of entries) {
      if (entry.entryId?.startsWith('cursor-')) continue
      const content = entry.content
      if (!content) continue

      if (content.items) {
        for (const item of content.items) {
          const tweet = tryExtract(item?.item)
          if (tweet) allTweets.push(tweet)
        }
        continue
      }

      const tweet = tryExtract(content)
      if (tweet) allTweets.push(tweet)
    }
  }

  // Find the focal tweet to determine the thread author
  const focalTweet = allTweets.find((t) => t.tweetId === tweetId)
  if (!focalTweet) return { tweets: allTweets.length > 0 ? [allTweets[0]] : [] }

  const authorHandle = focalTweet.authorHandle

  // Filter to only same-author non-RT tweets
  const authorTweets = allTweets.filter(
    (t) => t.authorHandle === authorHandle && !t.isRetweet,
  )

  // Deduplicate by tweetId
  const seen = new Set<string>()
  const unique: ParsedTweet[] = []
  for (const t of authorTweets) {
    if (!seen.has(t.tweetId)) {
      seen.add(t.tweetId)
      unique.push(t)
    }
  }

  // Build parent->child map for chain walking
  const byId = new Map<string, ParsedTweet>()
  const childOf = new Map<string, ParsedTweet>() // parentId -> child
  for (const t of unique) {
    byId.set(t.tweetId, t)
    if (t.replyToTweetId && t.replyToHandle === authorHandle) {
      childOf.set(t.replyToTweetId, t)
    }
  }

  // Find root: walk up from focal tweet
  let root = focalTweet
  while (root.replyToTweetId && byId.has(root.replyToTweetId)) {
    root = byId.get(root.replyToTweetId)!
  }

  // Walk down from root following self-reply chain
  const chain: ParsedTweet[] = [root]
  let current = root
  while (true) {
    const next = childOf.get(current.tweetId)
    if (!next) break
    chain.push(next)
    current = next
  }

  return { tweets: chain }
}

export async function getTweetReplies(
  session: Session,
  tweetId: string,
  cursor?: string,
): Promise<RepliesResult> {
  const variables: Record<string, unknown> = {
    focalTweetId: tweetId,
    referrer: 'tweet',
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: false,
    withVoice: false,
    withV2Timeline: true,
  }
  if (cursor) variables.cursor = cursor

  const fieldToggles = {
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false,
  }

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GQL_FEATURES),
    fieldToggles: JSON.stringify(fieldToggles),
  })

  const url = `${GRAPHQL_BASE}/${ENDPOINTS.TweetDetail}?${params}`
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(session),
  })

  if (!res.ok) return { replies: [], cursor: null }

  const data = await res.json()
  const instructions =
    data?.data?.threaded_conversation_with_injections_v2?.instructions || []

  const replies: Reply[] = []
  let nextCursor: string | null = null

  function tryExtractReply(obj: any) {
    if (!obj) return
    const itemContent = obj.itemContent || obj
    let result = itemContent?.tweet_results?.result
    if (!result) return
    if (result.__typename === 'TweetWithVisibilityResults')
      result = result.tweet
    if (!result?.legacy) return

    const legacy = result.legacy
    // Only include actual replies to this tweet (skip focal tweet, parent, and suggestions)
    if (legacy.in_reply_to_status_id_str !== tweetId) return

    // User data can be in multiple places depending on API version:
    // New: result.core.user_results.result.core.{name,screen_name} + result.core.user_results.result.avatar.image_url
    // Old: result.core.user_results.result.legacy.{name,screen_name,profile_image_url_https}
    const userResult = result.core?.user_results?.result
    const userLegacy = userResult?.legacy
    const userCore = userResult?.core

    const name = userCore?.name || userLegacy?.name || ''
    const handle = userCore?.screen_name || userLegacy?.screen_name || ''
    const avatar =
      userResult?.avatar?.image_url?.replace('_normal', '_bigger') ||
      userLegacy?.profile_image_url_https?.replace('_normal', '_bigger') ||
      null
    const followers = userLegacy?.followers_count || 0

    replies.push({
      authorName: name,
      authorHandle: handle,
      authorAvatar: avatar,
      authorFollowers: followers,
      content: getFullText(result, legacy),
      likes: legacy.favorite_count || 0,
      publishedAt: new Date(legacy.created_at),
    })
  }

  for (const instruction of instructions) {
    const entries = instruction.entries || []
    for (const entry of entries) {
      // Extract cursor for pagination
      if (entry.entryId?.startsWith('cursor-bottom')) {
        nextCursor = entry.content?.itemContent?.value ||
          entry.content?.value || null
        continue
      }
      if (entry.entryId?.startsWith('cursor-')) continue

      const content = entry.content
      if (!content) continue

      // Conversation thread module (most replies come here)
      if (content.items) {
        for (const item of content.items) {
          tryExtractReply(item?.item)
        }
        continue
      }

      // Single tweet entry
      tryExtractReply(content)
    }
  }

  return { replies, cursor: replies.length > 0 ? nextCursor : null }
}

// === Article Content ===

export interface ArticleContent {
  title: string
  coverImage: string | null
  body: string // plain text body
  richContent: ArticleRichBlock[] | null
  authorName: string
  authorHandle: string
  authorAvatar: string | null
}

export interface ArticleRichBlock {
  type: 'paragraph' | 'heading' | 'image' | 'tweet' | 'list' | 'blockquote' | 'divider'
  text?: string
  level?: number // for headings
  url?: string // for images
  tweetId?: string // for embedded tweets
  items?: string[] // for lists
  format?: Array<{ start: number; end: number; type: string; href?: string }> // inline formatting
}

function parseRichText(contentState: any, mediaMap?: Record<string, string>): ArticleRichBlock[] {
  const blocks: ArticleRichBlock[] = []
  if (!contentState?.blocks) return blocks

  for (const block of contentState.blocks) {
    const text: string = block.text || ''
    const type: string = block.type || 'unstyled'

    // Extract inline formatting (bold, italic, links)
    const format: ArticleRichBlock['format'] = []
    if (block.entityRanges && contentState.entityMap) {
      for (const range of block.entityRanges) {
        const entity = contentState.entityMap[String(range.key)]
        if (!entity) continue
        const eType = (entity.type || '').toUpperCase()
        if (eType === 'LINK' || eType === 'URL') {
          format.push({
            start: range.offset,
            end: range.offset + range.length,
            type: 'link',
            href: entity.data?.url || entity.data?.href || entity.data?.uri,
          })
        }
      }
    }
    if (block.inlineStyleRanges) {
      for (const range of block.inlineStyleRanges) {
        format.push({
          start: range.offset,
          end: range.offset + range.length,
          type: (range.style || 'BOLD').toLowerCase(),
        })
      }
    }

    if (type === 'atomic') {
      // Atomic blocks are typically media/embeds
      const entityKey = block.entityRanges?.[0]?.key
      const entity = entityKey != null ? contentState.entityMap?.[String(entityKey)] : null
      const eType = (entity?.type || '').toUpperCase()

      if (eType === 'IMAGE' || eType === 'PHOTO') {
        blocks.push({ type: 'image', url: entity.data?.src || entity.data?.url || entity.data?.media_url_https })
      } else if (eType === 'MEDIA') {
        // Media entity — look up in the article's media_entities map
        const mediaId = entity.data?.mediaId || entity.data?.id || entity.data?.media_key
        const mediaUrl = (mediaId && mediaMap?.[mediaId]) || entity.data?.src || entity.data?.url || entity.data?.media_url_https
        if (mediaUrl) {
          blocks.push({ type: 'image', url: mediaUrl })
        }
      } else if (eType === 'TWEET' || eType === 'EMBED' || eType === 'EMBEDDED_TWEET') {
        const tweetUrl = entity.data?.url || entity.data?.id || entity.data?.tweetId || ''
        const tweetIdMatch = String(tweetUrl).match(/(?:status\/)?(\d{10,})/)
        blocks.push({ type: 'tweet', tweetId: tweetIdMatch?.[1] || String(tweetUrl) })
      } else if (eType === 'DIVIDER' || eType === 'HR') {
        blocks.push({ type: 'divider' })
      } else {
        // Unknown atomic — log for debugging and render as paragraph
        if (entity) console.log('[article] Unknown atomic entity type:', entity.type, 'data keys:', Object.keys(entity.data || {}))
        if (text.trim()) blocks.push({ type: 'paragraph', text, format: format.length > 0 ? format : undefined })
      }
    } else if (type.startsWith('header-')) {
      const level = Number.parseInt(type.replace('header-', '')) || 2
      blocks.push({ type: 'heading', text, level, format: format.length > 0 ? format : undefined })
    } else if (type === 'blockquote') {
      blocks.push({ type: 'blockquote', text, format: format.length > 0 ? format : undefined })
    } else if (type === 'unordered-list-item' || type === 'ordered-list-item') {
      // Group consecutive list items
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list') {
        last.items!.push(text)
      } else {
        blocks.push({ type: 'list', items: [text] })
      }
    } else {
      // unstyled → paragraph
      if (text.trim()) {
        blocks.push({ type: 'paragraph', text, format: format.length > 0 ? format : undefined })
      }
    }
  }

  return blocks
}

export async function getArticleContent(
  session: Session,
  tweetId: string,
): Promise<ArticleContent | null> {
  const variables: Record<string, unknown> = {
    focalTweetId: tweetId,
    referrer: 'tweet',
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: false,
    withVoice: false,
    withV2Timeline: true,
  }

  const fieldToggles = {
    withArticleRichContentState: true,
    withArticlePlainText: true,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false,
  }

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GQL_FEATURES),
    fieldToggles: JSON.stringify(fieldToggles),
  })

  const url = `${GRAPHQL_BASE}/${ENDPOINTS.TweetDetail}?${params}`
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(session),
  })

  if (!res.ok) return null

  const data = await res.json()
  const instructions =
    data?.data?.threaded_conversation_with_injections_v2?.instructions || []

  // Find the focal tweet with article data
  for (const instruction of instructions) {
    const entries = instruction.entries || []
    for (const entry of entries) {
      const content = entry.content
      if (!content) continue

      const items = content.items ? content.items.map((i: any) => i?.item) : [content]
      for (const item of items) {
        const itemContent = item?.itemContent || item
        let result = itemContent?.tweet_results?.result
        if (!result) continue
        if (result.__typename === 'TweetWithVisibilityResults') result = result.tweet
        if (!result?.legacy || (result.legacy.id_str !== tweetId && result.rest_id !== tweetId)) continue

        const article = result.article?.article_results?.result
        if (!article) continue

        // Debug: log the article structure to understand available fields
        console.log('[article] Top-level keys:', Object.keys(article))
        if (article.cover_image) console.log('[article] cover_image keys:', Object.keys(article.cover_image))
        if (article.media_entities) console.log('[article] media_entities count:', Object.keys(article.media_entities).length)
        if (article.content_state) console.log('[article] Has content_state, blocks:', article.content_state?.blocks?.length, 'entityMap keys:', Object.keys(article.content_state?.entityMap || {}))
        if (article.rich_text) console.log('[article] Has rich_text, keys:', Object.keys(article.rich_text))
        // Log a sample of entity types if rich content exists
        const cs = article.content_state || article.rich_text?.content_state
        if (cs?.entityMap) {
          const entityTypes = Object.values(cs.entityMap).map((e: any) => `${e.type}(${Object.keys(e.data || {}).join(',')})`).slice(0, 10)
          console.log('[article] Entity types sample:', entityTypes)
        }

        const userResult = result.core?.user_results?.result
        const userLegacy = userResult?.legacy
        const userCore = userResult?.core

        const title = article.title || article.preview_title || ''
        // Try multiple paths for cover image
        const coverImg = article.cover_image?.media_info?.original_img_url ||
          article.cover_image?.media?.media_info?.original_img_url ||
          article.cover_image?.media_url_https ||
          article.cover_image?.url ||
          null
        if (!coverImg && article.cover_image) {
          console.log('[article] cover_image structure:', JSON.stringify(article.cover_image).slice(0, 500))
        }

        // Build media map for inline images (articles store media separately)
        const mediaMap: Record<string, string> = {}
        if (article.media_entities) {
          for (const [id, media] of Object.entries(article.media_entities as Record<string, any>)) {
            const url = media.media_info?.original_img_url || media.media_url_https || media.url
            if (url) mediaMap[id] = url
          }
        }

        // Try rich content first
        let richContent: ArticleRichBlock[] | null = null
        const contentState = article.content_state || article.rich_text?.content_state
        if (contentState) {
          richContent = parseRichText(contentState, mediaMap)
        }

        // Plain text fallback
        const body = article.plain_text || article.content_body || article.preview_body || ''

        return {
          title,
          coverImage: coverImg,
          body,
          richContent: richContent && richContent.length > 0 ? richContent : null,
          authorName: userCore?.name || userLegacy?.name || '',
          authorHandle: userCore?.screen_name || userLegacy?.screen_name || '',
          authorAvatar:
            userResult?.avatar?.image_url?.replace('_normal', '_bigger') ||
            userLegacy?.profile_image_url_https?.replace('_normal', '_bigger') || null,
        }
      }
    }
  }

  return null
}
