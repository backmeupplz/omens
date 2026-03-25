import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { registerSchema, loginSchema } from '@omens/shared'
import { getDb, users, llmConfigs, outputs } from '@omens/db'
import { hashPassword, verifyPassword } from '../helpers/password'
import { createToken } from '../helpers/jwt'
import env from '../env'

const auth = new Hono()

auth.post('/register', zValidator('json', registerSchema), async (c) => {
  if (env.SINGLE_USER_MODE) {
    return c.json({ error: 'Registration disabled in single-user mode' }, 400)
  }

  const { email, password } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      settings: { interests: '', minScore: 30, language: 'en' },
    })
    .returning({ id: users.id, email: users.email })

  // Create default LLM config
  await db.insert(llmConfigs).values({
    userId: user.id,
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL,
  })

  // Create default web feed output
  await db.insert(outputs).values({
    userId: user.id,
    type: 'web_feed',
    config: {},
  })

  const token = await createToken(user.id)
  return c.json({ token, user: { id: user.id, email: user.email } })
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
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await createToken(user.id)
  return c.json({ token, user: { id: user.id, email: user.email } })
})

export default auth
