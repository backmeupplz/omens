import type { Context } from 'hono'

export function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

export function parsePagination(c: Context, defaults?: { limit?: number; maxLimit?: number }): {
  page: number
  limit: number
  offset: number
} {
  const defaultLimit = defaults?.limit ?? 50
  const maxLimit = defaults?.maxLimit ?? 100
  const page = Math.max(1, Math.floor(Number(c.req.query('page') || '1')) || 1)
  const limit = Math.max(1, Math.min(Math.floor(Number(c.req.query('limit') || String(defaultLimit))) || defaultLimit, maxLimit))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}
