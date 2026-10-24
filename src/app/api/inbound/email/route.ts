import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { readBodyLimited } from '@/lib/read-body'
import { fromGenericBody, fromResend, InboundUpstreamError, verifyInbound } from '@/modules/connectors/email/adapter'
import { handleInboundEmail } from '@/modules/connectors/email/service'
import { systemDb } from '@/lib/platform'
import { handleSequenceReply, isReplyInboxMail } from '@/modules/orbit/sequences/replies'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Inbound email for email-to-task (tasks+<workspace>-<token>@INBOUND_EMAIL_DOMAIN)
 * and for Orbit sequence reply detection (reply+<enrolment>-<signature>@…).
 * Resend inbound (Svix signature with INBOUND_EMAIL_SECRET) or a generic JSON
 * post signed with X-Flowbit-Signature. Rejected mail answers 200 with the
 * reason, so the provider does not keep retrying; a bad signature is 401.
 * When Resend's own API fails (timeout, 429, 5xx) the answer is 503, so
 * Resend redelivers instead of the mail being lost.
 */
const MAX_INBOUND_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  const env = serverEnv()
  if (!env.INBOUND_EMAIL_SECRET || !env.INBOUND_EMAIL_DOMAIN) return NextResponse.json({ error: 'inbound email is not configured' }, { status: 503 })
  const raw = await readBodyLimited(request, MAX_INBOUND_BYTES)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const verified = verifyInbound(raw, request.headers, env.INBOUND_EMAIL_SECRET)
  if (!verified) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  const mail = await readInboundMail(verified, env.RESEND_API_KEY)
  if (mail === 'retry') return NextResponse.json({ error: 'upstream unavailable, retry later' }, { status: 503 })
  if (!mail) return NextResponse.json({ ok: true, status: 'ignored' })
  try {
    if (isReplyInboxMail(mail)) return NextResponse.json({ ok: true, ...(await handleSequenceReply(mail, systemDb)) })
    const outcome = await handleInboundEmail(mail)
    return NextResponse.json({ ok: true, ...outcome })
  } catch (error) {
    console.error('[inbound email] failed', error)
    return NextResponse.json({ error: 'could not create the task' }, { status: 500 })
  }
}

type Verified = NonNullable<ReturnType<typeof verifyInbound>>

/** The mail in the event, null to ignore it, or 'retry' when Resend's API failed for a passing reason. */
async function readInboundMail(verified: Verified, resendApiKey: string) {
  if (verified.provider !== 'resend') return fromGenericBody(verified.body)
  try {
    return await fromResend(verified.body, resendApiKey)
  } catch (error) {
    if (!(error instanceof InboundUpstreamError)) throw error
    console.error('[inbound email] Resend receiving API failed; asking Resend to retry', error.status)
    return 'retry' as const
  }
}
