import type { Context, Next } from 'hono'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, 60_000)

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

export function rateLimiter(opts: {
  windowMs: number
  max: number
  keyPrefix?: string
}) {
  return async (c: Context, next: Next) => {
    const ip = getClientIp(c)
    const key = `${opts.keyPrefix || 'rl'}:${ip}`
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      store.set(key, entry)
    }

    entry.count++

    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests' }, 429)
    }

    return next()
  }
}
