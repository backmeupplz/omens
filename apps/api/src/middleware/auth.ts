import { apiKeys, getDb, users } from '@omens/db'
import { eq } from 'drizzle-orm'
import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import env from '../env'
import { hashApiKey } from '../helpers/apikey'
import { verifyToken } from '../helpers/jwt'

export type AuthUser = {
  id: string
  email: string | null
}

const DEFAULT_USER_ID = 'single-user'

async function ensureSingleUser() {
  const db = getDb(env.DATABASE_URL)
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, DEFAULT_USER_ID))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(users).values({
      id: DEFAULT_USER_ID,
      email: 'local@omens.local',
    })
  }
}

let singleUserInitialized = false

export async function authMiddleware(c: Context, next: Next) {
  if (env.SINGLE_USER_MODE) {
    if (!singleUserInitialized) {
      await ensureSingleUser()
      singleUserInitialized = true
    }
    c.set('user', { id: DEFAULT_USER_ID, email: 'local@omens.local' })
    return next()
  }

  // Try API key first (X-API-Key header or query param)
  const apiKey = c.req.header('X-API-Key') || c.req.query('api_key')
  if (apiKey) {
    const keyHash = await hashApiKey(apiKey)
    const db = getDb(env.DATABASE_URL)
    const [key] = await db
      .select({ userId: apiKeys.userId, id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1)

    if (!key) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    // Update last used
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, key.userId))
      .limit(1)

    if (!user) {
      return c.json({ error: 'User not found' }, 401)
    }

    c.set('user', user)
    return next()
  }

  // Try httpOnly cookie, then Bearer header
  const cookieToken = getCookie(c, 'omens_token')
  const header = c.req.header('Authorization')
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : null
  const token = cookieToken || bearerToken

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const payload = await verifyToken(token)
  if (!payload?.sub) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const db = getDb(env.DATABASE_URL)
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1)

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  c.set('user', user)
  return next()
}
