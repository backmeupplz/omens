import { Hono } from 'hono'
import { and, eq, inArray } from 'drizzle-orm'
import { aiReports, getDb, tweets } from '@omens/db'
import env from '../env'
import {
  extractReportSummary,
  generateReportOgPng,
  generateTweetOgPng,
} from '../helpers/og-image'

// --- Helpers ---

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
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

// === JSON data endpoints (mounted under /api) ===

export const shareDataRouter = new Hono()

shareDataRouter.get('/tweet/:handle/:tweetId', async (c) => {
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

shareDataRouter.get('/report/:id/data', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)
  if (!report) return c.json({ error: 'Report not found' }, 404)
  const tweetRefIds: string[] = report.tweetRefs ? JSON.parse(report.tweetRefs) : []
  const refTweets = tweetRefIds.length > 0
    ? await db.select().from(tweets).where(inArray(tweets.id, tweetRefIds))
    : []
  return c.json({
    report: { id: report.id, content: report.content, model: report.model, tweetCount: report.tweetCount, tweetRefs: tweetRefIds, refTweets, createdAt: report.createdAt },
  })
})

// === Public HTML/OG routes (mounted at root) ===

const shareRouter = new Hono()

// OG image for shared tweets (PNG)
shareRouter.get('/:handle/status/:tweetId/og.png', async (c) => {
  const { handle, tweetId } = c.req.param()
  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db.select().from(tweets)
    .where(and(eq(tweets.authorHandle, handle), eq(tweets.tweetId, tweetId))).limit(1)
  if (!tweet) return c.text('Not found', 404)

  const png = await generateTweetOgPng({
    tweetId: tweet.tweetId,
    authorName: tweet.authorName,
    authorHandle: tweet.authorHandle,
    authorAvatar: tweet.authorAvatar,
    content: tweet.content,
    mediaUrls: tweet.mediaUrls,
    publishedAt: tweet.publishedAt,
  })

  return new Response(Buffer.from(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800',
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
    return ogHtml({
      title: `${tweet.authorName} (@${tweet.authorHandle})`,
      description: truncate(tweet.content, 200),
      url: `${origin()}/${handle}/status/${tweetId}`,
      image: `${origin()}/${handle}/status/${tweetId}/og.png`,
      largeImage: true,
    })
  }

  if (!env.WEB_DIR) return c.redirect(`http://localhost:5173/${handle}/status/${tweetId}`)
})

// Report OG
shareRouter.get('/report/:id/og.png', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)
  if (!report) return c.text('Not found', 404)

  const png = generateReportOgPng({
    id: report.id,
    content: report.content,
    model: report.model,
    tweetCount: report.tweetCount,
    createdAt: report.createdAt,
  })

  return new Response(Buffer.from(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})

shareRouter.get('/report/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)

  if (!report) return c.html('<meta http-equiv="refresh" content="0;url=/">', 404)

  if (isCrawler(c.req.header('user-agent') || '')) {
    const { title, bullets } = extractReportSummary(report.content)
    const description = truncate(bullets.map((b) => `\u2022 ${b}`).join(' ') || report.content.replace(/[#*\n]+/g, ' ').trim(), 200)
    return ogHtml({
      title: `${title} — Omens Report`, description,
      url: `${origin()}/report/${id}`, image: `${origin()}/report/${id}/og.png`, largeImage: true,
    })
  }

  if (!env.WEB_DIR) return c.redirect(`http://localhost:5173/report/${id}`)
})

export default shareRouter
