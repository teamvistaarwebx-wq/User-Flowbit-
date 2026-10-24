import 'server-only'
import { Message } from '@/models/messaging/Message'
import { canAdvance, resendEvent } from './delivery-status'
import { optOut } from './suppression-store'
import type { MessageStatus } from './types'

/**
 * Applies one verified Resend webhook delivery to its message: status (only
 * forward), a timeline entry, and for a hard bounce or a spam complaint a
 * suppression of the address for this workspace's non-essential mail.
 */

export type ResendWebhook = Readonly<{
  type?: string
  created_at?: string
  data?: Readonly<{ email_id?: string; to?: readonly string[]; bounce?: Readonly<{ type?: string; message?: string }> }>
}>

export type WebhookOutcome = 'applied' | 'ignored' | 'unknown_message'

export async function applyResendEvent(event: ResendWebhook): Promise<WebhookOutcome> {
  const mapped = event.type ? resendEvent(event.type) : null
  const providerId = event.data?.email_id
  if (!mapped || !providerId) return 'ignored'
  const message = await Message.findOne({ provider: 'resend', providerId }, { status: 1, orgId: 1, to: 1 }).lean()
  if (!message) return 'unknown_message'
  const at = event.created_at ? new Date(event.created_at) : new Date()
  const when = Number.isNaN(at.getTime()) ? new Date() : at
  const transientBounce = event.type === 'email.bounced' && /transient/i.test(event.data?.bounce?.type ?? '')
  const next: MessageStatus | null = transientBounce ? null : mapped.status
  const advance = next !== null && canAdvance(message.status as MessageStatus, next)
  const note = [mapped.note, event.data?.bounce?.message].filter(Boolean).join(': ')
  await Message.updateOne(
    { _id: message._id },
    {
      ...(advance ? { $set: { status: next, ...(next === 'failed' ? { error: note } : {}) } } : {}),
      $push: { timeline: { at: when, status: advance && next ? next : (message.status as MessageStatus), note } },
    },
  )
  if (mapped.suppress && !transientBounce && message.orgId) {
    const recipients = event.data?.to?.length ? event.data.to : message.to
    for (const address of recipients) {
      await optOut({ orgId: message.orgId, channel: 'email', address, source: mapped.suppress === 'bounced' ? 'bounce' : 'complaint', note })
    }
  }
  return 'applied'
}
