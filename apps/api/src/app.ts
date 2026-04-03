import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import env from './env'
import { authMiddleware } from './middleware/auth'
import { rateLimiter } from './middleware/ratelimit'
import aiRouter from './routes/ai'
import apiKeysRouter from './routes/apikeys'
import authRoutes from './routes/auth'
import feedRouter from './routes/feed'
import xRouter from './routes/x'
import shareRouter, { shareDataRouter } from './routes/share'
import { fetchOg } from './x/og'

async function securityHeaders(c: Context, next: Next) {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '0')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src *; connect-src 'self'",
  )
}

export function createApp() {
  const app = new Hono()

  app.use('*', logger())
  app.use('*', securityHeaders)
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    }),
  )

  let appVersion = process.env.APP_VERSION || 'dev'
  if (appVersion === 'dev') { try { appVersion = require('/app/package.json').version || 'dev' } catch { try { appVersion = require('../../package.json').version || 'dev' } catch {} } }
  app.get('/health', (c) => c.json({ ok: true, version: appVersion }))
  app.get('/api/health', (c) => c.json({ ok: true, version: appVersion }))
  app.get('/api/version', (c) => c.json({ version: appVersion }))

  // --- All API routes under /api prefix ---
  const apiApp = new Hono()

  // Rate limit only login/register, not /auth/mode or /auth/me
  apiApp.post(
    '/auth/login',
    rateLimiter({ windowMs: 60_000, max: 10, keyPrefix: 'auth-login' }),
  )
  apiApp.post(
    '/auth/register',
    rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'auth-register' }),
  )
  apiApp.use(
    '/x/login',
    rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'x-login' }),
  )

  // Auth routes
  apiApp.route('/auth', authRoutes)

  // Protected routes
  apiApp.use('/feed/*', authMiddleware)
  apiApp.use('/x/*', authMiddleware)
  apiApp.use('/api-keys/*', authMiddleware)
  apiApp.use('/ai/*', authMiddleware)
  apiApp.use('/og/*', authMiddleware)
  apiApp.use('/media/*', authMiddleware)

  // Rate limit AI endpoints
  apiApp.post('/ai/report', rateLimiter({ windowMs: 60_000, max: 3, keyPrefix: 'ai-report' }))
  apiApp.post('/ai/filter', rateLimiter({ windowMs: 60_000, max: 3, keyPrefix: 'ai-filter' }))
  apiApp.post('/ai/regenerate-prompt', rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'ai-regen' }))

  // OG metadata proxy (cached)
  apiApp.get('/og', async (c) => {
    const url = c.req.query('url')
    if (!url) return c.json({ error: 'url required' }, 400)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return c.json({ error: 'invalid url' }, 400)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return c.json({ error: 'invalid url scheme' }, 400)
    }
    const host = parsed.hostname
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('172.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return c.json({ error: 'url not allowed' }, 400)
    }
    const data = await fetchOg(url)
    if (!data) return c.json(null)
    return c.json(data)
  })

  // Video proxy
  apiApp.get('/media/video', async (c) => {
    const url = c.req.query('url')
    if (!url) return c.json({ error: 'url required' }, 400)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return c.json({ error: 'invalid url' }, 400)
    }
    if (parsed.hostname !== 'video.twimg.com') {
      return c.json({ error: 'only video.twimg.com allowed' }, 400)
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      Referer: 'https://x.com/',
    }
    const range = c.req.header('Range')
    if (range) headers['Range'] = range

    const upstream = await fetch(url, { headers })
    const ct = upstream.headers.get('Content-Type') || 'video/mp4'
    const cl = upstream.headers.get('Content-Length')
    const cr = upstream.headers.get('Content-Range')
    const ar = upstream.headers.get('Accept-Ranges')

    const resHeaders: Record<string, string> = { 'Content-Type': ct }
    if (cl) resHeaders['Content-Length'] = cl
    if (cr) resHeaders['Content-Range'] = cr
    if (ar) resHeaders['Accept-Ranges'] = ar

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    })
  })

  // Avatar proxy (public — used on share pages too)
  apiApp.get('/avatar', async (c) => {
    const url = c.req.query('url')
    if (!url) return c.json({ error: 'url required' }, 400)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return c.json({ error: 'invalid url' }, 400)
    }
    if (parsed.hostname !== 'pbs.twimg.com') {
      return c.json({ error: 'only pbs.twimg.com allowed' }, 400)
    }

    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Referer: 'https://x.com/',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!upstream.ok) return new Response(null, { status: upstream.status })

    const ct = upstream.headers.get('Content-Type') || 'image/jpeg'
    const cl = upstream.headers.get('Content-Length')
    const resHeaders: Record<string, string> = {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=604800',
    }
    if (cl) resHeaders['Content-Length'] = cl

    return new Response(upstream.body, { status: 200, headers: resHeaders })
  })

  apiApp.route('/feed', feedRouter)
  apiApp.route('/x', xRouter)
  apiApp.route('/api-keys', apiKeysRouter)
  apiApp.route('/ai', aiRouter)

  // Share data endpoints (public JSON, no auth)
  apiApp.route('/', shareDataRouter)

  // Mount all API routes under /api
  app.route('/api', apiApp)

  // Public share routes (no auth) — must be before static fallback
  app.route('/', shareRouter)

  // Serve frontend static files (in prod the built SPA is at WEB_DIR)
  const webDir = env.WEB_DIR
  if (webDir) {
    app.use('/*', serveStatic({ root: webDir }))
    app.get('*', serveStatic({ root: webDir, path: '/index.html' }))
  }

  return app
}
