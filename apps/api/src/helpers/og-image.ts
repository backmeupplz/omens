import { Resvg } from '@resvg/resvg-js'
import { resolve } from 'path'
import { existsSync } from 'fs'

// --- Font loading ---
// In dev, import.meta.dir = src/helpers/, fonts at ../../assets/fonts
// When bundled (bun build), import.meta.dir = api/, fonts at assets/fonts
const FONT_DIR = [
  resolve(import.meta.dir, '../../assets/fonts'),
  resolve(import.meta.dir, 'assets/fonts'),
].find((d) => existsSync(resolve(d, 'Inter-Regular.ttf'))) || ''
const HAS_FONTS = FONT_DIR !== ''
const FONT = HAS_FONTS ? 'Inter' : 'sans-serif'

// --- In-memory PNG cache (LRU-ish, max 500 entries) ---

const pngCache = new Map<string, Uint8Array>()
const MAX_CACHE = 500

function cacheGet(key: string): Uint8Array | undefined {
  return pngCache.get(key)
}

function cacheSet(key: string, value: Uint8Array) {
  if (pngCache.size >= MAX_CACHE) {
    const first = pngCache.keys().next().value
    if (first) pngCache.delete(first)
  }
  pngCache.set(key, value)
}

// --- Helpers ---

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

function stripEmoji(s: string): string {
  return s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/\s{2,}/g, ' ').trim()
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  const words = clean.split(' ')
  const lines: string[] = []
  let cur = ''

  for (const word of words) {
    if (lines.length >= maxLines) break
    const next = cur ? `${cur} ${word}` : word
    if (next.length > maxChars && cur) {
      lines.push(cur)
      cur = word.length > maxChars ? truncate(word, maxChars) : word
    } else if (next.length > maxChars) {
      lines.push(truncate(next, maxChars))
      cur = ''
    } else {
      cur = next
    }
  }

  if (cur && lines.length < maxLines) {
    lines.push(cur)
  } else if (cur && lines.length === maxLines) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], maxChars - 1)
  }

  return lines
}

/** Fetch image as data URI. Upgrades Twitter avatar resolution. */
async function fetchImageDataUri(url: string): Promise<string | null> {
  let fetchUrl = url
  if (url.includes('pbs.twimg.com') && url.includes('_normal.')) {
    fetchUrl = url.replace(/_normal\./, '_200x200.')
  }
  try {
    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || 'image/jpeg'
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

interface MediaItem {
  type: 'photo' | 'video' | 'gif'
  url: string
  thumbnail: string
}

function parseMedia(mediaUrls: string | null): MediaItem[] {
  if (!mediaUrls) return []
  try { return JSON.parse(mediaUrls) } catch { return [] }
}

function svgToPng(svg: string): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      fontDirs: HAS_FONTS ? [FONT_DIR] : [],
      loadSystemFonts: true,
      defaultFontFamily: FONT,
      sansSerifFamily: FONT,
    },
  })
  return resvg.render().asPng()
}

// --- Tweet OG Image ---

export interface TweetOgInput {
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  content: string
  mediaUrls: string | null
  publishedAt: Date | string | null
}

export async function generateTweetOgPng(t: TweetOgInput): Promise<Uint8Array> {
  const key = `tweet:${t.tweetId}`
  const cached = cacheGet(key)
  if (cached) return cached

  const F = FONT
  const L = 40

  // Parse media and try to fetch first image
  const media = parseMedia(t.mediaUrls)
  const firstMedia = media.find((m) => m.type === 'photo') || media[0]
  let mediaDataUri: string | null = null
  if (firstMedia) {
    const url = firstMedia.type === 'photo' ? firstMedia.url : firstMedia.thumbnail
    if (url) mediaDataUri = await fetchImageDataUri(url)
  }

  // Fetch avatar
  let avatarDataUri: string | null = null
  if (t.authorAvatar) {
    avatarDataUri = await fetchImageDataUri(t.authorAvatar)
  }

  const hasMedia = !!mediaDataUri
  // When media present: text on left 58%, image on right 42%
  const textR = hasMedia ? 670 : 1160
  const maxChars = hasMedia ? 46 : 80

  // Avatar
  const avatarR = 36
  const avatarCx = L + avatarR
  const avatarCy = 32 + avatarR
  let avatarSvg = ''
  let nameX = L

  if (avatarDataUri) {
    avatarSvg = `<clipPath id="aclip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}"/></clipPath>
    <image x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" href="${avatarDataUri}" clip-path="url(#aclip)"/>`
    nameX = avatarCx + avatarR + 16
  }

  const contentLines = wrapText(stripEmoji(t.content), maxChars, hasMedia ? 7 : 8)
  const date = t.publishedAt
    ? new Date(t.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const sepY = avatarDataUri ? avatarCy + avatarR + 10 : 80
  const contentY0 = sepY + 32
  const lineH = 38

  // Media: right side, full height minus footer
  let mediaSvg = ''
  if (hasMedia) {
    const mx = 690
    const mw = 1200 - mx
    const mh = 570
    mediaSvg = `<clipPath id="mclip"><rect x="${mx}" y="3" width="${mw}" height="${mh}"/></clipPath>
    <image x="${mx}" y="3" width="${mw}" height="${mh}" href="${mediaDataUri}" clip-path="url(#mclip)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${mx}" y="3" width="${mw}" height="${mh}" fill="url(#medge)" opacity="1"/>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="medge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d0d0f" stop-opacity="0.9"/><stop offset="15%" stop-color="#0d0d0f" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0d0d0f"/>
  <rect width="1200" height="3" fill="#10b981"/>

  ${mediaSvg}
  ${avatarSvg}

  <text x="${nameX}" y="${avatarDataUri ? avatarCy - 6 : 50}" font-family="${F}" font-size="28" font-weight="700" fill="#ffffff">${esc(truncate(stripEmoji(t.authorName), hasMedia ? 22 : 35))}</text>
  <text x="${nameX}" y="${avatarDataUri ? avatarCy + 18 : 76}" font-family="${F}" font-size="19" fill="#71717a">@${esc(t.authorHandle)}</text>

  <line x1="${L}" y1="${sepY}" x2="${textR}" y2="${sepY}" stroke="#1e1e22" stroke-width="1"/>

  ${contentLines.map((line, i) => `<text x="${L}" y="${contentY0 + i * lineH}" font-family="${F}" font-size="24" fill="#e4e4e7">${esc(line)}</text>`).join('\n  ')}

  <line x1="${L}" y1="580" x2="1160" y2="580" stroke="#1e1e22" stroke-width="1"/>
  <text x="${L}" y="610" font-family="${F}" font-size="22" font-weight="700" fill="#10b981">omens.online</text>
  <text x="${L + 175}" y="610" font-family="${F}" font-size="18" fill="#52525b">Signal from Noise</text>
  ${date ? `<text x="1160" y="610" font-family="${F}" font-size="18" fill="#3f3f46" text-anchor="end">${esc(date)}</text>` : ''}
</svg>`

  const png = svgToPng(svg)
  cacheSet(key, png)
  return png
}

// --- Report OG Image ---

export interface ReportOgInput {
  id: string
  content: string
  model: string
  tweetCount: number
  createdAt: Date | string
}

function extractReportSummary(content: string) {
  const lines = content.split('\n').filter((l) => l.trim())
  const title = lines.find((l) => l.startsWith('# '))?.replace(/^#+\s*/, '') || 'AI Report'
  const bullets: string[] = []
  for (const line of lines) {
    if (bullets.length >= 5) break
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      bullets.push(truncate(line.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, ''), 75))
    }
  }
  if (bullets.length === 0) {
    for (const line of lines) {
      if (bullets.length >= 4) break
      if (!line.startsWith('#') && line.trim().length > 20) {
        bullets.push(truncate(line.replace(/\*\*/g, ''), 75))
      }
    }
  }
  return { title, bullets }
}

export { extractReportSummary }

export function generateReportOgPng(r: ReportOgInput): Uint8Array {
  const key = `report:${r.id}`
  const cached = cacheGet(key)
  if (cached) return cached

  const F = FONT
  const L = 40
  const R = 1160
  const { title, bullets } = extractReportSummary(r.content)
  const date = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const bulletY0 = 150
  const bulletH = 48

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d0d0f"/>
  <rect width="1200" height="3" fill="#10b981"/>

  <text x="${L}" y="50" font-family="${F}" font-size="16" font-weight="700" fill="#10b981" letter-spacing="1.5">OMENS REPORT</text>
  <text x="${L}" y="100" font-family="${F}" font-size="42" font-weight="700" fill="#ffffff">${esc(truncate(title, 45))}</text>

  <line x1="${L}" y1="118" x2="${R}" y2="118" stroke="#1e1e22" stroke-width="1"/>

  ${bullets.map((b, i) => `<circle cx="${L + 10}" cy="${bulletY0 + i * bulletH}" r="4" fill="#10b981"/>
  <text x="${L + 28}" y="${bulletY0 + 7 + i * bulletH}" font-family="${F}" font-size="24" fill="#d4d4d8">${esc(stripEmoji(b))}</text>`).join('\n  ')}

  <line x1="${L}" y1="580" x2="${R}" y2="580" stroke="#1e1e22" stroke-width="1"/>
  <text x="${L}" y="610" font-family="${F}" font-size="22" font-weight="700" fill="#10b981">omens.online</text>
  <text x="${L + 175}" y="610" font-family="${F}" font-size="18" fill="#52525b">Signal from Noise</text>
  <text x="${R}" y="610" font-family="${F}" font-size="18" fill="#3f3f46" text-anchor="end">${esc(date)}  \u00B7  ${r.tweetCount} posts  \u00B7  ${esc(r.model)}</text>
</svg>`

  const png = svgToPng(svg)
  cacheSet(key, png)
  return png
}
