import {
  aiReports,
  aiScoringFeeds,
  getDb,
  reportEmailDeliveries,
  reportEmailSubscriptions,
  users,
} from '@omens/db'
import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm'
import env from '../env'
import { hydrateReport } from '../helpers/report'
import { sendEmail, isEmailFeatureEnabled } from './provider'
import { renderPlainTextReportEmail } from './report-content'
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

function unsubscribeHeaders(url: string) {
  return {
    'List-Unsubscribe': `<${url}>`,
  }
}

function reportUrl(reportId: string) {
  return `${appOrigin()}/report/${reportId}`
}

function reportEmailSubject(feedName: string, createdAt: Date) {
  const dateLabel = createdAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${feedName} • ${dateLabel} • The Daily Omens`
}

async function sendHydratedReportEmail(params: {
  to: string
  report: Awaited<ReturnType<typeof hydrateReport>>
  feedName: string
  unsubscribeHref: string
  headers?: Record<string, string>
}) {
  const emailReportUrl = reportUrl(params.report.id)
  const dateLabel = params.report.createdAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return sendEmail({
    to: params.to,
    subject: reportEmailSubject(params.feedName, params.report.createdAt),
    headers: params.headers,
    react: (
      <ReportEmailTemplate
        reportContent={params.report.content}
        reportUrl={emailReportUrl}
        unsubscribeUrl={params.unsubscribeHref}
        feedName={params.feedName}
        createdAt={params.report.createdAt}
        itemCount={params.report.itemCount}
        refItems={params.report.refItems}
      />
    ),
    text: renderPlainTextReportEmail({
      reportContent: params.report.content,
      reportUrl: emailReportUrl,
      unsubscribeUrl: params.unsubscribeHref,
      feedName: params.feedName,
      dateLabel,
      refItems: params.report.refItems,
    }),
  })
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
    headers: unsubscribeHeaders(unsubscribeHref),
    react: (
      <ConfirmEmailTemplate
        confirmUrl={confirmHref}
        unsubscribeUrl={unsubscribeHref}
        publicationName={params.publicationName}
        feedName={params.feedName}
        expiresInHours={env.EMAIL_CONFIRMATION_TTL_HOURS}
      />
    ),
    text: [
      `Confirm your subscription to ${params.publicationName}.`,
      '',
      `Feed: ${params.feedName}`,
      `This confirmation link expires in ${env.EMAIL_CONFIRMATION_TTL_HOURS} hours.`,
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

async function rollbackConfirmationRefresh(params: {
  subscription: SubscriptionRow
  db: ReturnType<typeof getDb>
}) {
  await params.db
    .update(reportEmailSubscriptions)
    .set({
      status: params.subscription.status,
      confirmationRequired: params.subscription.confirmationRequired,
      confirmTokenHash: params.subscription.confirmTokenHash,
      confirmTokenExpiresAt: params.subscription.confirmTokenExpiresAt,
      lastConfirmationSentAt: params.subscription.lastConfirmationSentAt,
      unsubscribedAt: params.subscription.unsubscribedAt,
      updatedAt: new Date(),
    })
    .where(eq(reportEmailSubscriptions.id, params.subscription.id))
}

async function createPendingSubscription(params: {
  db: ReturnType<typeof getDb>
  values: Omit<typeof reportEmailSubscriptions.$inferInsert, 'id'>
}) {
  const [created] = await params.db
    .insert(reportEmailSubscriptions)
    .values(params.values)
    .returning()

  return created
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
      const created = await createPendingSubscription({
        db,
        values: {
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
        },
      })

      try {
        await sendConfirmationEmail({
          email: ownerEmail,
          feedName,
          publicationName: 'your Omens reports',
          confirmToken,
          unsubscribeToken,
        })
      } catch (err) {
        await db.delete(reportEmailSubscriptions).where(eq(reportEmailSubscriptions.id, created.id))
        throw err
      }

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
        lastConfirmationSentAt: null,
        updatedAt: now,
      })
      .where(eq(reportEmailSubscriptions.id, existing.id))
      .returning()
    return updated
  }

  if (existing.status === 'unsubscribed' && options?.allowResubscribe) {
    try {
      return await createOrRefreshConfirmation({
        subscription: existing,
        email: ownerEmail,
        feedName,
        publicationName: 'your Omens reports',
        db,
      })
    } catch (err) {
      await rollbackConfirmationRefresh({ subscription: existing, db })
      throw err
    }
  }

  if (existing.status === 'active') return existing
  if (options?.forceConfirmationRefresh || shouldRefreshPendingConfirmation(existing)) {
    try {
      return await createOrRefreshConfirmation({
        subscription: existing,
        email: ownerEmail,
        feedName,
        publicationName: 'your Omens reports',
        db,
      })
    } catch (err) {
      await rollbackConfirmationRefresh({ subscription: existing, db })
      throw err
    }
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
      const created = await createPendingSubscription({
        db,
        values: {
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
        },
      })

      try {
        await sendConfirmationEmail({
          email: created.email,
          feedName: params.feedName,
          publicationName: 'the public Omens demo',
          confirmToken,
          unsubscribeToken,
        })
      } catch (err) {
        await db.delete(reportEmailSubscriptions).where(eq(reportEmailSubscriptions.id, created.id))
        throw err
      }

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
        lastConfirmationSentAt: null,
        updatedAt: now,
      })
      .where(eq(reportEmailSubscriptions.id, existing.id))

    return { status: 'active' as const }
  }

  if (existing.status === 'active') return { status: 'active' as const }

  let updated: SubscriptionRow
  try {
    updated = await createOrRefreshConfirmation({
      subscription: existing,
      email: params.email.trim(),
      feedName: params.feedName,
      publicationName: 'the public Omens demo',
      db,
    })
  } catch (err) {
    await rollbackConfirmationRefresh({ subscription: existing, db })
    throw err
  }

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
      confirmationRequired: false,
      confirmedAt: new Date(),
      confirmedFromIp,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      lastConfirmationSentAt: null,
      unsubscribedAt: null,
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
  const [reportRow] = await db
    .select({
      report: aiReports,
      feedName: aiScoringFeeds.name,
    })
    .from(aiReports)
    .innerJoin(aiScoringFeeds, eq(aiScoringFeeds.id, aiReports.feedId))
    .where(eq(aiReports.id, reportId))
    .limit(1)

  if (!reportRow) return

  const report = await hydrateReport(db, reportRow.report)
  const ownerUserId = reportRow.report.userId
  const feedId = reportRow.report.feedId
  const feedName = reportRow.feedName

  try {
    await ensureAccountFeedSubscription(ownerUserId, feedId, feedName)
  } catch (err) {
    console.error(
      `[email] Failed to refresh owner subscription for report ${report.id}:`,
      err instanceof Error ? err.message : err,
    )
  }

  const allSubscriptions = await db
    .select()
    .from(reportEmailSubscriptions)
    .where(and(
      eq(reportEmailSubscriptions.ownerUserId, ownerUserId),
      eq(reportEmailSubscriptions.feedId, feedId),
      eq(reportEmailSubscriptions.status, 'active'),
    ))

  const demoSubscriptions = allSubscriptions.filter((sub) => sub.source === 'public_demo')
  let subscriptions = allSubscriptions
  if (demoSubscriptions.length > 0) {
    const cutoff = new Date(Date.now() - 24 * 3_600_000)
    const [recentDemoDelivery] = await db
      .select({ id: reportEmailDeliveries.id })
      .from(reportEmailDeliveries)
      .where(and(
        inArray(reportEmailDeliveries.subscriptionId, demoSubscriptions.map((sub) => sub.id)),
        eq(reportEmailDeliveries.status, 'sent'),
        gte(reportEmailDeliveries.sentAt, cutoff),
      ))
      .limit(1)

    if (recentDemoDelivery) {
      subscriptions = allSubscriptions.filter((sub) => sub.source !== 'public_demo')
    }
  }

  if (subscriptions.length === 0) return

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
      const messageId = await sendHydratedReportEmail({
        to: subscription.email,
        report,
        feedName,
        unsubscribeHref: unsubscribeUrl(subscription.unsubscribeToken),
        headers: unsubscribeHeaders(unsubscribeUrl(subscription.unsubscribeToken)),
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

export async function sendLatestReportTestEmail(params: {
  ownerUserId: string
  feedId: string
  toEmail?: string | null
}) {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  const db = getDb(env.DATABASE_URL)
  const [reportRow] = await db
    .select({
      report: aiReports,
      feedName: aiScoringFeeds.name,
    })
    .from(aiReports)
    .innerJoin(aiScoringFeeds, eq(aiScoringFeeds.id, aiReports.feedId))
    .where(and(
      eq(aiReports.userId, params.ownerUserId),
      eq(aiReports.feedId, params.feedId),
    ))
    .orderBy(desc(aiReports.createdAt))
    .limit(1)

  if (!reportRow) {
    throw new Error('No report found for this feed')
  }

  const destinationEmail = normalizeEmail(params.toEmail || await getOwnerAccountEmail(db, params.ownerUserId) || '')
  if (!destinationEmail) {
    throw new Error('No destination email available')
  }

  const report = await hydrateReport(db, reportRow.report)
  const messageId = await sendHydratedReportEmail({
    to: destinationEmail,
    report,
    feedName: reportRow.feedName,
    unsubscribeHref: `${appOrigin()}/settings`,
  })

  return {
    reportId: report.id,
    to: destinationEmail,
    messageId,
  }
}
