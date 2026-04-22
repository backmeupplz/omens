import { zValidator } from '@hono/zod-validator'
import { aiScoringFeeds, getDb } from '@omens/db'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { reportEmailFeedSchema, reportEmailSubscribeSchema } from '@omens/shared'
import { z } from 'zod'
import env from '../env'
import { getDemoUserId } from '../helpers/demo'
import { clientIp } from '../helpers/http'
import {
  disableAccountReportEmailSubscription,
  enableAccountReportEmailSubscription,
  getAccountReportEmailStatus,
  confirmReportEmailSubscription,
  resendAccountReportEmailConfirmation,
  sendLatestReportTestEmail,
  unsubscribeReportEmailSubscription,
  upsertPublicDemoReportSubscription,
} from '../email/service'
import { isEmailFeatureEnabled } from '../email/provider'
import { emailIcons } from '../email/icons'
import type { AppEnv } from '../middleware/auth'

const emailRouter = new Hono<AppEnv>()
const sendLatestReportTestSchema = z.object({
  feedId: z.string().min(1),
  email: z.string().email().optional(),
})

function htmlPage(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: #f5efe3;
        color: #1f1a16;
        font-family: Georgia, serif;
      }
      .wrap {
        max-width: 42rem;
        margin: 0 auto;
        padding: 2rem 1rem;
      }
      .card {
        background: #fcf8f0;
        border: 1px solid #d8c8b2;
        padding: 2rem 1.5rem;
      }
      .kicker {
        margin: 0 0 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.72rem;
        color: #a6462f;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 2rem;
        line-height: 1.1;
      }
      p {
        margin: 0 0 0.9rem;
        line-height: 1.7;
        font-size: 1rem;
      }
      a {
        color: #a6462f;
      }
      .cta {
        display: inline-block;
        margin-top: 0.5rem;
        padding: 0.8rem 1rem;
        background: #1f1a16;
        color: #fff;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="kicker">The Daily Omens</div>
        ${body}
      </div>
    </div>
  </body>
</html>`
}

async function getDemoSubscriptionTarget() {
  const demoUserId = await getDemoUserId()
  if (!demoUserId) return null

  const db = getDb(env.DATABASE_URL)
  const [feed] = await db
    .select({ id: aiScoringFeeds.id, name: aiScoringFeeds.name })
    .from(aiScoringFeeds)
    .where(eq(aiScoringFeeds.userId, demoUserId))
    .orderBy(desc(aiScoringFeeds.isMain), aiScoringFeeds.createdAt)
    .limit(1)

  if (!feed) return null

  return { ownerUserId: demoUserId, feedId: feed.id, feedName: feed.name }
}

async function getOwnedFeed(userId: string, feedId: string) {
  const db = getDb(env.DATABASE_URL)
  const [feed] = await db
    .select({ id: aiScoringFeeds.id, name: aiScoringFeeds.name })
    .from(aiScoringFeeds)
    .where(and(
      eq(aiScoringFeeds.id, feedId),
      eq(aiScoringFeeds.userId, userId),
    ))
    .limit(1)

  return feed || null
}

emailRouter.get('/icons/:name{[a-z]+\\.svg}', (c) => {
  const param = c.req.param('name')
  const name = param.replace(/\.svg$/, '') as keyof typeof emailIcons
  const body = emailIcons[name]
  if (!body) return c.text('Not found', 404)
  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=2592000, immutable')
  return c.body(body)
})

emailRouter.get('/demo/meta', async (c) => {
  const target = isEmailFeatureEnabled() ? await getDemoSubscriptionTarget() : null
  return c.json({
    enabled: !!target,
    confirmationRequired: isEmailFeatureEnabled() ? env.EMAILS_REQUIRE_CONFIRMATION : false,
    feedName: target?.feedName || '',
    publicationName: 'Public Demo Edition',
  })
})

emailRouter.post('/demo/subscribe', zValidator('json', reportEmailSubscribeSchema), async (c) => {
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)

  const target = await getDemoSubscriptionTarget()
  if (!target) return c.json({ error: 'Demo subscriptions unavailable' }, 404)

  const body = c.req.valid('json')
  try {
    const result = await upsertPublicDemoReportSubscription({
      ownerUserId: target.ownerUserId,
      feedId: target.feedId,
      feedName: target.feedName,
      email: body.email,
      createdFromIp: clientIp(c),
    })

    return c.json({
      ok: true,
      status: result.status,
      confirmationRequired: env.EMAILS_REQUIRE_CONFIRMATION,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not subscribe'
    return c.json({
      error: /domain is not verified/i.test(message)
        ? 'Email delivery is not ready yet. Domain verification is still pending.'
        : message,
    }, 503)
  }
})

emailRouter.get('/me/feed-status', zValidator('query', reportEmailFeedSchema), async (c) => {
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)

  const user = c.get('user')
  const { feedId } = c.req.valid('query')
  const feed = await getOwnedFeed(user.id, feedId)
  if (!feed) return c.json({ error: 'Feed not found' }, 404)

  const status = await getAccountReportEmailStatus(user.id, feed.id)
  return c.json(status)
})

emailRouter.post('/me/feed-subscription/enable', zValidator('json', reportEmailFeedSchema), async (c) => {
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)

  const user = c.get('user')
  const { feedId } = c.req.valid('json')
  const feed = await getOwnedFeed(user.id, feedId)
  if (!feed) return c.json({ error: 'Feed not found' }, 404)

  const status = await enableAccountReportEmailSubscription({
    ownerUserId: user.id,
    feedId: feed.id,
    feedName: feed.name,
  })

  return c.json({ ok: true, ...status })
})

emailRouter.post('/me/feed-subscription/disable', zValidator('json', reportEmailFeedSchema), async (c) => {
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)

  const user = c.get('user')
  const { feedId } = c.req.valid('json')
  const feed = await getOwnedFeed(user.id, feedId)
  if (!feed) return c.json({ error: 'Feed not found' }, 404)

  const status = await disableAccountReportEmailSubscription({
    ownerUserId: user.id,
    feedId: feed.id,
  })

  return c.json({ ok: true, ...status })
})

emailRouter.post('/me/feed-subscription/resend-confirmation', zValidator('json', reportEmailFeedSchema), async (c) => {
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)

  const user = c.get('user')
  const { feedId } = c.req.valid('json')
  const feed = await getOwnedFeed(user.id, feedId)
  if (!feed) return c.json({ error: 'Feed not found' }, 404)

  const status = await resendAccountReportEmailConfirmation({
    ownerUserId: user.id,
    feedId: feed.id,
    feedName: feed.name,
  })

  return c.json({ ok: true, ...status })
})

emailRouter.post('/me/dev/send-latest-report', zValidator('json', sendLatestReportTestSchema), async (c) => {
  if (process.env.NODE_ENV === 'production') return c.json({ error: 'Not found' }, 404)
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)

  const user = c.get('user')
  const { feedId, email } = c.req.valid('json')
  const feed = await getOwnedFeed(user.id, feedId)
  if (!feed) return c.json({ error: 'Feed not found' }, 404)

  const result = await sendLatestReportTestEmail({
    ownerUserId: user.id,
    feedId: feed.id,
    toEmail: email,
  })

  return c.json({ ok: true, ...result })
})

emailRouter.post('/dev/send-demo-report', async (c) => {
  if (process.env.NODE_ENV === 'production') return c.json({ error: 'Not found' }, 404)
  if (!isEmailFeatureEnabled()) return c.json({ error: 'Email feature not available' }, 404)
  if (!env.DEMO_USER_EMAIL) return c.json({ error: 'DEMO_USER_EMAIL is not configured' }, 404)

  const target = await getDemoSubscriptionTarget()
  if (!target) return c.json({ error: 'Demo feed not available' }, 404)

  try {
    const result = await sendLatestReportTestEmail({
      ownerUserId: target.ownerUserId,
      feedId: target.feedId,
      toEmail: env.DEMO_USER_EMAIL,
    })

    return c.json({ ok: true, feedName: target.feedName, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send demo email'
    return c.json({ error: message }, 503)
  }
})

emailRouter.get('/confirm', async (c) => {
  if (!isEmailFeatureEnabled()) return c.html(htmlPage('Email unavailable', '<h1>Email is not configured</h1><p>This Omens instance does not currently support report emails.</p>'), 404)

  const token = c.req.query('token')
  if (!token) {
    return c.html(htmlPage('Missing token', '<h1>Missing confirmation token</h1><p>Please use the full link from your email.</p>'), 400)
  }

  const result = await confirmReportEmailSubscription(token, clientIp(c))
  if (!result.ok) {
    return c.html(htmlPage('Link expired', '<h1>This confirmation link is no longer valid</h1><p>Try subscribing again from the demo page to get a fresh link.</p>'), 400)
  }

  return c.html(htmlPage('Subscription confirmed', '<h1>Subscription confirmed</h1><p>You’ll now receive new Omens report editions by email.</p><a class="cta" href="/">Return to Omens</a>'))
})

emailRouter.get('/unsubscribe', async (c) => {
  if (!isEmailFeatureEnabled()) return c.html(htmlPage('Email unavailable', '<h1>Email is not configured</h1><p>This Omens instance does not currently support report emails.</p>'), 404)

  const token = c.req.query('token')
  if (!token) {
    return c.html(htmlPage('Missing token', '<h1>Missing unsubscribe token</h1><p>Please use the full link from your email.</p>'), 400)
  }

  const result = await unsubscribeReportEmailSubscription(token)
  if (!result.ok) {
    return c.html(htmlPage('Link expired', '<h1>This unsubscribe link is no longer valid</h1><p>The subscription may already be inactive.</p>'), 400)
  }

  return c.html(htmlPage('Unsubscribed', '<h1>You’ve been unsubscribed</h1><p>You will no longer receive Omens report emails at this address.</p><a class="cta" href="/">Return to Omens</a>'))
})

export default emailRouter
