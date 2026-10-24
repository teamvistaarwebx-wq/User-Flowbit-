import type { MessageStatus } from './types'

/**
 * Provider callbacks → message status (pure). Resend posts email.sent,
 * email.delivered, email.bounced, email.complained, email.opened…; the status
 * only moves forward (a late "delivered" never undoes "read"), a bounce marks
 * it failed, and a bounce or complaint also suppresses the address for
 * non-essential mail.
 */

export type ProviderEvent = Readonly<{ status: MessageStatus | null; note: string; suppress?: 'bounced' | 'complained' }>

const RESEND_EVENTS: Readonly<Record<string, ProviderEvent>> = {
  'email.sent': { status: 'sent', note: 'Resend accepted it' },
  'email.delivered': { status: 'delivered', note: 'Delivered to the inbox server' },
  'email.delivery_delayed': { status: null, note: 'Delivery delayed; the provider keeps trying' },
  'email.opened': { status: 'read', note: 'Opened' },
  'email.clicked': { status: 'read', note: 'A link was clicked' },
  'email.bounced': { status: 'failed', note: 'Bounced', suppress: 'bounced' },
  'email.complained': { status: null, note: 'Marked as spam by the recipient', suppress: 'complained' },
}

export const resendEvent = (type: string): ProviderEvent | null => RESEND_EVENTS[type] ?? null

const RANK: Readonly<Partial<Record<MessageStatus, number>>> = { scheduled: 0, queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 }

/** True when a callback may move the message from `current` to `next`. */
export function canAdvance(current: MessageStatus, next: MessageStatus): boolean {
  if (current === next || current === 'skipped') return false
  if (next === 'failed') return current !== 'failed' && current !== 'read'
  if (current === 'failed') return false
  return (RANK[next] ?? -1) > (RANK[current] ?? -1)
}

/**
 * A "failed" tick refunds the wallet only before delivery: a workspace signs
 * its own webhook, so a forged "failed" for a delivered message must not
 * return the charge (V2-REVIEW P1).
 */
export const refundsOnFailure = (current: MessageStatus): boolean => (RANK[current] ?? 99) <= (RANK.sent ?? 2)

/** Mail kinds the recipient may unsubscribe from. Everything else (security, invoices sent by hand, payslips…) is essential. */
export const NON_ESSENTIAL_KINDS: readonly string[] = ['alert', 'digest', 'brief', 'onboarding', 'automation']
export const isEssentialKind = (kind: string | null | undefined): boolean => !NON_ESSENTIAL_KINDS.includes(kind ?? 'other')
