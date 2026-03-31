import { zValidator } from '@hono/zod-validator'
import { getDb, users } from '@omens/db'
import { loginSchema, registerSchema } from '@omens/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import env from '../env'
import { createToken } from '../helpers/jwt'
import { hashPassword, verifyPassword } from '../helpers/password'

import { authMiddleware, type AppEnv } from '../middleware/auth'

const auth = new Hono<AppEnv>()

const isProd = process.env.NODE_ENV === 'production'

auth.get('/mode', (c) => c.json({ singleUser: env.SINGLE_USER_MODE }))

auth.get('/me', authMiddleware, (c) => {
  const user = c.get('user')
  return c.json({ id: user.id, email: user.email })
})

function clientIp(c: any): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

function setAuthCookie(c: any, token: string) {
  setCookie(c, 'omens_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days, matches JWT expiry
  })
}

auth.post('/register', zValidator('json', registerSchema), async (c) => {
  if (env.SINGLE_USER_MODE) {
    return c.json({ error: 'Registration disabled in single-user mode' }, 400)
  }

  const { email, password } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  try {
    const passwordHash = await hashPassword(password)
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email })

    console.log(`[auth] User registered: ${user.id} from ${clientIp(c)}`)
    const token = await createToken(user.id)
    setAuthCookie(c, token)
    return c.json({ user: { id: user.id, email: user.email } })
  } catch {
    console.log(`[auth] Registration failed for email from ${clientIp(c)}`)
    return c.json({ error: 'Registration failed' }, 400)
  }
})

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  if (env.SINGLE_USER_MODE) {
    return c.json({ error: 'Login disabled in single-user mode' }, 400)
  }

  const { email, password } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user?.passwordHash) {
    await hashPassword('dummy-password-timing-safe')
    console.log(`[auth] Failed login (unknown user) from ${clientIp(c)}`)
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    console.log(`[auth] Failed login for user ${user.id} from ${clientIp(c)}`)
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  console.log(`[auth] Successful login for user ${user.id} from ${clientIp(c)}`)
  const token = await createToken(user.id)
  setAuthCookie(c, token)
  return c.json({ user: { id: user.id, email: user.email } })
})

auth.post('/logout', (c) => {
  deleteCookie(c, 'omens_token', { path: '/' })
  return c.json({ ok: true })
})

export default auth
