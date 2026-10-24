import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { gmailSend } from '@/modules/google/client'
import { accessTokenFor } from '@/modules/google/connections'
import { enqueue, unsubscribeHeaders, unsubscribeUrl } from '@/modules/messaging/send'
import { buildMime } from './mime'
import { emailParts } from './rules'
import { replyAddressFor } from './replies'

/**
 * Sends one sequence email: from the sender's own Gmail when they connected
 * it (gmail.send only), otherwise through Flowbit's mail (Resend) with
 * Reply-To set to the sender. When inbound email is set up, both also copy the
 * enrolment's reply address on Reply-To, so a reply stops the sequence. Both carry the unsubscribe link and the RFC 8058
 * List-Unsubscribe headers. Suppression is checked by the runner first.
 */

export type SequenceEmail = Readonly<{
  orgId: Types.ObjectId
  senderId: Types.ObjectId
  senderEmail: string
  to: string
  subject: string
  body: string
  leadId: Types.ObjectId
  enrollmentId: Types.ObjectId
  stepIndex: number
}>

/** Replies go to the salesperson and, when inbound email is set up, the enrolment's own reply address too (a reply there stops this sequence). */
const replyToHeader = (sender: string, inbox: string | null | undefined): Record<string, string> => {
  const list = [sender, inbox].filter((v): v is string => Boolean(v))
  return list.length ? { 'Reply-To': list.join(', ') } : {}
}

export type SendResult = { ok: true; via: 'gmail' | 'resend'; threadId?: string } | { ok: false; via: 'gmail' | 'resend'; error: string }

export async function sendSequenceEmail(scope: Pick<Ctx, 'db'>, mail: SequenceEmail): Promise<SendResult> {
  const { html, text } = emailParts(mail.body, unsubscribeUrl(mail.orgId, mail.to))
  const listHeaders = unsubscribeHeaders(mail.orgId, mail.to)
  const inbox = replyAddressFor(mail.enrollmentId)
  const token = await accessTokenFor(scope, mail.senderId, 'gmail')
  if (token) {
    try {
      const sent = await gmailSend(token, buildMime({ to: mail.to, subject: mail.subject, html, text, headers: { ...listHeaders, ...(inbox ? replyToHeader(mail.senderEmail, inbox) : {}) } }))
      return { ok: true, via: 'gmail', ...(sent.threadId ? { threadId: sent.threadId } : {}) }
    } catch (error) {
      return { ok: false, via: 'gmail', error: error instanceof Error ? error.message : 'Gmail did not accept the email' }
    }
  }
  const result = await enqueue({
    channel: 'email',
    to: mail.to,
    orgId: mail.orgId,
    memberId: mail.senderId,
    kind: 'sequence',
    essential: false,
    event: 'orbit.sequence_email',
    entity: 'Lead',
    entityId: mail.leadId,
    subject: mail.subject,
    html,
    text,
    headers: { ...listHeaders, ...replyToHeader(mail.senderEmail, inbox) },
    dedupeKey: `seq:${String(mail.enrollmentId)}:${mail.stepIndex}`,
  })
  // Queued for a retry is the messages cron's job now; the dedupe key stops a second copy.
  if (result.ok || result.status === 'queued') return { ok: true, via: 'resend' }
  return { ok: false, via: 'resend', error: result.error ?? 'The email could not be sent' }
}
