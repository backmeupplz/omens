import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { getDb, tweets } from '@omens/db'
import env from '../env'

const shareRouter = new Hono()

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Public JSON endpoint for tweet data
shareRouter.get('/tweet/:handle/:tweetId', async (c) => {
  const { handle, tweetId } = c.req.param()
  const db = getDb(env.DATABASE_URL)

  const [tweet] = await db
    .select()
    .from(tweets)
    .where(and(eq(tweets.authorHandle, handle), eq(tweets.tweetId, tweetId)))
    .limit(1)

  if (!tweet) return c.json({ error: 'Tweet not found' }, 404)

  return c.json({
    tweet: {
      tweetId: tweet.tweetId,
      authorName: tweet.authorName,
      authorHandle: tweet.authorHandle,
      authorAvatar: tweet.authorAvatar,
      authorFollowers: tweet.authorFollowers,
      content: tweet.content,
      mediaUrls: tweet.mediaUrls,
      quotedTweet: tweet.quotedTweet,
      card: tweet.card,
      url: tweet.url,
      likes: tweet.likes,
      retweets: tweet.retweets,
      replies: tweet.replies,
      views: tweet.views,
      publishedAt: tweet.publishedAt?.toISOString() || null,
    },
  })
})

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|TelegramBot|WhatsApp|Slack|preview/i

// Share page: OG for crawlers, SPA redirect for browsers
shareRouter.get('/:handle/status/:tweetId', async (c) => {
  const { handle, tweetId } = c.req.param()
  const ua = c.req.header('user-agent') || ''

  const db = getDb(env.DATABASE_URL)
  const [tweet] = await db
    .select()
    .from(tweets)
    .where(and(eq(tweets.authorHandle, handle), eq(tweets.tweetId, tweetId)))
    .limit(1)

  if (!tweet) {
    return c.html('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Not found</body></html>', 404)
  }

  const title = `${tweet.authorName} (@${tweet.authorHandle})`
  const description = truncate(tweet.content, 200)

  // Pick the best OG image: first photo > author avatar > none
  let media: Array<{ url: string; type: string }> = []
  try { if (tweet.mediaUrls) media = JSON.parse(tweet.mediaUrls) } catch {}
  const firstPhoto = media.find((m) => m.type === 'photo')
  const ogImage = firstPhoto?.url || tweet.authorAvatar || ''

  // For bot crawlers, serve a minimal HTML with OG tags
  if (BOT_UA.test(ua)) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(`${env.CORS_ORIGIN || 'https://omens.online'}/${handle}/status/${tweetId}`)}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
<meta name="twitter:card" content="${firstPhoto ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : ''}
<title>${escapeHtml(title)} — Omens</title>
</head>
<body>
<p>${escapeHtml(tweet.content)}</p>
</body>
</html>`
    return c.html(html)
  }

  // For browsers in production, let the SPA handle it (serveStatic will catch it)
  // In dev, redirect to the Vite dev server
  if (process.env.NODE_ENV !== 'production') {
    return c.redirect(`http://localhost:5173/${handle}/status/${tweetId}`)
  }

  // In production, fall through to serveStatic (index.html)
  return
})

export default shareRouter
