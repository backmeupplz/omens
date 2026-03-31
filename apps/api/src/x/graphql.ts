/**
 * X internal GraphQL API client
 * Based on Nitter's apiutils.nim and consts.nim
 */

const API_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const GRAPHQL_BASE = 'https://x.com/i/api/graphql'

// These rotate with X deploys — update as needed
const ENDPOINTS = {
  HomeLatestTimeline: 'BKB7oi212Fi7kQtCBGE4zA/HomeLatestTimeline',
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
  quotedTweet: {
    authorName: string
    authorHandle: string
    authorAvatar: string | null
    content: string
    url: string
  } | null
  url: string
  likes: number
  retweets: number
  replies: number
  views: number
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
  // note_tweet has the full untruncated text for long tweets
  const noteText =
    tweetResult.note_tweet?.note_tweet_results?.result?.text
  if (noteText) return noteText
  return legacy.full_text || ''
}

function extractQuotedTweet(tweetResult: any): ParsedTweet['quotedTweet'] {
  let qt = tweetResult.quoted_status_result?.result
  if (!qt) return null
  if (qt.__typename === 'TweetWithVisibilityResults') qt = qt.tweet
  if (!qt?.legacy || !qt?.core?.user_results?.result?.legacy) return null
  const qLegacy = qt.legacy
  const qUser = qt.core.user_results.result.legacy
  return {
    authorName: qUser.name || '',
    authorHandle: qUser.screen_name || '',
    authorAvatar: qUser.profile_image_url_https?.replace('_normal', '_bigger') || null,
    content: getFullText(qt, qLegacy),
    url: `https://x.com/${qUser.screen_name}/status/${qLegacy.id_str || qt.rest_id}`,
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

  const userResult = tweetResult.core?.user_results?.result
  const userLegacy = userResult?.legacy
  if (!userLegacy) return null

  // Check for retweet
  const rtResult = legacy.retweeted_status_result?.result
  if (rtResult) {
    // Parse the original tweet instead
    const original = parseTweetData(rtResult)
    if (original) {
      return {
        ...original,
        // Use the retweet's ID so we dedup correctly
        tweetId: legacy.id_str || tweetResult.rest_id,
        isRetweet: userLegacy.screen_name,
        // Keep retweet timestamp
        publishedAt: new Date(legacy.created_at),
      }
    }
  }

  const avatar = userLegacy.profile_image_url_https?.replace('_normal', '_bigger') || null

  return {
    tweetId: legacy.id_str || tweetResult.rest_id,
    authorId: userResult.rest_id || '',
    authorName: userLegacy.name || '',
    authorHandle: userLegacy.screen_name || '',
    authorAvatar: avatar,
    authorFollowers: userLegacy.followers_count || 0,
    authorBio: userLegacy.description || null,
    content: getFullText(tweetResult, legacy),
    media: extractMedia(legacy),
    isRetweet: null,
    quotedTweet: extractQuotedTweet(tweetResult),
    url: `https://x.com/${userLegacy.screen_name}/status/${legacy.id_str || tweetResult.rest_id}`,
    likes: legacy.favorite_count || 0,
    retweets: legacy.retweet_count || 0,
    replies: legacy.reply_count || 0,
    views: Number(tweetResult.views?.count) || 0,
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

export async function getHomeTimeline(
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

  const data = await graphqlRequest(ENDPOINTS.HomeLatestTimeline, variables, session)

  const instructions = data?.data?.home?.home_timeline_urt?.instructions || []
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
