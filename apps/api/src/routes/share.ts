import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { aiReports, articles, getDb, tweets } from '@omens/db'
import env from '../env'
import { readFileSync } from 'fs'
import { join } from 'path'
import { hydrateReport } from '../helpers/report'
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

function origin(): string { return env.CORS_ORIGIN || 'https://omens.online' }

let _spaHtml: string | null = null
function getSpaHtml(): string {
  if (!_spaHtml && env.WEB_DIR) {
    _spaHtml = readFileSync(join(env.WEB_DIR, 'index.html'), 'utf-8')
  }
  return _spaHtml || ''
}

function ogTags(meta: { title: string; description: string; url: string; image?: string; largeImage?: boolean }): string {
  const img = meta.image
    ? `<meta property="og:image" itemprop="image" content="${esc(meta.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta name="twitter:image" content="${esc(meta.image)}">`
    : ''
  return `<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="article"><meta property="og:url" content="${esc(meta.url)}">${img}
<meta name="twitter:card" content="${meta.largeImage ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(meta.title)}"><meta name="twitter:description" content="${esc(meta.description)}">`
}

function notFoundHtml(): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>Not Found — Omens</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #09090b; color: #a1a1aa; font-family: ui-monospace, monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .wrap { text-align: center; }
  pre { font-size: 1.1rem; line-height: 1.4; color: #52525b; }
  h1 { font-size: 1.25rem; margin: 1.5rem 0 0.5rem; color: #e4e4e7; font-weight: 600; }
  p { margin-bottom: 1.5rem; }
  a { display: inline-block; padding: 0.5rem 1.5rem; background: #27272a; color: #e4e4e7; text-decoration: none; border-radius: 0.5rem; font-size: 0.875rem; transition: background 0.15s; }
  a:hover { background: #3f3f46; }
</style></head><body><div class="wrap">
<pre>
  /\\_/\\
 ( x.x )
  > ~ <
 /|   |\\
(_|   |_)
</pre>
<h1>404</h1>
<p>This page doesn't exist</p>
<a href="/">Go to Omens</a>
</div></body></html>`
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function spaWithOg(meta: { title: string; description: string; url: string; image?: string; largeImage?: boolean }): Response {
  const tags = ogTags(meta)
  const titleTag = `<title>${esc(meta.title)} — Omens</title>`
  const html = getSpaHtml()
    .replace(/<meta\s+(property="og:|name="twitter:)[^>]*>\s*/g, '')
    .replace(/<title>[^<]*<\/title>/, `${titleTag}\n${tags}`)
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// === JSON data endpoints (mounted under /api) ===

export const shareDataRouter = new Hono()

shareDataRouter.get('/tweet/:handle/:tweetId', async (c) => {
  const tweetId = c.req.param('tweetId')
  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db.select().from(tweets)
    .where(eq(tweets.tweetId, tweetId)).limit(1)
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

shareDataRouter.get('/article/:tweetId', async (c) => {
  const tweetId = c.req.param('tweetId')
  if (!/^\d+$/.test(tweetId)) return c.json({ error: 'Invalid tweet ID' }, 400)
  const db = getDb(env.DATABASE_URL)
  const [article] = await db.select().from(articles).where(eq(articles.tweetId, tweetId)).limit(1)
  if (!article) return c.json({ error: 'Article not found' }, 404)
  return c.json({
    article: {
      title: article.title,
      coverImage: article.coverImage,
      body: article.body,
      richContent: article.richContent ? JSON.parse(article.richContent) : null,
      authorName: article.authorName,
      authorHandle: article.authorHandle,
      authorAvatar: article.authorAvatar,
    },
  })
})

shareDataRouter.get('/report/:id/data', async (c) => {
  const id = c.req.param('id')
  const db = getDb(env.DATABASE_URL)
  const [report] = await db.select().from(aiReports).where(eq(aiReports.id, id)).limit(1)
  if (!report) return c.json({ error: 'Report not found' }, 404)
  return c.json({ report: await hydrateReport(db, report) })
})

// === Public HTML/OG routes (mounted at root) ===

const shareRouter = new Hono()

// OG image for shared tweets (PNG)
shareRouter.get('/:handle/status/:tweetId/og.png', async (c) => {
  const tweetId = c.req.param('tweetId')
  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db.select().from(tweets)
    .where(eq(tweets.tweetId, tweetId)).limit(1)
  if (!tweet) return c.text('Not found', 404)

  const png = await generateTweetOgPng({
    tweetId: tweet.tweetId,
    authorName: tweet.authorName,
    authorHandle: tweet.authorHandle,
    authorAvatar: tweet.authorAvatar,
    content: tweet.content,
    mediaUrls: tweet.mediaUrls,
    card: tweet.card,
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
  const handle = c.req.param('handle')
  const tweetId = c.req.param('tweetId')
  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db.select().from(tweets)
    .where(eq(tweets.tweetId, tweetId)).limit(1)

  if (!tweet) return notFoundHtml()

  const meta = {
    title: `${tweet.authorName} (@${tweet.authorHandle})`,
    description: truncate((() => {
      let text = tweet.content || ''
      if (!text) { try { const c = tweet.card ? JSON.parse(tweet.card) : null; text = [c?.title, c?.description].filter(Boolean).join(' — ') } catch {} }
      if (tweet.quotedTweet) { try { const qt = JSON.parse(tweet.quotedTweet); if (qt.content) text += ` | QT @${qt.authorHandle}: ${qt.content}` } catch {} }
      return text
    })(), 200),
    url: `${origin()}/${handle}/status/${tweetId}`,
    image: `${origin()}/${handle}/status/${tweetId}/og.png`,
    largeImage: true,
  }

  if (!env.WEB_DIR) return c.redirect(`http://localhost:5173/${handle}/status/${tweetId}`)

  return spaWithOg(meta)
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

  if (!report) return notFoundHtml()

  const { title, bullets } = extractReportSummary(report.content)
  const description = truncate(bullets.map((b) => `\u2022 ${b}`).join(' ') || report.content.replace(/\[\[tweet:[^\]]+\]\]/g, '').replace(/[#*\n]+/g, ' ').trim(), 200)
  const meta = {
    title: `${title} — Omens Report`, description,
    url: `${origin()}/report/${id}`, image: `${origin()}/report/${id}/og.png`, largeImage: true,
  }

  if (!env.WEB_DIR) return c.redirect(`http://localhost:5173/report/${id}`)

  return spaWithOg(meta)
})

export default shareRouter
