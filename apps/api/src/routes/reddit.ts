import {
  getDb,
  inputs,
  redditAccounts,
  sourceAccounts,
} from '@omens/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import { decrypt, encrypt } from '../helpers/crypto'
import { ensureRedditAccountInput } from '../helpers/inputs'
import type { AuthUser } from '../middleware/auth'
import { createRedditAuthorizeUrl, exchangeRedditCode, getRedditMe } from '../reddit/api'
import { fetchForUser } from '../x/fetcher'

const redditRouter = new Hono<{ Variables: { user: AuthUser } }>()

async function getRedditAccountForUser(userId: string) {
  const db = getDb(env.DATABASE_URL)
  const [account] = await db
    .select({
      username: redditAccounts.username,
      createdAt: sourceAccounts.createdAt,
    })
    .from(sourceAccounts)
    .innerJoin(redditAccounts, eq(redditAccounts.sourceAccountId, sourceAccounts.id))
    .where(and(eq(sourceAccounts.userId, userId), eq(sourceAccounts.provider, 'reddit')))
    .limit(1)

  return account || null
}

redditRouter.get('/connect', async (c) => {
  const user = c.get('user')
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_REDIRECT_URI || !env.REDDIT_USER_AGENT) {
    return c.json({ error: 'Reddit OAuth is not configured' }, 500)
  }

  const state = await encrypt(JSON.stringify({
    userId: user.id,
    issuedAt: Date.now(),
  }))

  return c.redirect(createRedditAuthorizeUrl(state))
})

redditRouter.get('/callback', async (c) => {
  const user = c.get('user')
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  if (error) {
    return c.redirect('/settings?reddit_error=' + encodeURIComponent(error))
  }
  if (!code || !state) {
    return c.redirect('/settings?reddit_error=missing_code')
  }

  try {
    const rawState = await decrypt(state)
    const parsed = JSON.parse(rawState) as { userId: string; issuedAt: number }
    if (parsed.userId !== user.id) {
      return c.redirect('/settings?reddit_error=state_mismatch')
    }

    const tokens = await exchangeRedditCode(code)
    if (!tokens.refresh_token) {
      return c.redirect('/settings?reddit_error=no_refresh_token')
    }

    const me = await getRedditMe(tokens.access_token)
    const now = Date.now()

    await ensureRedditAccountInput({
      userId: user.id,
      redditUserId: me.id,
      username: me.name,
      refreshToken: await encrypt(tokens.refresh_token),
      accessToken: await encrypt(tokens.access_token),
      accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      scope: tokens.scope || null,
    })

    void fetchForUser(user.id)

    return c.redirect('/settings?reddit_connected=1')
  } catch (err) {
    console.error('[reddit] OAuth callback failed:', err instanceof Error ? err.message : err)
    return c.redirect('/settings?reddit_error=callback_failed')
  }
})

redditRouter.get('/session', async (c) => {
  const user = c.get('user')
  const session = await getRedditAccountForUser(user.id)

  if (!session) {
    return c.json({ connected: false })
  }

  return c.json({
    connected: true,
    username: session.username,
    connectedAt: session.createdAt,
  })
})

redditRouter.delete('/session', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  await db.delete(inputs).where(and(eq(inputs.userId, user.id), eq(inputs.provider, 'reddit')))
  await db.delete(sourceAccounts).where(and(eq(sourceAccounts.userId, user.id), eq(sourceAccounts.provider, 'reddit')))

  return c.json({ ok: true })
})

redditRouter.post('/refresh', async (c) => {
  const user = c.get('user')

  try {
    const result = await fetchForUser(user.id)
    if (result.error) {
      return c.json({ error: result.error }, 502)
    }
    return c.json({ ok: true, count: result.count })
  } catch (err) {
    console.error('[reddit] Refresh failed:', err instanceof Error ? err.message : err)
    return c.json({ error: 'Refresh failed' }, 500)
  }
})

export default redditRouter
