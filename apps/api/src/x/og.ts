/**
 * OG metadata proxy with DB caching.
 * Each URL is fetched exactly once.
 */

import { eq } from 'drizzle-orm'
import { getDb, ogCache } from '@omens/db'
import env from '../env'

export interface OgData {
  title: string | null
  description: string | null
  thumbnail: string | null
  domain: string
  url: string
}

type OgCacheRow = typeof ogCache.$inferSelect

function decodeEntities(value: string | null | undefined): string | null {
  if (!value) return null
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
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
      default: return match
    }
  })
}

function cacheRowToOgData(cached: OgCacheRow): OgData {
  return {
    title: decodeEntities(cached.title),
    description: decodeEntities(cached.description),
    thumbnail: decodeEntities(cached.thumbnail),
    domain: cached.domain,
    url: cached.url,
  }
}

function extractOgTags(html: string): Partial<OgData> {
  const get = (property: string): string | null => {
    const expected = property.toLowerCase()
    for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
      const attrs: Record<string, string> = {}
      for (const attr of tag[0].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        attrs[attr[1].toLowerCase()] = attr[2] || attr[3] || attr[4] || ''
      }
      const key = attrs.property?.toLowerCase() || attrs.name?.toLowerCase()
      if (key === expected) return attrs.content || null
    }
    return null
  }

  const title =
    get('og:title') ||
    get('twitter:title') ||
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
    null
  const description = get('og:description') || get('twitter:description')
  const thumbnail = get('og:image') || get('twitter:image') || get('twitter:image:src')

  return { title, description, thumbnail }
}

export async function fetchOg(requestUrl: string): Promise<OgData | null> {
  const db = getDb(env.DATABASE_URL)

  // Check cache by original URL
  const [cached] = await db
    .select()
    .from(ogCache)
    .where(eq(ogCache.originalUrl, requestUrl))
    .limit(1)

  if (cached) {
    if (cached.title && cached.thumbnail) return cacheRowToOgData(cached)
  }

  // Also check by resolved URL (in case same destination was cached from different short URL)
  try {
    const res = await fetch(requestUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Omens/1.0)',
        Accept: 'text/html',
      },
    })

    if (!res.ok) {
      if (cached) {
        await db.update(ogCache)
          .set({ fetchedAt: new Date() })
          .where(eq(ogCache.originalUrl, requestUrl))
        return cached.title ? cacheRowToOgData(cached) : null
      }
      await db.insert(ogCache).values({
        url: requestUrl,
        originalUrl: requestUrl,
        domain: '',
        fetchedAt: new Date(),
      }).onConflictDoNothing()
      return null
    }

    const finalUrl = res.url
    const domain = new URL(finalUrl).hostname.replace(/^www\./, '')

    // Read first 50KB
    const reader = res.body?.getReader()
    if (!reader) return null

    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 50000) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    reader.cancel()

    const og = extractOgTags(html)
    const normalizedTitle = decodeEntities(og.title)
    const normalizedDescription = decodeEntities(og.description)
    const normalizedThumbnail = decodeEntities(og.thumbnail)

    // Cache result
    if (cached) {
      await db.update(ogCache)
        .set({
          url: finalUrl,
          title: normalizedTitle,
          description: normalizedDescription,
          thumbnail: normalizedThumbnail,
          domain,
          fetchedAt: new Date(),
        })
        .where(eq(ogCache.originalUrl, requestUrl))
    } else {
      await db
        .insert(ogCache)
        .values({
          url: finalUrl,
          originalUrl: requestUrl,
          title: normalizedTitle,
          description: normalizedDescription,
          thumbnail: normalizedThumbnail,
          domain,
          fetchedAt: new Date(),
        })
        .onConflictDoNothing()
    }

    if (!normalizedTitle) return cached?.title ? cacheRowToOgData(cached) : null

    return {
      title: normalizedTitle,
      description: normalizedDescription,
      thumbnail: normalizedThumbnail,
      domain,
      url: finalUrl,
    }
  } catch {
    if (cached) {
      await db.update(ogCache)
        .set({ fetchedAt: new Date() })
        .where(eq(ogCache.originalUrl, requestUrl))
      return cached.title ? cacheRowToOgData(cached) : null
    }
    await db.insert(ogCache).values({
      url: requestUrl,
      originalUrl: requestUrl,
      domain: '',
      fetchedAt: new Date(),
    }).onConflictDoNothing()
    return null
  }
}
