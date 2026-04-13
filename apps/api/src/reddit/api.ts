import env from '../env'

const REDDIT_AUTHORIZE_URL = 'https://www.reddit.com/api/v1/authorize'
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'
const REDDIT_API_BASE = 'https://oauth.reddit.com'
const REDDIT_SCOPE = 'identity read mysubreddits'

type RedditTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

type RedditBestListing = {
  data?: {
    children?: Array<{
      data?: {
        id?: string
        name?: string
        subreddit?: string
        author?: string
        title?: string
        selftext?: string
        thumbnail?: string
        preview?: {
          images?: Array<{
            source?: { url?: string }
          }>
        }
        url?: string
        permalink?: string
        domain?: string
        score?: number
        num_comments?: number
        over_18?: boolean
        spoiler?: boolean
        is_self?: boolean
        link_flair_text?: string | null
        post_hint?: string | null
        created_utc?: number
        secure_media?: unknown
        media?: unknown
        media_metadata?: unknown
        is_gallery?: boolean
      }
    }>
  }
}

export type RedditPostRecord = {
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

function ensureConfigured() {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_REDIRECT_URI || !env.REDDIT_USER_AGENT) {
    throw new Error('Reddit OAuth is not configured')
  }
}

function redditBasicAuth() {
  return Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')
}

function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) return null
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalizeUrl(value: string | null | undefined) {
  const decoded = decodeHtmlEntities(value)
  if (!decoded) return null
  if (!/^https?:\/\//.test(decoded)) return null
  return decoded
}

function normalizeThumb(value: string | null | undefined) {
  const normalized = normalizeUrl(value)
  if (!normalized) return null
  if (['self', 'default', 'nsfw', 'spoiler', 'image'].includes(normalized)) return null
  return normalized
}

export function createRedditAuthorizeUrl(state: string) {
  ensureConfigured()
  const url = new URL(REDDIT_AUTHORIZE_URL)
  url.searchParams.set('client_id', env.REDDIT_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', env.REDDIT_REDIRECT_URI)
  url.searchParams.set('duration', 'permanent')
  url.searchParams.set('scope', REDDIT_SCOPE)
  return url.toString()
}

async function requestRedditToken(body: URLSearchParams): Promise<RedditTokenResponse> {
  ensureConfigured()
  const response = await fetch(REDDIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${redditBasicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': env.REDDIT_USER_AGENT,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Reddit token request failed (${response.status}): ${text || 'unknown error'}`)
  }

  return response.json() as Promise<RedditTokenResponse>
}

export async function exchangeRedditCode(code: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.REDDIT_REDIRECT_URI,
  })
  return requestRedditToken(body)
}

export async function refreshRedditAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return requestRedditToken(body)
}

async function redditGet<T>(path: string, accessToken: string): Promise<T> {
  ensureConfigured()
  const response = await fetch(`${REDDIT_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': env.REDDIT_USER_AGENT,
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Reddit API request failed (${response.status}): ${text || 'unknown error'}`)
  }

  return response.json() as Promise<T>
}

export async function getRedditMe(accessToken: string) {
  return redditGet<{ id: string; name: string }>('/api/v1/me', accessToken)
}

export async function getRedditBest(accessToken: string, limit = 50): Promise<RedditPostRecord[]> {
  const listing = await redditGet<RedditBestListing>(`/best?raw_json=1&limit=${limit}`, accessToken)
  const children = listing.data?.children || []

  return children
    .map((child) => child.data)
    .filter((post): post is NonNullable<typeof post> => !!post?.id && !!post?.name && !!post?.subreddit && !!post?.title && !!post?.url && !!post?.permalink)
    .map((post) => {
      const previewUrl = normalizeUrl(post.preview?.images?.[0]?.source?.url)
      const thumbnailUrl = normalizeThumb(post.thumbnail)
      const mediaPayload = post.is_gallery || post.media_metadata || post.secure_media || post.media
        ? JSON.stringify({
            isGallery: !!post.is_gallery,
            mediaMetadata: post.media_metadata || null,
            secureMedia: post.secure_media || null,
            media: post.media || null,
          })
        : null

      return {
        redditPostId: post.id!,
        fullname: post.name!,
        subreddit: post.subreddit!,
        authorName: post.author || null,
        title: post.title!,
        body: post.selftext || null,
        thumbnailUrl,
        previewUrl,
        media: mediaPayload,
        domain: post.domain || null,
        permalink: post.permalink!,
        url: normalizeUrl(post.url) || `https://www.reddit.com${post.permalink!}`,
        score: post.score || 0,
        commentCount: post.num_comments || 0,
        over18: !!post.over_18,
        spoiler: !!post.spoiler,
        isSelf: !!post.is_self,
        linkFlairText: post.link_flair_text || null,
        postHint: post.post_hint || null,
        publishedAt: post.created_utc ? new Date(post.created_utc * 1000) : null,
      }
    })
}
