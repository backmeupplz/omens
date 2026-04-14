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
      data?: RedditListingPostData
    }>
  }
}

type RedditListingPostData = {
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
  gallery_data?: {
    items?: Array<{
      media_id?: string
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
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, '\'')
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

function extractGalleryUrls(post: RedditListingPostData) {
  const rawMediaMetadata = post.media_metadata
  const mediaMetadata = rawMediaMetadata && typeof rawMediaMetadata === 'object'
    ? rawMediaMetadata as Record<string, { s?: { u?: string } }>
    : null

  if (!mediaMetadata) return []

  const orderedIds = Array.isArray(post.gallery_data?.items)
    ? post.gallery_data.items.map((item) => item.media_id).filter((id): id is string => !!id)
    : []

  const seen = new Set<string>()
  const urls: string[] = []

  for (const mediaId of orderedIds) {
    const url = normalizeUrl(mediaMetadata[mediaId]?.s?.u)
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }

  for (const entry of Object.values(mediaMetadata)) {
    const url = normalizeUrl(entry?.s?.u)
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }

  return urls
}

function buildRedditMediaPayload(post: RedditListingPostData) {
  const previewUrl = normalizeUrl(post.preview?.images?.[0]?.source?.url)
  const thumbnailUrl = normalizeThumb(post.thumbnail)
  const galleryUrls = extractGalleryUrls(post)
  const mediaPayload = post.is_gallery || galleryUrls.length > 0 || post.media_metadata || post.secure_media || post.media
    ? JSON.stringify({
        isGallery: !!post.is_gallery,
        galleryUrls: galleryUrls.length > 0 ? galleryUrls : null,
        mediaMetadata: post.media_metadata || null,
        secureMedia: post.secure_media || null,
        media: post.media || null,
      })
    : null

  return {
    previewUrl: previewUrl || galleryUrls[0] || null,
    thumbnailUrl: thumbnailUrl || galleryUrls[0] || null,
    mediaPayload,
  }
}

function toRedditPostRecord(post: RedditListingPostData): RedditPostRecord | null {
  if (!post?.id || !post?.name || !post?.subreddit || !post?.title || !post?.url || !post?.permalink) {
    return null
  }

  const { previewUrl, thumbnailUrl, mediaPayload } = buildRedditMediaPayload(post)

  return {
    redditPostId: post.id,
    fullname: post.name,
    subreddit: post.subreddit,
    authorName: post.author || null,
    title: post.title,
    body: post.selftext || null,
    thumbnailUrl,
    previewUrl,
    media: mediaPayload,
    domain: post.domain || null,
    permalink: post.permalink,
    url: normalizeUrl(post.url) || `https://www.reddit.com${post.permalink}`,
    score: post.score || 0,
    commentCount: post.num_comments || 0,
    over18: !!post.over_18,
    spoiler: !!post.spoiler,
    isSelf: !!post.is_self,
    linkFlairText: post.link_flair_text || null,
    postHint: post.post_hint || null,
    publishedAt: post.created_utc ? new Date(post.created_utc * 1000) : null,
  }
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

let appAccessTokenCache: { token: string; expiresAt: number } | null = null

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

export async function getRedditAppAccessToken() {
  ensureConfigured()
  if (appAccessTokenCache && appAccessTokenCache.expiresAt - Date.now() > 60_000) {
    return appAccessTokenCache.token
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
  })
  const token = await requestRedditToken(body)
  appAccessTokenCache = {
    token: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
  return token.access_token
}

const REDDIT_PUBLIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function extractChallengeSolution(html: string) {
  const seed = html.match(/await\(async e=>e\+e\)\("([0-9a-f]+)"\)/i)?.[1]
  const token = html.match(/name="token"\s+value="([^"]+)"/i)?.[1]
  if (!seed || !token) return null
  return {
    solution: seed + seed,
    token,
  }
}

async function fetchRedditPublicHtml(url: string) {
  const first = await fetch(url, {
    headers: REDDIT_PUBLIC_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  const firstHtml = await first.text()
  if (!/Please wait for verification/i.test(firstHtml)) return firstHtml

  const challenge = extractChallengeSolution(firstHtml)
  if (!challenge) return firstHtml

  const challengedUrl = new URL(url)
  challengedUrl.searchParams.set('solution', challenge.solution)
  challengedUrl.searchParams.set('js_challenge', '1')
  challengedUrl.searchParams.set('token', challenge.token)

  const second = await fetch(challengedUrl.toString(), {
    headers: REDDIT_PUBLIC_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  return second.text()
}

export async function fetchRedditPublicGalleryMedia(postUrl: string) {
  const decodedHtml = decodeHtmlEntities(await fetchRedditPublicHtml(postUrl)) || ''
  const galleryStart = decodedHtml.indexOf('"gallery":{"__typename":"PostGallery","items":[')
  if (galleryStart === -1) return []
  const galleryEnd = decodedHtml.indexOf(']},"media":null', galleryStart)
  const galleryBlock = galleryEnd === -1
    ? decodedHtml.slice(galleryStart)
    : decodedHtml.slice(galleryStart, galleryEnd)
  const items: Array<{ url: string; thumbnail: string }> = []
  const seen = new Set<string>()
  const mediaBlocks = galleryBlock.split('"media":{"status":"VALID","__typename":"ImageAsset"').slice(1)

  for (const block of mediaBlocks) {
    const itemBlock = block.split('},"subcaptionStrikethrough"', 1)[0] || block
    const url = normalizeUrl(itemBlock.match(/"url":"(https:\/\/i\.redd\.it\/[^"]+)"/i)?.[1])
    const thumbnail = normalizeUrl(
      itemBlock.match(/"mediumPreview":\{"url":"(https:\/\/preview\.redd\.it\/[^"]+)"/i)?.[1]
      || itemBlock.match(/"preview":\{"url":"(https:\/\/preview\.redd\.it\/[^"]+)"/i)?.[1]
      || itemBlock.match(/"thumbnailPreview":\{"url":"(https:\/\/preview\.redd\.it\/[^"]+)"/i)?.[1]
      || itemBlock.match(/"url":"(https:\/\/i\.redd\.it\/[^"]+)"/i)?.[1],
    )
    if (url && thumbnail && !seen.has(url)) {
      seen.add(url)
      items.push({ url, thumbnail })
    }
  }

  return items
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
    .map((post) => post ? toRedditPostRecord(post) : null)
    .filter((post): post is RedditPostRecord => !!post)
}

export async function getRedditPostById(accessToken: string, postId: string): Promise<RedditPostRecord | null> {
  const listing = await redditGet<RedditBestListing>(`/api/info?id=t3_${postId}&raw_json=1`, accessToken)
  const post = listing.data?.children?.[0]?.data
  return post ? toRedditPostRecord(post) : null
}
