import {
  aiReports,
  aiScoringFeeds,
  getDb,
  reportEmailDeliveries,
  reportEmailSubscriptions,
  users,
} from '@omens/db'
import { and, eq, ne } from 'drizzle-orm'
import env from '../env'
import { sendEmail, isEmailFeatureEnabled } from './provider'
import { ReportEmailTemplate } from './templates/report-email'
import { ConfirmEmailTemplate } from './templates/confirm-email'

type SubscriptionRow = typeof reportEmailSubscriptions.$inferSelect
type SubscriptionStatus = 'missing' | SubscriptionRow['status']

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function appOrigin() {
  return env.CORS_ORIGIN || 'https://omens.online'
}

function tokenExpiryDate() {
  return new Date(Date.now() + env.EMAIL_CONFIRMATION_TTL_HOURS * 3_600_000)
}

function generateToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function unsubscribeUrl(token: string) {
  return `${appOrigin()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}

function confirmUrl(token: string) {
  return `${appOrigin()}/api/email/confirm?token=${encodeURIComponent(token)}`
}

function shouldRefreshPendingConfirmation(subscription: SubscriptionRow) {
  if (!subscription.confirmationRequired) return false
  if (subscription.status !== 'pending') return false
  if (!subscription.confirmTokenHash || !subscription.confirmTokenExpiresAt) return true
  if (subscription.confirmTokenExpiresAt.getTime() <= Date.now()) return true
  if (!subscription.lastConfirmationSentAt) return true
  return Date.now() - subscription.lastConfirmationSentAt.getTime() > 24 * 3_600_000
}

async function sendConfirmationEmail(params: {
  email: string
  feedName: string
  publicationName: string
  confirmToken: string
  unsubscribeToken: string
}) {
  const subject = `Confirm your subscription to ${params.publicationName}`
  const confirmHref = confirmUrl(params.confirmToken)
  const unsubscribeHref = unsubscribeUrl(params.unsubscribeToken)

  await sendEmail({
    to: params.email,
    subject,
    react: (
      <ConfirmEmailTemplate
        confirmUrl={confirmHref}
        unsubscribeUrl={unsubscribeHref}
        publicationName={params.publicationName}
        feedName={params.feedName}
      />
    ),
    text: [
      `Confirm your subscription to ${params.publicationName}.`,
      '',
      `Feed: ${params.feedName}`,
      `Confirm: ${confirmHref}`,
      `Unsubscribe: ${unsubscribeHref}`,
    ].join('\n'),
  })
}

async function createOrRefreshConfirmation(params: {
  subscription: SubscriptionRow
  email: string
  feedName: string
  publicationName: string
  db: ReturnType<typeof getDb>
}) {
  const confirmToken = generateToken()
  const confirmTokenHash = await hashToken(confirmToken)
  const now = new Date()

  const [updated] = await params.db
    .update(reportEmailSubscriptions)
    .set({
      status: 'pending',
      confirmationRequired: true,
      confirmTokenHash,
      confirmTokenExpiresAt: tokenExpiryDate(),
      lastConfirmationSentAt: now,
      unsubscribedAt: null,
      updatedAt: now,
      })
    .where(eq(reportEmailSubscriptions.id, params.subscription.id))
    .returning()

  await sendConfirmationEmail({
    email: params.email,
    feedName: params.feedName,
    publicationName: params.publicationName,
    confirmToken,
    unsubscribeToken: updated.unsubscribeToken,
  })

  return updated
}

async function getOwnerAccountEmail(db: ReturnType<typeof getDb>, ownerUserId: string) {
  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ownerUserId))
    .limit(1)

  const email = owner?.email?.trim() || null
  return email
}

async function deactivateStaleAccountSubscriptions(
  db: ReturnType<typeof getDb>,
  ownerUserId: string,
  feedId: string,
  normalizedEmail: string,
) {
  const now = new Date()
  await db
    .update(reportEmailSubscriptions)
    .set({
      status: 'unsubscribed',
      unsubscribedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(reportEmailSubscriptions.ownerUserId, ownerUserId),
      eq(reportEmailSubscriptions.feedId, feedId),
      eq(reportEmailSubscriptions.source, 'account'),
      ne(reportEmailSubscriptions.normalizedEmail, normalizedEmail),
    ))
}

async function getCurrentAccountSubscription(
  db: ReturnType<typeof getDb>,
  ownerUserId: string,
  feedId: string,
  normalizedEmail: string,
) {
  const [subscription] = await db
    .select()
    .from(reportEmailSubscriptions)
    .where(and(
      eq(reportEmailSubscriptions.ownerUserId, ownerUserId),
      eq(reportEmailSubscriptions.feedId, feedId),
      eq(reportEmailSubscriptions.source, 'account'),
      eq(reportEmailSubscriptions.normalizedEmail, normalizedEmail),
    ))
    .limit(1)

  return subscription || null
}

async function ensureAccountFeedSubscription(
  ownerUserId: string,
  feedId: string,
  feedName: string,
  options?: {
    allowResubscribe?: boolean
    forceConfirmationRefresh?: boolean
  },
) {
  if (!isEmailFeatureEnabled()) return null

  const db = getDb(env.DATABASE_URL)
  const ownerEmail = await getOwnerAccountEmail(db, ownerUserId)
  if (!ownerEmail) return null

  const normalized = normalizeEmail(ownerEmail)
  await deactivateStaleAccountSubscriptions(db, ownerUserId, feedId, normalized)
  const existing = await getCurrentAccountSubscription(db, ownerUserId, feedId, normalized)

  const now = new Date()
  if (!existing) {
    const unsubscribeToken = generateToken()

    if (env.EMAILS_REQUIRE_CONFIRMATION) {
      const confirmToken = generateToken()
      const confirmTokenHash = await hashToken(confirmToken)
      const [created] = await db
        .insert(reportEmailSubscriptions)
        .values({
          ownerUserId,
          feedId,
          email: ownerEmail,
          normalizedEmail: normalized,
          source: 'account',
          status: 'pending',
          confirmationRequired: true,
          confirmTokenHash,
          confirmTokenExpiresAt: tokenExpiryDate(),
          unsubscribeToken,
          lastConfirmationSentAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      await sendConfirmationEmail({
        email: ownerEmail,
        feedName,
        publicationName: 'your Omens reports',
        confirmToken,
        unsubscribeToken,
      })

      return created
    }

    const [created] = await db
      .insert(reportEmailSubscriptions)
      .values({
        ownerUserId,
        feedId,
        email: ownerEmail,
        normalizedEmail: normalized,
        source: 'account',
        status: 'active',
        confirmationRequired: false,
        confirmedAt: now,
        unsubscribeToken,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

      return created
  }

  if (existing.status === 'unsubscribed' && !options?.allowResubscribe) return existing

  if (!env.EMAILS_REQUIRE_CONFIRMATION) {
    const [updated] = await db
      .update(reportEmailSubscriptions)
      .set({
        email: ownerEmail,
        normalizedEmail: normalized,
        source: 'account',
        status: 'active',
        confirmationRequired: false,
        confirmedAt: existing.confirmedAt || now,
        unsubscribedAt: null,
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(reportEmailSubscriptions.id, existing.id))
      .returning()
    return updated
  }

  if (existing.status === 'unsubscribed' && options?.allowResubscribe) {
    return createOrRefreshConfirmation({
      subscription: existing,
      email: ownerEmail,
      feedName,
      publicationName: 'your Omens reports',
      db,
    })
  }

  if (existing.status === 'active') return existing
  if (options?.forceConfirmationRefresh || shouldRefreshPendingConfirmation(existing)) {
    return createOrRefreshConfirmation({
      subscription: existing,
      email: ownerEmail,
      feedName,
      publicationName: 'your Omens reports',
      db,
    })
  }

  return existing
}

export async function getAccountReportEmailStatus(ownerUserId: string, feedId: string) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  const db = getDb(env.DATABASE_URL)
  const ownerEmail = await getOwnerAccountEmail(db, ownerUserId)
  if (!ownerEmail) {
    return {
      email: '',
      status: 'missing' as SubscriptionStatus,
      confirmationRequired: env.EMAILS_REQUIRE_CONFIRMATION,
    }
  }

  const normalized = normalizeEmail(ownerEmail)
  await deactivateStaleAccountSubscriptions(db, ownerUserId, feedId, normalized)
  const subscription = await getCurrentAccountSubscription(db, ownerUserId, feedId, normalized)

  return {
    email: ownerEmail,
    status: (subscription?.status || 'missing') as SubscriptionStatus,
    confirmationRequired: subscription?.confirmationRequired ?? env.EMAILS_REQUIRE_CONFIRMATION,
  }
}

export async function enableAccountReportEmailSubscription(params: {
  ownerUserId: string
  feedId: string
  feedName: string
}) {
  const subscription = await ensureAccountFeedSubscription(
    params.ownerUserId,
    params.feedId,
    params.feedName,
    { allowResubscribe: true },
  )

  const status = await getAccountReportEmailStatus(params.ownerUserId, params.feedId)
  return {
    ...status,
    status: (subscription?.status || status.status) as SubscriptionStatus,
  }
}

export async function resendAccountReportEmailConfirmation(params: {
  ownerUserId: string
  feedId: string
  feedName: string
}) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  if (!env.EMAILS_REQUIRE_CONFIRMATION) {
    return enableAccountReportEmailSubscription(params)
  }

  const subscription = await ensureAccountFeedSubscription(
    params.ownerUserId,
    params.feedId,
    params.feedName,
    { allowResubscribe: true, forceConfirmationRefresh: true },
  )

  const status = await getAccountReportEmailStatus(params.ownerUserId, params.feedId)
  return {
    ...status,
    status: (subscription?.status || status.status) as SubscriptionStatus,
  }
}

export async function disableAccountReportEmailSubscription(params: {
  ownerUserId: string
  feedId: string
}) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  const db = getDb(env.DATABASE_URL)
  const ownerEmail = await getOwnerAccountEmail(db, params.ownerUserId)
  if (!ownerEmail) {
    return {
      email: '',
      status: 'missing' as SubscriptionStatus,
      confirmationRequired: env.EMAILS_REQUIRE_CONFIRMATION,
    }
  }

  const normalized = normalizeEmail(ownerEmail)
  await deactivateStaleAccountSubscriptions(db, params.ownerUserId, params.feedId, normalized)
  const subscription = await getCurrentAccountSubscription(db, params.ownerUserId, params.feedId, normalized)

  if (!subscription) {
    return {
      email: ownerEmail,
      status: 'missing' as SubscriptionStatus,
      confirmationRequired: env.EMAILS_REQUIRE_CONFIRMATION,
    }
  }

  await db
    .update(reportEmailSubscriptions)
    .set({
      status: 'unsubscribed',
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(reportEmailSubscriptions.id, subscription.id))

  return getAccountReportEmailStatus(params.ownerUserId, params.feedId)
}

export async function upsertPublicDemoReportSubscription(params: {
  ownerUserId: string
  feedId: string
  feedName: string
  email: string
  createdFromIp: string | null
}) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  const db = getDb(env.DATABASE_URL)
  const normalized = normalizeEmail(params.email)
  const [existing] = await db
    .select()
    .from(reportEmailSubscriptions)
    .where(and(
      eq(reportEmailSubscriptions.ownerUserId, params.ownerUserId),
      eq(reportEmailSubscriptions.feedId, params.feedId),
      eq(reportEmailSubscriptions.normalizedEmail, normalized),
    ))
    .limit(1)

  const now = new Date()
  if (!existing) {
    const unsubscribeToken = generateToken()

    if (env.EMAILS_REQUIRE_CONFIRMATION) {
      const confirmToken = generateToken()
      const confirmTokenHash = await hashToken(confirmToken)
      const [created] = await db
        .insert(reportEmailSubscriptions)
        .values({
          ownerUserId: params.ownerUserId,
          feedId: params.feedId,
          email: params.email.trim(),
          normalizedEmail: normalized,
          source: 'public_demo',
          status: 'pending',
          confirmationRequired: true,
          confirmTokenHash,
          confirmTokenExpiresAt: tokenExpiryDate(),
          unsubscribeToken,
          lastConfirmationSentAt: now,
          createdFromIp: params.createdFromIp,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      await sendConfirmationEmail({
        email: created.email,
        feedName: params.feedName,
        publicationName: 'the public Omens demo',
        confirmToken,
        unsubscribeToken,
      })

      return { status: 'pending' as const }
    }

    await db.insert(reportEmailSubscriptions).values({
      ownerUserId: params.ownerUserId,
      feedId: params.feedId,
      email: params.email.trim(),
      normalizedEmail: normalized,
      source: 'public_demo',
      status: 'active',
      confirmationRequired: false,
      confirmedAt: now,
      unsubscribeToken,
      createdFromIp: params.createdFromIp,
      createdAt: now,
      updatedAt: now,
    })

    return { status: 'active' as const }
  }

  if (!env.EMAILS_REQUIRE_CONFIRMATION) {
    await db
      .update(reportEmailSubscriptions)
      .set({
        email: params.email.trim(),
        normalizedEmail: normalized,
        source: 'public_demo',
        status: 'active',
        confirmationRequired: false,
        confirmedAt: existing.confirmedAt || now,
        unsubscribedAt: null,
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(reportEmailSubscriptions.id, existing.id))

    return { status: 'active' as const }
  }

  if (existing.status === 'active') return { status: 'active' as const }

  const updated = await createOrRefreshConfirmation({
    subscription: existing,
    email: params.email.trim(),
    feedName: params.feedName,
    publicationName: 'the public Omens demo',
    db,
  })

  return { status: updated.status === 'active' ? 'active' as const : 'pending' as const }
}

export async function confirmReportEmailSubscription(token: string, confirmedFromIp: string | null) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  const db = getDb(env.DATABASE_URL)
  const tokenHash = await hashToken(token)
  const [subscription] = await db
    .select()
    .from(reportEmailSubscriptions)
    .where(eq(reportEmailSubscriptions.confirmTokenHash, tokenHash))
    .limit(1)

  if (!subscription || !subscription.confirmTokenExpiresAt || subscription.confirmTokenExpiresAt.getTime() <= Date.now()) {
    return { ok: false as const, reason: 'invalid' as const }
  }

  await db
    .update(reportEmailSubscriptions)
    .set({
      status: 'active',
      confirmedAt: new Date(),
      confirmedFromIp,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(reportEmailSubscriptions.id, subscription.id))

  return { ok: true as const }
}

export async function unsubscribeReportEmailSubscription(token: string) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  const db = getDb(env.DATABASE_URL)
  const [subscription] = await db
    .select()
    .from(reportEmailSubscriptions)
    .where(eq(reportEmailSubscriptions.unsubscribeToken, token))
    .limit(1)

  if (!subscription) {
    return { ok: false as const, reason: 'invalid' as const }
  }

  await db
    .update(reportEmailSubscriptions)
    .set({
      status: 'unsubscribed',
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(reportEmailSubscriptions.id, subscription.id))

  return { ok: true as const }
}

export async function sendReportEmailsForReport(reportId: string) {
  if (!isEmailFeatureEnabled()) return

  const db = getDb(env.DATABASE_URL)
  const [report] = await db
    .select({
      id: aiReports.id,
      content: aiReports.content,
      createdAt: aiReports.createdAt,
      itemCount: aiReports.itemCount,
      ownerUserId: aiReports.userId,
      feedId: aiReports.feedId,
      feedName: aiScoringFeeds.name,
    })
    .from(aiReports)
    .innerJoin(aiScoringFeeds, eq(aiScoringFeeds.id, aiReports.feedId))
    .where(eq(aiReports.id, reportId))
    .limit(1)

  if (!report) return

  await ensureAccountFeedSubscription(report.ownerUserId, report.feedId, report.feedName)

  const subscriptions = await db
    .select()
    .from(reportEmailSubscriptions)
    .where(and(
      eq(reportEmailSubscriptions.ownerUserId, report.ownerUserId),
      eq(reportEmailSubscriptions.feedId, report.feedId),
      eq(reportEmailSubscriptions.status, 'active'),
    ))

  if (subscriptions.length === 0) return

  const reportUrl = `${appOrigin()}/report/${report.id}`
  const dateLabel = report.createdAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  for (const subscription of subscriptions) {
    const [existingDelivery] = await db
      .select()
      .from(reportEmailDeliveries)
      .where(and(
        eq(reportEmailDeliveries.subscriptionId, subscription.id),
        eq(reportEmailDeliveries.reportId, report.id),
      ))
      .limit(1)

    if (!existingDelivery) {
      await db.insert(reportEmailDeliveries).values({
        subscriptionId: subscription.id,
        reportId: report.id,
        provider: 'resend',
        status: 'pending',
      })
    } else if (existingDelivery.status === 'sent') {
      continue
    } else {
      await db
        .update(reportEmailDeliveries)
        .set({
          provider: 'resend',
          status: 'pending',
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(reportEmailDeliveries.id, existingDelivery.id))
    }

    try {
      const messageId = await sendEmail({
        to: subscription.email,
        subject: `${report.feedName} • ${dateLabel} • The Daily Omens`,
        react: (
          <ReportEmailTemplate
            reportContent={report.content}
            reportUrl={reportUrl}
            unsubscribeUrl={unsubscribeUrl(subscription.unsubscribeToken)}
            feedName={report.feedName}
            createdAt={report.createdAt}
            itemCount={report.itemCount}
          />
        ),
        text: [
          `${report.feedName} • ${dateLabel}`,
          '',
          report.content.replace(/\[\[(?:item|tweet):[^\]]+\]\]/g, '').trim(),
          '',
          `Read online: ${reportUrl}`,
        ].join('\n'),
      })

      await db
        .update(reportEmailDeliveries)
        .set({
          status: 'sent',
          providerMessageId: messageId,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(reportEmailDeliveries.subscriptionId, subscription.id),
          eq(reportEmailDeliveries.reportId, report.id),
        ))
    } catch (err) {
      await db
        .update(reportEmailDeliveries)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(and(
          eq(reportEmailDeliveries.subscriptionId, subscription.id),
          eq(reportEmailDeliveries.reportId, report.id),
        ))
    }
  }
}
