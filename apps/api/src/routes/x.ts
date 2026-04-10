import { zValidator } from '@hono/zod-validator'
import { articles, getDb, nudges, promptChanges, tweetScores, userTweets, xSessions } from '@omens/db'
import { xLoginSchema } from '@omens/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import env from '../env'
import { encrypt } from '../helpers/crypto'
import type { AuthUser } from '../middleware/auth'
import { xLogin } from '../x/auth'
import { fetchForUser } from '../x/fetcher'
import { decrypt } from '../helpers/crypto'
import { getArticleContent, getHomeTimeline, getTweetConversation, getTweetReplies, getTweetThread } from '../x/graphql'

const xRouter = new Hono<{ Variables: { user: AuthUser } }>()

xRouter.post('/login', zValidator('json', xLoginSchema), async (c) => {
  const user = c.get('user')
  const { username, password, handle, totp } = c.req.valid('json')
  const db = getDb(env.DATABASE_URL)

  try {
    const session = await xLogin(username, password, handle, totp)

    // Validate session actually works before storing
    try {
      await getHomeTimeline({
        authToken: session.authToken,
        ct0: session.ct0,
      })
    } catch {
      console.log(`[x] Session validation failed for user ${user.id} (@${username})`)
      return c.json({ error: 'X login succeeded but session is not working' }, 400)
    }

    // Encrypt credentials before storage
    const encAuthToken = await encrypt(session.authToken)
    const encCt0 = await encrypt(session.ct0)

    // Upsert session (one per user)
    const existing = await db
      .select({ id: xSessions.id })
      .from(xSessions)
      .where(eq(xSessions.userId, user.id))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(xSessions)
        .set({
          xId: session.xId,
          username: session.username,
          authToken: encAuthToken,
          ct0: encCt0,
        })
        .where(eq(xSessions.userId, user.id))
    } else {
      await db.insert(xSessions).values({
        userId: user.id,
        xId: session.xId,
        username: session.username,
        authToken: encAuthToken,
        ct0: encCt0,
      })
    }

    const isReconnect = existing.length > 0
    if (!isReconnect) {
      // Only wipe tweet links on first connection, not reconnect
      await db.delete(userTweets).where(eq(userTweets.userId, user.id))
    }

    console.log(`[x] User ${user.id} ${isReconnect ? 'reconnected' : 'connected'} X @${session.username}`)

    // Trigger fetch in background
    void fetchForUser(user.id)

    return c.json({ connected: true, username: session.username })
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'unknown'
    console.log(`[x] Login failed for user ${user.id}: ${internal}`)
    // Only expose safe error messages to the client
    const safeMessages = [
      'X rate limited, try again later',
      'X session expired, please reconnect',
      'X login succeeded but session is not working',
      'Login failed',
      'Invalid credentials',
      'TOTP/2FA code required',
      'curl-impersonate not found',
      'Incorrect. Please try again',
      'X denied the login',
    ]
    const message = safeMessages.find((m) => internal.includes(m)) || internal
    console.error(`[x] Login error (shown to user: "${message}"):`, internal)
    return c.json({ error: message }, 400)
  }
})

xRouter.get('/session', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select({
      username: xSessions.username,
      createdAt: xSessions.createdAt,
    })
    .from(xSessions)
    .where(eq(xSessions.userId, user.id))
    .limit(1)

  if (!session) {
    return c.json({ connected: false })
  }

  return c.json({
    connected: true,
    username: session.username,
    connectedAt: session.createdAt,
  })
})

xRouter.delete('/session', async (c) => {
  const user = c.get('user')
  const db = getDb(env.DATABASE_URL)

  await db.delete(nudges).where(eq(nudges.userId, user.id))
  await db.delete(tweetScores).where(eq(tweetScores.userId, user.id))
  await db.delete(promptChanges).where(eq(promptChanges.userId, user.id))
  await db.delete(userTweets).where(eq(userTweets.userId, user.id))
  await db.delete(xSessions).where(eq(xSessions.userId, user.id))

  console.log(`[x] User ${user.id} disconnected X`)

  return c.json({ ok: true })
})

xRouter.post('/refresh', async (c) => {
  const user = c.get('user')

  try {
    const result = await fetchForUser(user.id)
    if (result.error) {
      return c.json({ error: result.error }, 502)
    }
    return c.json({ ok: true, count: result.count })
  } catch (err) {
    console.error(`[x] Refresh failed:`, err instanceof Error ? err.message : err)
    return c.json({ error: 'Refresh failed' }, 500)
  }
})

xRouter.get('/thread/:tweetId', async (c) => {
  const user = c.get('user')
  const tweetId = c.req.param('tweetId')
  if (!/^\d+$/.test(tweetId)) {
    return c.json({ error: 'Invalid tweet ID' }, 400)
  }
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, user.id))
    .limit(1)

  if (!session) {
    return c.json({ error: 'X not connected' }, 400)
  }

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)
    const result = await getTweetThread({ authToken, ct0 }, tweetId)
    return c.json(result)
  } catch (err) {
    console.error(`[x] Thread fetch failed:`, err instanceof Error ? err.message : err)
    return c.json({ error: 'Failed to fetch thread' }, 500)
  }
})

xRouter.get('/conversation/:tweetId', async (c) => {
  const user = c.get('user')
  const tweetId = c.req.param('tweetId')
  if (!/^\d+$/.test(tweetId)) {
    return c.json({ error: 'Invalid tweet ID' }, 400)
  }
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, user.id))
    .limit(1)

  if (!session) {
    return c.json({ error: 'X not connected' }, 400)
  }

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)
    const result = await getTweetConversation({ authToken, ct0 }, tweetId)
    return c.json(result)
  } catch (err) {
    console.error(`[x] Conversation fetch failed:`, err instanceof Error ? err.message : err)
    return c.json({ error: 'Failed to fetch conversation' }, 500)
  }
})

xRouter.get('/replies/:tweetId', async (c) => {
  const user = c.get('user')
  const tweetId = c.req.param('tweetId')
  if (!/^\d+$/.test(tweetId)) {
    return c.json({ error: 'Invalid tweet ID' }, 400)
  }
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, user.id))
    .limit(1)

  if (!session) {
    return c.json({ error: 'X not connected' }, 400)
  }

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)
    const cursor = c.req.query('cursor')
    const result = await getTweetReplies({ authToken, ct0 }, tweetId, cursor || undefined)
    return c.json(result)
  } catch (err) {
    console.error(`[x] Replies fetch failed:`, err instanceof Error ? err.message : err)
    return c.json({ error: 'Failed to fetch replies' }, 500)
  }
})

xRouter.get('/article/:tweetId', async (c) => {
  const user = c.get('user')
  const tweetId = c.req.param('tweetId')
  if (!/^\d+$/.test(tweetId)) {
    return c.json({ error: 'Invalid tweet ID' }, 400)
  }
  const db = getDb(env.DATABASE_URL)

  const [session] = await db
    .select()
    .from(xSessions)
    .where(eq(xSessions.userId, user.id))
    .limit(1)

  if (!session) {
    return c.json({ error: 'X not connected' }, 400)
  }

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)
    const article = await getArticleContent({ authToken, ct0 }, tweetId)
    if (!article) {
      return c.json({ error: 'Article not found' }, 404)
    }
    // Cache article in DB for public access
    void db
      .insert(articles)
      .values({
        tweetId,
        title: article.title,
        coverImage: article.coverImage,
        body: article.body,
        richContent: article.richContent ? JSON.stringify(article.richContent) : null,
        authorName: article.authorName,
        authorHandle: article.authorHandle,
        authorAvatar: article.authorAvatar,
      })
      .onConflictDoUpdate({
        target: articles.tweetId,
        set: {
          title: article.title,
          coverImage: article.coverImage,
          body: article.body,
          richContent: article.richContent ? JSON.stringify(article.richContent) : null,
          authorName: article.authorName,
          authorHandle: article.authorHandle,
          authorAvatar: article.authorAvatar,
          fetchedAt: new Date(),
        },
      })
      .catch((e) => console.error('[x] Article cache save failed:', e))
    return c.json({ article })
  } catch (err) {
    console.error(`[x] Article fetch failed:`, err instanceof Error ? err.message : err)
    return c.json({ error: 'Failed to fetch article' }, 500)
  }
})

// Temporary debug endpoint — returns raw article structure from X API
xRouter.get('/article-debug/:tweetId', async (c) => {
  const user = c.get('user')
  const tweetId = c.req.param('tweetId')
  if (!/^\d+$/.test(tweetId)) {
    return c.json({ error: 'Invalid tweet ID' }, 400)
  }
  const db = getDb(env.DATABASE_URL)
  const [session] = await db.select().from(xSessions).where(eq(xSessions.userId, user.id)).limit(1)
  if (!session) return c.json({ error: 'X not connected' }, 400)

  try {
    const authToken = await decrypt(session.authToken)
    const ct0 = await decrypt(session.ct0)
    const { getArticleRaw } = await import('../x/graphql')
    const raw = await getArticleRaw({ authToken, ct0 }, tweetId)
    return c.json(raw)
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

export default xRouter
