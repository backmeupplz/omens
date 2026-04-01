import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { aiReports, getDb, tweets } from '@omens/db'
import env from '../env'

const shareRouter = new Hono()

// --- Helpers ---

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|TelegramBot|WhatsApp|Slack|preview/i

function isCrawler(ua: string): boolean { return BOT_UA.test(ua) }

function origin(): string { return env.CORS_ORIGIN || 'https://omens.online' }

function ogHtml(meta: { title: string; description: string; url: string; image?: string; largeImage?: boolean }): Response {
  const img = meta.image ? `<meta property="og:image" content="${esc(meta.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${esc(meta.image)}">` : ''
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="article"><meta property="og:url" content="${esc(meta.url)}">${img}
<meta name="twitter:card" content="${meta.largeImage ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(meta.title)}"><meta name="twitter:description" content="${esc(meta.description)}">
<title>${esc(meta.title)} — Omens</title></head><body><p>${esc(meta.description)}</p></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/** Extract report title + bullet points for OG display */
function extractReportSummary(content: string) {
  const lines = content.split('\n').filter((l) => l.trim())
  const title = lines.find((l) => l.startsWith('# '))?.replace(/^#+\s*/, '') || 'AI Report'
  const bullets: string[] = []
  for (const line of lines) {
    if (bullets.length >= 5) break
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      bullets.push(truncate(line.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, ''), 70))
    }
  }
  if (bullets.length === 0) {
    for (const line of lines) {
      if (bullets.length >= 4) break
      if (!line.startsWith('#') && line.trim().length > 20) {
        bullets.push(truncate(line.replace(/\*\*/g, ''), 70))
      }
    }
  }
  return { title, bullets }
}

// --- Tweet sharing ---

shareRouter.get('/tweet/:handle/:tweetId', async (c) => {
  const { handle, tweetId } = c.req.param()
  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db.select().from(tweets)
    .where(and(eq(tweets.authorHandle, handle), eq(tweets.tweetId, tweetId))).limit(1)
  if (!tweet) return c.json({ error: 'Tweet not found' }, 404)
  return c.json({
    tweet: {
      tweetId: tweet.tweetId, authorName: tweet.authorName, authorHandle: tweet.authorHandle,
      authorAvatar: tweet.authorAvatar, authorFollowers: tweet.authorFollowers, content: tweet.content,
      mediaUrls: tweet.mediaUrls, quotedTweet: tweet.quotedTweet, card: tweet.card, url: tweet.url,
      likes: tweet.likes, retweets: tweet.retweets, replies: tweet.replies, views: tweet.views,
      publishedAt: tweet.publishedAt?.toISOString() || null,
    },
  })
})

shareRouter.get('/:handle/status/:tweetId', async (c) => {
  const { handle, tweetId } = c.req.param()
  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db.select().from(tweets)
    .where(and(eq(tweets.authorHandle, handle), eq(tweets.tweetId, tweetId))).limit(1)

  if (!tweet) return c.html('<meta http-equiv="refresh" content="0;url=/">', 404)

  if (isCrawler(c.req.header('user-agent') || '')) {
    let media: Array<{ url: string; type: string }> = []
    try { if (tweet.mediaUrls) media = JSON.parse(tweet.mediaUrls) } catch {}
    const firstPhoto = media.find((m) => m.type === 'photo')
    return ogHtml({
      title: `${tweet.authorName} (@${tweet.authorHandle})`,
      description: truncate(tweet.content, 200),
      url: `${origin()}/${handle}/status/${tweetId}`,
      image: firstPhoto?.url || tweet.authorAvatar || undefined,
      largeImage: !!firstPhoto,
    })
  }

  if (process.env.NODE_ENV !== 'production') return c.redirect(`http://localhost:5173/${handle}/status/${tweetId}`)
})

// --- Report sharing ---

shareRouter.get('/report/:id/data', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)
  if (!report) return c.json({ error: 'Report not found' }, 404)
  return c.json({
    report: { id: report.id, content: report.content, model: report.model, tweetCount: report.tweetCount, createdAt: report.createdAt },
  })
})

shareRouter.get('/report/:id/og.png', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)
  if (!report) return c.text('Not found', 404)

  const { title, bullets } = extractReportSummary(report.content)
  const date = new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#09090b"/><stop offset="100%" stop-color="#18181b"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="50" width="1080" height="530" rx="24" fill="#18181b" stroke="#27272a" stroke-width="2"/>
  <text x="100" y="120" font-family="system-ui,-apple-system,sans-serif" font-size="42" font-weight="700" fill="#f4f4f5">${esc(truncate(title, 45))}</text>
  <line x1="100" y1="145" x2="1100" y2="145" stroke="#3f3f46" stroke-width="1"/>
  ${bullets.map((b, i) => `<text x="120" y="${190 + i * 52}" font-family="system-ui,-apple-system,sans-serif" font-size="26" fill="#a1a1aa">• ${esc(b)}</text>`).join('\n  ')}
  <text x="100" y="540" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="#52525b">${date} · ${report.tweetCount} posts analyzed · ${esc(report.model)}</text>
  <text x="1100" y="540" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="700" fill="#10b981" text-anchor="end">Omens</text>
</svg>`

  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } })
})

shareRouter.get('/report/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)

  if (!report) return c.html('<meta http-equiv="refresh" content="0;url=/">', 404)

  if (isCrawler(c.req.header('user-agent') || '')) {
    const { title, bullets } = extractReportSummary(report.content)
    const description = truncate(bullets.map((b) => `• ${b}`).join(' ') || report.content.replace(/[#*\n]+/g, ' ').trim(), 200)
    return ogHtml({
      title: `${title} — Omens Report`, description,
      url: `${origin()}/report/${id}`, image: `${origin()}/report/${id}/og.png`, largeImage: true,
    })
  }

  if (process.env.NODE_ENV !== 'production') return c.redirect(`http://localhost:5173/report/${id}`)
})

export default shareRouter
