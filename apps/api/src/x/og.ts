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

function extractOgTags(html: string): Partial<OgData> {
  const get = (property: string): string | null => {
    const re = new RegExp(
      `<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']*?)["']`,
      'i',
    )
    const m = html.match(re)
    if (m) return m[1]
    const re2 = new RegExp(
      `<meta\\s+content=["']([^"']*?)["']\\s+(?:property|name)=["']${property}["']`,
      'i',
    )
    const m2 = html.match(re2)
    return m2 ? m2[1] : null
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
    if (!cached.title) return null // Previously checked, no OG data
    return {
      title: cached.title,
      description: cached.description,
      thumbnail: cached.thumbnail,
      domain: cached.domain,
      url: cached.url,
    }
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
      // Cache the miss
      await db.insert(ogCache).values({
        url: requestUrl,
        originalUrl: requestUrl,
        domain: '',
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

    // Cache result
    await db
      .insert(ogCache)
      .values({
        url: finalUrl,
        originalUrl: requestUrl,
        title: og.title || null,
        description: og.description || null,
        thumbnail: og.thumbnail || null,
        domain,
      })
      .onConflictDoNothing()

    if (!og.title) return null

    return {
      title: og.title,
      description: og.description || null,
      thumbnail: og.thumbnail || null,
      domain,
      url: finalUrl,
    }
  } catch {
    // Cache the failure
    await db.insert(ogCache).values({
      url: requestUrl,
      originalUrl: requestUrl,
      domain: '',
    }).onConflictDoNothing()
    return null
  }
}
