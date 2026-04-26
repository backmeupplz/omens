import { createHash } from 'node:crypto'
import { decodeHtmlEntities } from '@omens/shared'

export type GenericRssMediaItem = {
  type: 'photo' | 'video' | 'gif'
  url: string
  thumbnail: string
}

export type GenericRssPostRecord = {
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

export type GenericRssFeedPreview = {
  feedUrl: string
  siteUrl: string | null
  title: string | null
  description: string | null
}

const RSS_HEADERS = {
  'User-Agent': 'Omens RSS fetcher/1.0 (+https://omens.online)',
  Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
}

function decodeEntities(value: string | null | undefined) {
  return decodeHtmlEntities(value)
}

function normalizeUrl(value: string | null | undefined, base?: string | null) {
  if (!value) return null
  try {
    const parsed = new URL(decodeEntities(value).trim(), base || undefined)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export function normalizeFeedUrl(value: string) {
  const normalized = normalizeUrl(value)
  if (!normalized) throw new Error('Invalid feed URL')
  return normalized
}

function extractTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1] || null
}

function extractSelfClosingAttr(block: string, tag: string, attr: string) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]+)"[^>]*/?>`, 'i'))
  return match?.[1] || null
}

function stripHtml(value: string | null | undefined) {
  if (!value) return null
  const decoded = decodeEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return decoded || null
}

function getHostname(url: string | null | undefined) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(decodeEntities(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getMimeType(url: string | null, declaredType: string | null | undefined) {
  const type = declaredType?.toLowerCase().trim()
  if (type) return type
  if (!url) return null
  const lowered = url.toLowerCase()
  if (/\.(png|jpe?g|webp)$/i.test(lowered)) return 'image'
  if (/\.gif$/i.test(lowered)) return 'gif'
  if (/\.(mp4|webm|mov|m4v)$/i.test(lowered)) return 'video'
  return null
}

function mediaTypeFromMime(mime: string | null) {
  if (!mime) return null
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('video')) return 'video'
  if (mime.includes('image')) return 'photo'
  return null
}

function parseMedia(block: string, contentHtml: string | null, baseUrl: string | null) {
  const seen = new Set<string>()
  const items: GenericRssMediaItem[] = []

  const push = (url: string | null, typeHint?: string | null, thumbnail?: string | null) => {
    const normalizedUrl = normalizeUrl(url, baseUrl)
    if (!normalizedUrl) return
    const mime = getMimeType(normalizedUrl, typeHint)
    const type = mediaTypeFromMime(mime)
    if (!type) return
    const key = `${type}:${normalizedUrl}`
    if (seen.has(key)) return
    seen.add(key)
    items.push({
      type,
      url: normalizedUrl,
      thumbnail: normalizeUrl(thumbnail, baseUrl) || normalizedUrl,
    })
  }

  for (const match of block.matchAll(/<media:thumbnail\b[^>]*\burl="([^"]+)"/gi)) {
    push(match[1], 'image', match[1])
  }

  for (const match of block.matchAll(/<media:content\b[^>]*\burl="([^"]+)"[^>]*?(?:\bmedium="([^"]+)")?[^>]*?(?:\btype="([^"]+)")?[^>]*\/?>/gi)) {
    push(match[1], match[3] || match[2] || null, match[1])
  }

  for (const match of block.matchAll(/<enclosure\b[^>]*\burl="([^"]+)"[^>]*?(?:\btype="([^"]+)")?[^>]*\/?>/gi)) {
    push(match[1], match[2] || null, match[1])
  }

  const html = contentHtml || ''
  for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    push(match[1], 'image', match[1])
  }
  for (const match of html.matchAll(/<video\b[^>]*\bposter="([^"]+)"[\s\S]*?<source\b[^>]*\bsrc="([^"]+)"/gi)) {
    push(match[2], 'video', match[1])
  }

  return {
    items,
    previewUrl: items[0]?.thumbnail || null,
  }
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = decodeEntities(value || '').trim()
    if (trimmed) return trimmed
  }
  return null
}

function extractPrimaryLink(block: string, feedUrl: string) {
  const atomAlternate = normalizeUrl(
    block.match(/<link\b[^>]*\brel="alternate"[^>]*\bhref="([^"]+)"/i)?.[1]
      || block.match(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="alternate"/i)?.[1]
      || null,
    feedUrl,
  )
  const atomHref = normalizeUrl(extractSelfClosingAttr(block, 'link', 'href'), feedUrl)
  const rssLink = normalizeUrl(stripHtml(extractTag(block, 'link')) || null, feedUrl)
  return atomAlternate || atomHref || rssLink || normalizeFeedUrl(feedUrl)
}

function buildRssPostId(feedUrl: string, identity: string) {
  return createHash('sha256')
    .update(`${feedUrl}\n${identity}`)
    .digest('hex')
}

function extractFeedMetadata(xml: string, feedUrl: string): GenericRssFeedPreview {
  const channel = extractTag(xml, 'channel')
  const feedBlock = extractTag(xml, 'feed')
  const title = stripHtml(
    extractTag(channel || '', 'title')
      || extractTag(feedBlock || '', 'title')
      || null,
  )
  const description = stripHtml(
    extractTag(channel || '', 'description')
      || extractTag(feedBlock || '', 'subtitle')
      || null,
  )
  const siteUrl = normalizeUrl(
    extractTag(channel || '', 'link')
      || feedBlock?.match(/<link\b[^>]*\brel="alternate"[^>]*\bhref="([^"]+)"/i)?.[1]
      || extractSelfClosingAttr(feedBlock || '', 'link', 'href')
      || null,
    feedUrl,
  )

  return {
    feedUrl: normalizeFeedUrl(feedUrl),
    siteUrl,
    title,
    description,
  }
}

export function parseGenericRssFeed(xml: string, feedUrl: string): {
  preview: GenericRssFeedPreview
  posts: GenericRssPostRecord[]
} {
  const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
  const preview = extractFeedMetadata(xml, normalizedFeedUrl)
  const entryBlocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0] || '')
  const itemBlocks = entryBlocks.length > 0
    ? entryBlocks
    : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0] || '')

  const posts = itemBlocks.map((block, index): GenericRssPostRecord | null => {
    const guid = firstNonEmpty(
      stripHtml(extractTag(block, 'guid')),
      stripHtml(extractTag(block, 'id')),
    )
    const permalink = extractPrimaryLink(block, normalizedFeedUrl)
    const title = firstNonEmpty(
      stripHtml(extractTag(block, 'title')),
      stripHtml(extractTag(block, 'media:title')),
    ) || 'Untitled post'
    const contentHtml = extractTag(block, 'content:encoded')
      || extractTag(block, 'content')
      || extractTag(block, 'summary')
      || extractTag(block, 'description')
      || null
    const body = stripHtml(contentHtml)
    const authorName = firstNonEmpty(
      stripHtml(extractTag(block, 'dc:creator')),
      stripHtml(extractTag(extractTag(block, 'author') || '', 'name')),
      stripHtml(extractTag(block, 'author')),
    )
    const publishedAt = parseDate(
      extractTag(block, 'published')
        || extractTag(block, 'updated')
        || extractTag(block, 'pubDate'),
    )
    const media = parseMedia(block, contentHtml, normalizedFeedUrl)
    const previewUrl = media.previewUrl
    const thumbnailUrl = media.previewUrl
    const domain = getHostname(permalink)
    const identity = guid || permalink || `${title}\n${publishedAt?.toISOString() || ''}\n${index}`
    const rssPostId = buildRssPostId(normalizedFeedUrl, identity)

    return {
      rssPostId,
      feedUrl: normalizedFeedUrl,
      feedTitle: preview.title,
      authorName,
      title,
      body,
      previewUrl,
      thumbnailUrl,
      media: media.items.length > 0 ? JSON.stringify({ items: media.items }) : null,
      domain,
      permalink,
      guid,
      publishedAt,
    }
  }).filter((post): post is GenericRssPostRecord => !!post)

  return { preview, posts }
}

export async function fetchGenericRssFeedPreview(feedUrl: string): Promise<GenericRssFeedPreview> {
  const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
  const response = await fetch(normalizedFeedUrl, {
    headers: RSS_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`RSS request failed (${response.status})`)
  }

  const xml = await response.text()
  const parsed = parseGenericRssFeed(xml, normalizedFeedUrl)

  if (!parsed.preview.title && parsed.posts.length === 0) {
    throw new Error('Feed is not a readable RSS or Atom feed')
  }

  return parsed.preview
}
