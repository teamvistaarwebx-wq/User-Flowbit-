import { addDays } from '@/lib/dates'
import { daysOverdue } from '@/modules/folio/engine/aging'

/**
 * Which automatic reminders are due (folio.md 6.14, port of
 * lib/reminders/schedule.ts). Pure. Folio change: when several offsets are
 * due for one invoice and channel, only the latest is sent; the older ones
 * come back flagged `skip` so the run logs them and never sends a burst.
 */

export const REMINDER_CHANNELS = ['email', 'whatsapp'] as const
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]

export type ReminderSettings = { enabled: boolean; offsetDays: readonly number[]; channels: readonly ReminderChannel[] }
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, offsetDays: [-3, 0, 7, 15, 30], channels: ['email'] }

export type ScheduleInvoice = { invoiceId: string; dueDate: string; balancePaise: number }
export type LoggedReminder = { invoiceId: string; channel: ReminderChannel; offsetDays: number }
export type DueReminder = { invoiceId: string; channel: ReminderChannel; offsetDays: number; scheduledFor: string; skip: boolean }

const keyOf = (invoiceId: string, channel: string) => `${invoiceId}|${channel}`

function loggedIndex(logged: readonly LoggedReminder[]): Map<string, number[]> {
  const index = new Map<string, number[]>()
  for (const l of logged) {
    const key = keyOf(l.invoiceId, l.channel)
    index.set(key, [...(index.get(key) ?? []), l.offsetDays])
  }
  return index
}

function dueForChannel(inv: ScheduleInvoice, channel: ReminderChannel, offsets: readonly number[], done: readonly number[], asOf: string): DueReminder[] {
  const latestDone = done.length ? Math.max(...done) : -Infinity
  const candidates = [...new Set(offsets)]
    .filter((o) => !done.includes(o))
    .map((o) => ({ offsetDays: o, scheduledFor: addDays(inv.dueDate, o) }))
    .filter((c) => c.scheduledFor <= asOf)
    .sort((a, b) => a.offsetDays - b.offsetDays)
  if (!candidates.length) return []
  const latest = candidates[candidates.length - 1]
  return candidates.map((c) => ({
    invoiceId: inv.invoiceId,
    channel,
    offsetDays: c.offsetDays,
    scheduledFor: c.scheduledFor,
    // An offset older than one already sent, or older than the latest due one, is never sent late.
    skip: c !== latest || c.offsetDays < latestDone,
  }))
}

/**
 * Reminders stop by themselves once an invoice is paid (notifications-v2 §0b.13):
 * only issued or part-paid invoices with money owed get one, and a WhatsApp
 * reminder still waiting in the queue is dropped once its invoice is settled.
 */
export const isRemindable = (inv: { status?: string | null; balancePaise?: number | null }): boolean => (inv.status === 'issued' || inv.status === 'part_paid') && (inv.balancePaise ?? 0) > 0

export function remindersDue(invoices: readonly ScheduleInvoice[], settings: ReminderSettings, logged: readonly LoggedReminder[], asOf: string): DueReminder[] {
  if (!settings.enabled || !settings.offsetDays.length || !settings.channels.length) return []
  const index = loggedIndex(logged)
  return invoices
    .filter((inv) => inv.balancePaise > 0)
    .flatMap((inv) => settings.channels.flatMap((channel) => dueForChannel(inv, channel, settings.offsetDays, index.get(keyOf(inv.invoiceId, channel)) ?? [], asOf)))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
}

export const REMINDER_TONES = ['advance_notice', 'due_today', 'polite', 'firm', 'final'] as const
export type ReminderTone = (typeof REMINDER_TONES)[number]

export const TONE_LABELS: Record<ReminderTone, string> = {
  advance_notice: 'Advance notice',
  due_today: 'Due today',
  polite: 'Gentle reminder',
  firm: 'Firm reminder',
  final: 'Final notice',
}

/** Tone from the actual days overdue at send time. */
export function toneFor(days: number): ReminderTone {
  if (days < 0) return 'advance_notice'
  if (days === 0) return 'due_today'
  if (days <= 15) return 'polite'
  if (days <= 45) return 'firm'
  return 'final'
}

export const toneForInvoice = (dueDate: string, asOf: string): ReminderTone => toneFor(daysOverdue(dueDate, asOf))
