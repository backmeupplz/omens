export type TelegramMediaItem = {
  type: 'photo' | 'video' | 'gif'
  url: string
  thumbnail: string
}

export type TelegramFileItem = {
  url: string
  fileName: string
  fileSizeLabel: string | null
}

export type TelegramPostRecord = {
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

export type TelegramChannelPage = {
  channelUsername: string
  channelTitle: string | null
  posts: TelegramPostRecord[]
  newestMessageId: number | null
  oldestMessageId: number | null
}

const TELEGRAM_PUBLIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) return ''

  let current = value
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity[0] === '#') {
        const isHex = entity[1]?.toLowerCase() === 'x'
        const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }

      switch (entity) {
        case 'amp': return '&'
        case 'lt': return '<'
        case 'gt': return '>'
        case 'quot': return '"'
        case 'apos': return '\''
        case 'nbsp': return ' '
        case '#39': return '\''
        default: return match
      }
    })

    if (next === current) break
    current = next
  }

  return current
}

function stripHtml(value: string | null | undefined) {
  if (!value) return null

  const cleaned = decodeHtmlEntities(value)
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

  return cleaned || null
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const normalized = new URL(decodeHtmlEntities(value), 'https://t.me')
    if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') return null
    return normalized.toString()
  } catch {
    return null
  }
}

function getHostname(url: string | null | undefined) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

function isTelegramInternalUrl(url: string | null | undefined) {
  const hostname = getHostname(url)
  return hostname === 't.me' || hostname === 'telegram.me' || hostname === 'telegram.dog' || hostname === 'telegram.org'
}

function parseCompactCount(value: string | null | undefined) {
  if (!value) return 0
  const cleaned = decodeHtmlEntities(value).replace(/,/g, '').trim().toUpperCase()
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([KMB])?$/)
  if (!match) return Number.parseInt(cleaned.replace(/[^\d]/g, ''), 10) || 0

  const base = Number.parseFloat(match[1] || '0')
  const suffix = match[2]
  if (suffix === 'K') return Math.round(base * 1_000)
  if (suffix === 'M') return Math.round(base * 1_000_000)
  if (suffix === 'B') return Math.round(base * 1_000_000_000)
  return Math.round(base)
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const unique = new Set<string>()
  const items: string[] = []
  for (const value of values) {
    if (!value || unique.has(value)) continue
    unique.add(value)
    items.push(value)
  }
  return items
}

function normalizeTelegramChannelPath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Telegram channel is required')

  let candidate = trimmed

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (!/(^|\.)t\.me$/i.test(url.hostname)) {
      throw new Error('Only public t.me channel links are supported')
    }
    const parts = url.pathname.split('/').filter(Boolean)
    candidate = parts[0] === 's' ? parts[1] || '' : parts[0] || ''
  } catch {
    candidate = trimmed
  }

  candidate = candidate.replace(/^@/, '').replace(/^s\//i, '').replace(/^\/+|\/+$/g, '')
  if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(candidate)) {
    throw new Error('Invalid Telegram public channel username')
  }

  return candidate.toLowerCase()
}

export function normalizeTelegramChannelUsername(value: string) {
  return normalizeTelegramChannelPath(value)
}

function extractTextBlock(block: string) {
  const match = block.match(/<div class="tgme_widget_message_text(?:\s+js-message_text)?[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  return match?.[1] || null
}

function extractMessageHrefCandidates(block: string, textHtml: string | null) {
  const candidates = uniqueStrings([
    ...(textHtml ? [...textHtml.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((match) => normalizeUrl(match[1])) : []),
    ...[...block.matchAll(/<a\b[^>]*class="[^"]*tgme_widget_message_link_preview[^"]*"[^>]*href="([^"]+)"/gi)]
      .map((match) => normalizeUrl(match[1])),
  ])

  return candidates.filter((url) => url && !isTelegramInternalUrl(url))
}

function extractPreviewImage(block: string) {
  const match = block.match(/tgme_widget_message_link_preview_image[^>]*style="[^"]*url\(['"]?([^'")]+)['"]?\)/i)
  return normalizeUrl(match?.[1] || null)
}

function parseMedia(block: string) {
  const mediaItems: TelegramMediaItem[] = []
  const fileItems: TelegramFileItem[] = []
  const seen = new Set<string>()

  const pushMedia = (item: TelegramMediaItem | null) => {
    if (!item) return
    const key = `${item.type}:${item.url}`
    if (seen.has(key)) return
    seen.add(key)
    mediaItems.push(item)
  }

  const pushFile = (item: TelegramFileItem | null) => {
    if (!item) return
    const key = `file:${item.url}`
    if (seen.has(key)) return
    seen.add(key)
    fileItems.push(item)
  }

  for (const match of block.matchAll(/tgme_widget_message_photo_wrap[^>]*style="[^"]*url\(['"]?([^'")]+)['"]?\)/gi)) {
    const url = normalizeUrl(match[1])
    if (url) pushMedia({ type: 'photo', url, thumbnail: url })
  }

  for (const match of block.matchAll(/tgme_widget_message_grouped_wrap[^>]*style="[^"]*url\(['"]?([^'")]+)['"]?\)/gi)) {
    const url = normalizeUrl(match[1])
    if (url) pushMedia({ type: 'photo', url, thumbnail: url })
  }

  for (const match of block.matchAll(/<video[^>]*class="[^"]*tgme_widget_message_video[^"]*"[^>]*poster="([^"]+)"[^>]*>([\s\S]*?)<\/video>/gi)) {
    const poster = normalizeUrl(match[1])
    const source = normalizeUrl(match[2]?.match(/<source[^>]*src="([^"]+)"/i)?.[1] || null)
      || normalizeUrl(match[0].match(/\ssrc="([^"]+)"/i)?.[1] || null)
    if (!source) continue
    const itemType = /\.gif/i.test(source) ? 'gif' : 'video'
    pushMedia({ type: itemType, url: source, thumbnail: poster || source })
  }

  for (const match of block.matchAll(/<a[^>]*class="[^"]*tgme_widget_message_document_wrap[^"]*"[^>]*href="([^"]+)"[\s\S]*?<div class="tgme_widget_message_document_title[^"]*"[^>]*>([\s\S]*?)<\/div>(?:[\s\S]*?<div class="tgme_widget_message_document_extra[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi)) {
    const url = normalizeUrl(match[1])
    const fileName = stripHtml(match[2]) || 'Attachment'
    const fileSizeLabel = stripHtml(match[3]) || null
    if (url) pushFile({ url, fileName, fileSizeLabel })
  }

  const previewUrl = mediaItems[0]?.thumbnail || null
  return {
    mediaItems,
    fileItems,
    previewUrl,
  }
}

function detectPostType(content: string | null, mediaItems: TelegramMediaItem[], fileItems: TelegramFileItem[], linkUrl: string | null) {
  if (mediaItems.some((item) => item.type === 'video' || item.type === 'gif')) return 'video'
  if (mediaItems.length > 0) return mediaItems.length > 1 ? 'album' : 'photo'
  if (fileItems.length > 0) return 'file'
  if (linkUrl) return 'link'
  if (content) return 'text'
  return null
}

function extractChannelTitle(html: string) {
  return stripHtml(
    html.match(/<div class="tgme_channel_info_header_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || html.match(/<div class="tgme_page_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || null,
  )
}

function findMessageBlockStarts(html: string) {
  return [...html.matchAll(/<div class="tgme_widget_message\b[\s\S]*?data-post="[^"]+"/g)].map((match) => match.index || 0)
}

function parseMessageBlock(block: string, pageChannelTitle: string | null): TelegramPostRecord | null {
  const identity = block.match(/data-post="([^"\/]+)\/(\d+)"/i)
  if (!identity) return null

  const channelUsername = identity[1]!.toLowerCase()
  const messageId = Number.parseInt(identity[2] || '', 10)
  if (!Number.isFinite(messageId)) return null

  const permalink = normalizeUrl(
    block.match(/<a[^>]*class="tgme_widget_message_date"[^>]*href="([^"]+)"/i)?.[1]
    || `https://t.me/${channelUsername}/${messageId}`,
  )
  if (!permalink) return null

  const publishedAtRaw = block.match(/<time[^>]*datetime="([^"]+)"/i)?.[1] || null
  const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null
  const textHtml = extractTextBlock(block)
  const content = stripHtml(textHtml)
  const hrefCandidates = extractMessageHrefCandidates(block, textHtml)
  const linkUrl = hrefCandidates[0] || null
  const domain = getHostname(linkUrl)
  const media = parseMedia(block)
  const previewImage = extractPreviewImage(block)
  const previewUrl = media.previewUrl || previewImage
  const viewCount = parseCompactCount(stripHtml(block.match(/tgme_widget_message_views[^>]*>([\s\S]*?)<\/span>/i)?.[1] || null))
  const mediaPayload = media.mediaItems.length > 0 || media.fileItems.length > 0
    ? JSON.stringify({
        items: media.mediaItems,
        files: media.fileItems,
      })
    : null
  const channelTitle = pageChannelTitle
    || stripHtml(block.match(/tgme_widget_message_author[^>]*>([\s\S]*?)<\/a>/i)?.[1] || null)
    || `@${channelUsername}`

  return {
    telegramPostId: `${channelUsername}/${messageId}`,
    channelUsername,
    channelTitle,
    messageId,
    content,
    media: mediaPayload,
    previewUrl,
    thumbnailUrl: previewUrl,
    domain,
    linkUrl,
    permalink,
    viewCount,
    postType: detectPostType(content, media.mediaItems, media.fileItems, linkUrl),
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  }
}

export async function fetchTelegramChannelPage(channelUsername: string, beforeMessageId?: number | null): Promise<TelegramChannelPage> {
  const normalizedUsername = normalizeTelegramChannelUsername(channelUsername)
  const url = new URL(`https://t.me/s/${normalizedUsername}`)
  if (beforeMessageId && Number.isFinite(beforeMessageId)) {
    url.searchParams.set('before', String(beforeMessageId))
  }

  const response = await fetch(url.toString(), {
    headers: TELEGRAM_PUBLIC_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Telegram request failed (${response.status})`)
  }

  const html = await response.text()
  const channelTitle = extractChannelTitle(html)
  const starts = findMessageBlockStarts(html)
  const posts: TelegramPostRecord[] = []

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]!
    const end = starts[index + 1] ?? html.length
    const block = html.slice(start, end)
    const parsed = parseMessageBlock(block, channelTitle)
    if (parsed) posts.push(parsed)
  }

  if (!channelTitle && posts.length === 0) {
    throw new Error('Telegram public channel was not found or is not publicly readable')
  }

  return {
    channelUsername: normalizedUsername,
    channelTitle,
    posts,
    newestMessageId: posts[0]?.messageId || null,
    oldestMessageId: posts.length > 0 ? posts[posts.length - 1]!.messageId : null,
  }
}

export async function fetchTelegramChannelPreview(channelUsername: string) {
  const page = await fetchTelegramChannelPage(channelUsername)
  return {
    channelUsername: page.channelUsername,
    channelTitle: page.channelTitle,
    siteUrl: `https://t.me/${page.channelUsername}`,
  }
}

export async function fetchTelegramChannelPosts(params: {
  channelUsername: string
  stopAtMessageId?: number | null
  maxPages?: number
}) {
  const maxPages = Math.max(1, params.maxPages ?? 10)
  const stopAtMessageId = params.stopAtMessageId && params.stopAtMessageId > 0 ? params.stopAtMessageId : null
  const collected: TelegramPostRecord[] = []
  const seenIds = new Set<number>()
  let beforeMessageId: number | null = null
  let channelTitle: string | null = null
  let newestMessageId: number | null = null
  let oldestMessageId: number | null = null
  let reachedStop = false

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchTelegramChannelPage(params.channelUsername, beforeMessageId)
    channelTitle = channelTitle || page.channelTitle
    newestMessageId = newestMessageId || page.newestMessageId
    oldestMessageId = page.oldestMessageId

    if (page.posts.length === 0) break

    for (const post of page.posts) {
      if (stopAtMessageId != null && post.messageId <= stopAtMessageId) {
        reachedStop = true
        break
      }
      if (seenIds.has(post.messageId)) continue
      seenIds.add(post.messageId)
      collected.push(post)
    }

    if (reachedStop || stopAtMessageId == null || !page.oldestMessageId) break
    beforeMessageId = page.oldestMessageId
  }

  return {
    channelUsername: normalizeTelegramChannelUsername(params.channelUsername),
    channelTitle,
    posts: collected,
    newestMessageId,
    oldestMessageId,
  }
}
