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
import shareRouter from './routes/share'
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
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src *; connect-src 'self' https:; font-src 'self' data:",
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

  let appVersion = 'dev'
  try { appVersion = require('/app/package.json').version || 'dev' } catch { try { appVersion = require('../../package.json').version || 'dev' } catch {} }
  app.get('/health', (c) => c.json({ ok: true, version: appVersion }))
  app.get('/version', (c) => c.json({ version: appVersion }))

  // Rate limit only login/register, not /auth/mode or /auth/me
  app.post(
    '/auth/login',
    rateLimiter({ windowMs: 60_000, max: 10, keyPrefix: 'auth-login' }),
  )
  app.post(
    '/auth/register',
    rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'auth-register' }),
  )
  app.use(
    '/x/login',
    rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'x-login' }),
  )

  // Auth routes
  app.route('/auth', authRoutes)

  // Protected routes
  app.use('/feed/*', authMiddleware)
  app.use('/x/*', authMiddleware)
  app.use('/api-keys/*', authMiddleware)
  app.use('/ai/*', authMiddleware)
  app.use('/og/*', authMiddleware)

  // Rate limit AI endpoints
  app.post('/ai/report', rateLimiter({ windowMs: 60_000, max: 3, keyPrefix: 'ai-report' }))
  app.post('/ai/filter', rateLimiter({ windowMs: 60_000, max: 3, keyPrefix: 'ai-filter' }))
  app.post('/ai/regenerate-prompt', rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'ai-regen' }))

  // OG metadata proxy (cached)
  app.get('/og', async (c) => {
    const url = c.req.query('url')
    if (!url) return c.json({ error: 'url required' }, 400)
    // Validate URL scheme to prevent SSRF
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return c.json({ error: 'invalid url' }, 400)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return c.json({ error: 'invalid url scheme' }, 400)
    }
    // Block private/internal IPs
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

  app.route('/feed', feedRouter)
  app.route('/x', xRouter)
  app.route('/api-keys', apiKeysRouter)
  app.route('/ai', aiRouter)

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
