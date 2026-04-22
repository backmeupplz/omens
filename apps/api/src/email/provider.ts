import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import { Resend } from 'resend'
import env from '../env'

export function isEmailFeatureEnabled() {
  return !!(env.RESEND_API_KEY && env.EMAIL_FROM)
}

function getResendClient() {
  if (!isEmailFeatureEnabled()) {
    throw new Error('Email feature is not configured')
  }

  return new Resend(env.RESEND_API_KEY)
}

export async function sendEmail(params: {
  to: string
  subject: string
  react: ReactElement
  text: string
}) {
  const resend = getResendClient()
  const html = await render(params.react)
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    replyTo: env.EMAIL_REPLY_TO || undefined,
    to: [params.to],
    subject: params.subject,
    html,
    text: params.text,
  })

  if (error) {
    throw new Error(error.message || 'Email send failed')
  }

  return data?.id || null
}
