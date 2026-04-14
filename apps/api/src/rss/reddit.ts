import type { RedditPostRecord } from '../reddit/api'

export type RedditRssListingType = 'hot' | 'new' | 'top'
export type RedditRssTimeRange = 'day' | 'week' | 'month' | 'year' | 'all'

function decodeEntities(value: string | null | undefined) {
  if (!value) return ''

  let current = value
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_match, entity: string) => {
      if (entity[0] === '#') {
        const isHex = entity[1]?.toLowerCase() === 'x'
        const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match
      }

      switch (entity) {
        case 'amp': return '&'
        case 'lt': return '<'
        case 'gt': return '>'
        case 'quot': return '"'
        case 'apos': return '\''
        case 'nbsp': return ' '
        default: return _match
      }
    })

    if (next === current) break
    current = next
  }

  return current
}

function extractTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1] || null
}

function extractAttr(block: string, tag: string, attr: string) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]+)"[^>]*/?>`, 'i'))
  return match?.[1] || null
}

function stripHtml(value: string | null | undefined) {
  if (!value) return null
  const decoded = decodeEntities(value)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return decoded || null
}

function normalizeUrl(value: string | null | undefined) {
  const decoded = decodeEntities(value)
  if (!decoded || !/^https?:\/\//i.test(decoded)) return null
  return decoded
}

function isRedditGalleryUrl(value: string | null | undefined) {
  const url = normalizeUrl(value)
  if (!url) return false
  try {
    const parsed = new URL(url)
    return /(^|\/)gallery\/[A-Za-z0-9]+\/?$/i.test(parsed.pathname)
  } catch {
    return false
  }
}

function isDirectMediaUrl(value: string | null | undefined) {
  const url = normalizeUrl(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.toLowerCase()
    if (
      parsed.hostname === 'i.redd.it' ||
      parsed.hostname === 'preview.redd.it' ||
      /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i.test(pathname)
    ) {
      return parsed.toString()
    }
  } catch {}
  return null
}

function normalizeSubreddit(value: string) {
  const trimmed = value.trim().replace(/^r\//i, '').replace(/^\/+|\/+$/g, '')
  if (!/^[A-Za-z0-9_]{2,64}$/.test(trimmed)) {
    throw new Error('Invalid subreddit name')
  }
  return trimmed
}

function formatListing(listingType: RedditRssListingType) {
  return listingType === 'hot'
    ? 'Hot'
    : listingType === 'new'
      ? 'New'
      : 'Top'
}

function parseEntryContent(contentHtml: string) {
  const decoded = decodeEntities(contentHtml)
  const outboundUrl = normalizeUrl(decoded.match(/<a href="([^"]+)">\[link\]<\/a>/i)?.[1] || null)
  const commentsUrl = normalizeUrl(decoded.match(/<a href="([^"]+)">\[comments\]<\/a>/i)?.[1] || null)
  const bodyHtml = decoded.match(/<div class="md">([\s\S]*?)<\/div>/i)?.[1] || null
  const body = stripHtml(bodyHtml)
  const mediaUrls = new Set<string>()

  for (const match of decoded.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
    const url = isDirectMediaUrl(match[1])
    if (url) mediaUrls.add(url)
  }

  for (const match of decoded.matchAll(/<a href="([^"]+)"/gi)) {
    const url = isDirectMediaUrl(match[1])
    if (url) mediaUrls.add(url)
  }

  return {
    outboundUrl,
    commentsUrl,
    body,
    mediaUrls: [...mediaUrls],
  }
}

function parsePublished(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function buildRedditSubredditFeedConfig(params: {
  subreddit: string
  listingType: RedditRssListingType
  timeRange?: RedditRssTimeRange | null
}) {
  const subreddit = normalizeSubreddit(params.subreddit)
  const listingType = params.listingType
  const timeRange = listingType === 'top' ? (params.timeRange || 'week') : null
  const listingPath = listingType === 'hot' ? '' : `${listingType}/`
  const feedUrl = new URL(`https://www.reddit.com/r/${subreddit}/${listingPath}.rss`)
  if (listingType === 'top' && timeRange) feedUrl.searchParams.set('t', timeRange)

  return {
    subreddit,
    sourceLabel: `r/${subreddit}`,
    listingType,
    timeRange,
    feedUrl: feedUrl.toString(),
    siteUrl: listingType === 'hot'
      ? `https://www.reddit.com/r/${subreddit}/`
      : `https://www.reddit.com/r/${subreddit}/${listingType}/`,
    inputName: `${`r/${subreddit}`} ${formatListing(listingType)}`,
  }
}

export function parseRedditRssFeed(xml: string, fallbackSubreddit?: string): RedditPostRecord[] {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
  return entries
    .map((match) => match[1] || '')
    .map((entry): RedditPostRecord | null => {
      const fullname = decodeEntities(extractTag(entry, 'id'))
      const title = decodeEntities(extractTag(entry, 'title'))
      const permalink = normalizeUrl(extractAttr(entry, 'link', 'href'))
      const authorName = decodeEntities(extractTag(extractTag(entry, 'author') || '', 'name'))
        .replace(/^\/u\//i, '')
        .trim() || null
      const publishedAt = parsePublished(extractTag(entry, 'published') || extractTag(entry, 'updated'))
      const subreddit = decodeEntities(extractAttr(entry, 'category', 'term') || fallbackSubreddit || '')
      const content = parseEntryContent(extractTag(entry, 'content') || '')
      const thumbnailFromEntry = normalizeUrl(extractAttr(entry, 'media:thumbnail', 'url'))
      const outboundUrl = content.outboundUrl && content.outboundUrl !== permalink ? content.outboundUrl : null
      const outboundMediaUrl = isDirectMediaUrl(outboundUrl)
      const isGalleryPost = isRedditGalleryUrl(outboundUrl)
      const shouldUseContentMedia = !outboundUrl || !!outboundMediaUrl || isGalleryPost
      const mediaUrls = [
        ...(shouldUseContentMedia ? content.mediaUrls : []),
        ...(thumbnailFromEntry ? [thumbnailFromEntry] : []),
      ].filter((url, index, arr) => arr.indexOf(url) === index)
      const url = outboundUrl || permalink
      if (!fullname || !title || !subreddit || !permalink || !url) return null

      let domain: string | null = null
      try {
        domain = new URL(url).hostname.replace(/^www\./i, '')
      } catch {}

      return {
        redditPostId: fullname.replace(/^t3_/, ''),
        fullname,
        subreddit,
        authorName,
        title,
        body: content.body,
        thumbnailUrl: mediaUrls[0] || null,
        previewUrl: mediaUrls[0] || null,
        media: mediaUrls.length > 0 ? JSON.stringify({ urls: mediaUrls }) : null,
        domain,
        permalink,
        url,
        score: 0,
        commentCount: 0,
        over18: false,
        spoiler: false,
        isSelf: !outboundUrl && !isGalleryPost,
        linkFlairText: null,
        postHint: isGalleryPost ? 'gallery' : outboundUrl ? 'link' : 'self',
        publishedAt,
      }
    })
    .filter((post): post is RedditPostRecord => !!post)
}
