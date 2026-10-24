import { IST_OFFSET_MINUTES, addDays, isoDateIST, istInstant, minutesOfDayIST, parseHHMM } from '@/lib/dates'
import type { EventGroup } from './events'
import type { DigestMode, QuietHours } from './preferences'

/**
 * When an alert email goes out (pure). Quiet hours, digests and snooze apply
 * to email (and later WhatsApp); the in-app bell is silent and always lands.
 * All wall-clock times are IST.
 */

const HOUR_MS = 3_600_000
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000

/** End-of-day digests go out at this IST time. */
export const DAILY_DIGEST_TIME = '18:00'

/** True when `at` falls inside quiet hours. Overnight windows (21:00–08:00) wrap past midnight. */
export function isQuietAt(at: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false
  const start = parseHHMM(quiet.start)
  const end = parseHHMM(quiet.end)
  if (start === end) return false
  const minute = minutesOfDayIST(at)
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

/** The first instant at or after `at` when quiet hours are over (for an `at` inside them). */
export function quietEndsAt(at: Date, quiet: QuietHours): Date {
  const day = isoDateIST(at)
  const endToday = istInstant(day, quiet.end)
  return endToday.getTime() > at.getTime() ? endToday : istInstant(addDays(day, 1), quiet.end)
}

/** The next digest slot strictly after `at`: the next top of the IST hour, or today's (else tomorrow's) end-of-day time. */
export function nextDigestAt(at: Date, mode: Exclude<DigestMode, 'off'>): Date {
  if (mode === 'hourly') return new Date((Math.floor((at.getTime() + IST_OFFSET_MS) / HOUR_MS) + 1) * HOUR_MS - IST_OFFSET_MS)
  const day = isoDateIST(at)
  const today = istInstant(day, DAILY_DIGEST_TIME)
  return today.getTime() > at.getTime() ? today : istInstant(addDays(day, 1), DAILY_DIGEST_TIME)
}

export type EmailPlan =
  | Readonly<{ kind: 'now' }>
  | Readonly<{ kind: 'digest'; at: Date; reason: 'digest' | 'quiet_hours' }>
  | Readonly<{ kind: 'skip'; reason: 'snoozed' }>

export type EmailPlanInput = Readonly<{
  now: Date
  group: Pick<EventGroup, 'urgent' | 'emailMode'>
  digest: DigestMode
  quiet: QuietHours | null
  snoozeUntil: Date | null
}>

/**
 * Plans one alert email: urgent groups go now; snoozed people get nothing
 * (the bell still has it); otherwise a digest slot (the person's digest mode,
 * or the group's own, e.g. comments hourly) or now, moved to the end of quiet
 * hours when it would land inside them. Anything held back is batched.
 */
export function planEmail({ now, group, digest, quiet, snoozeUntil }: EmailPlanInput): EmailPlan {
  if (group.urgent) return { kind: 'now' }
  if (snoozeUntil && snoozeUntil.getTime() > now.getTime()) return { kind: 'skip', reason: 'snoozed' }
  const mode = digest !== 'off' ? digest : group.emailMode === 'hourly' ? 'hourly' : null
  const slot = mode ? nextDigestAt(now, mode) : null
  if (slot) return { kind: 'digest', at: quiet && isQuietAt(slot, quiet) ? quietEndsAt(slot, quiet) : slot, reason: 'digest' }
  if (quiet && isQuietAt(now, quiet)) return { kind: 'digest', at: quietEndsAt(now, quiet), reason: 'quiet_hours' }
  return { kind: 'now' }
}

/** Retry schedule after a failed send: 1 m, 5 m, 30 m, 2 h, then the message is marked failed. */
export const RETRY_DELAYS_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 2 * HOUR_MS]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/** When to try again after `attempts` failed attempts, or null when retries are used up. */
export function nextRetryAt(attempts: number, now: Date): Date | null {
  const delay = attempts >= 1 ? RETRY_DELAYS_MS[attempts - 1] : undefined
  return delay === undefined ? null : new Date(now.getTime() + delay)
}

/** Snooze presets offered in Profile → Notifications. */
export type SnoozePreset = '1h' | 'today' | 'date'

/** The instant a snooze ends: in an hour, at the end of today (IST), or at the start of the chosen day. */
export function snoozeUntil(preset: SnoozePreset, now: Date, date?: string): Date {
  if (preset === '1h') return new Date(now.getTime() + HOUR_MS)
  if (preset === 'today') return istInstant(addDays(isoDateIST(now), 1))
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date to snooze until.')
  return istInstant(date)
}
