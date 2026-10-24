import type { Tone } from '@/lib/status'
import { EVENT_GROUPS, type Channel } from './events'
import { SKIP_REASONS, type MessageStatus } from './types'

/** Labels for the Messages log (client-safe). */

export const CHANNEL_LABEL: Readonly<Record<Channel, string>> = { email: 'Email', inapp: 'In-app', whatsapp: 'WhatsApp' }

export const STATUS_META: Readonly<Record<MessageStatus, { label: string; tone: Tone }>> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'info' },
  sending: { label: 'Sending', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  delivered: { label: 'Delivered', tone: 'success' },
  read: { label: 'Opened', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'warning' },
}

export const statusMeta = (status: string, skipReason?: string | null): { label: string; tone: Tone } => {
  if (status === 'skipped' && skipReason === 'no_provider') return { label: 'Saved, not sent', tone: 'warning' }
  if (status === 'skipped' && skipReason === 'digest') return { label: 'In a digest', tone: 'neutral' }
  return STATUS_META[status as MessageStatus] ?? { label: status, tone: 'neutral' }
}

export const skipReasonLabel = (reason: string | null | undefined): string | null => (reason ? (SKIP_REASONS[reason as keyof typeof SKIP_REASONS] ?? reason) : null)

/** Mail kinds sent directly (not alerts). */
export const MAIL_KINDS = ['invite', 'password_reset', 'security', 'signup_otp', 'subscription', 'subscription_invoice', 'invoice', 'quote', 'statement', 'payslip', 'letter', 'claim_otp', 'onboarding', 'reminder', 'contact', 'digest', 'brief', 'automation', 'portal', 'meeting', 'other'] as const

const KIND_LABEL: Readonly<Record<string, string>> = { signup_otp: 'Signup code', claim_otp: 'Claim code', subscription_invoice: 'Flowbit invoice', portal: 'Client portal', meeting: 'Meeting notice', other: 'Other email' }

export const kindLabel = (kind: string): string => KIND_LABEL[kind] ?? (kind.charAt(0).toUpperCase() + kind.slice(1)).replace(/_/g, ' ')

/** The "Type" filter: alert groups ('g:approvals') and direct mail kinds ('k:invoice'). */
export function typeOptions(hiddenKinds: readonly string[]): { value: string; label: string }[] {
  return [
    ...EVENT_GROUPS.map((g) => ({ value: `g:${g.key}`, label: `Alert: ${g.label}` })),
    ...MAIL_KINDS.filter((k) => !hiddenKinds.includes(k)).map((k) => ({ value: `k:${k}`, label: kindLabel(k) })),
  ]
}

/** Turns a "Type" filter value into a Message query. */
export function typeFilter(value: string | null | undefined): Record<string, string> {
  if (!value) return {}
  if (value.startsWith('g:')) return { group: value.slice(2) }
  if (value.startsWith('k:')) return { kind: value.slice(2) }
  return {}
}
