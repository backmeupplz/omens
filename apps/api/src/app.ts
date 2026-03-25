import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { authMiddleware } from './middleware/auth'
import authRoutes from './routes/auth'
import sourcesRouter from './routes/sources'
import outputsRouter from './routes/outputs'
import llmRouter from './routes/llm'
import feedRouter from './routes/feed'
import settingsRouter from './routes/settings'
import apiKeysRouter from './routes/apikeys'

export function createApp() {
  const app = new Hono()

  app.use('*', logger())
  app.use('*', cors())

  app.get('/health', (c) => c.json({ ok: true }))

  // Public routes
  app.route('/auth', authRoutes)

  // Protected routes (Bearer token or API key)
  app.use('/sources/*', authMiddleware)
  app.use('/outputs/*', authMiddleware)
  app.use('/llm/*', authMiddleware)
  app.use('/feed', authMiddleware)
  app.use('/settings/*', authMiddleware)
  app.use('/api-keys/*', authMiddleware)

  app.route('/sources', sourcesRouter)
  app.route('/outputs', outputsRouter)
  app.route('/llm', llmRouter)
  app.route('/feed', feedRouter)
  app.route('/settings', settingsRouter)
  app.route('/api-keys', apiKeysRouter)

  // Serve frontend static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use('/*', serveStatic({ root: './web' }))
    app.get('*', serveStatic({ root: './web', path: '/index.html' }))
  }

  return app
}
