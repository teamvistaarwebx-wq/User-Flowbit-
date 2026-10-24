import { DEFAULT_OFFICE_HOURS, DEFAULT_WORK_WEEK } from '@/lib/attendance-core'
import { addDays, istInstant, isoDateIST, minutesOfDayIST, parseHHMM, weekday } from '@/lib/dates'
import { isQuietAt, quietEndsAt } from '@/modules/messaging/timing'
import type { QuietHours } from '@/modules/messaging/preferences'
import type { RunSubject, Trigger } from './types'

/**
 * When an automation runs, and which records a time trigger covers (pure).
 * Wall-clock times are IST.
 */

const MINUTE_MS = 60_000

/** Business hours: the default workday's office hours, Monday to Saturday, 10:00–19:00 IST (lib/attendance-core, B27). */
export const BUSINESS_HOURS = { start: DEFAULT_OFFICE_HOURS.start, end: DEFAULT_OFFICE_HOURS.end, days: DEFAULT_WORK_WEEK }

const START_MINUTE = parseHHMM(BUSINESS_HOURS.start)
const END_MINUTE = parseHHMM(BUSINESS_HOURS.end)

/** `at` itself when inside business hours, else the next opening (10:00 of the next working day). */
export function nextBusinessTime(at: Date): Date {
  const day = isoDateIST(at)
  const minute = minutesOfDayIST(at)
  const isWorkday = BUSINESS_HOURS.days.includes(weekday(day))
  if (isWorkday && minute >= START_MINUTE && minute < END_MINUTE) return at
  if (isWorkday && minute < START_MINUTE) return istInstant(day, BUSINESS_HOURS.start)
  let next = addDays(day, 1)
  while (!BUSINESS_HOURS.days.includes(weekday(next))) next = addDays(next, 1)
  return istInstant(next, BUSINESS_HOURS.start)
}

export type PlanInput = Readonly<{
  now: Date
  delayMinutes: number
  businessHoursOnly: boolean
  /** The workspace's quiet hours when the rule messages a client; null when it only alerts people (their own settings apply). */
  quiet: QuietHours | null
}>

/** The delay, then business hours, then the end of quiet hours. */
export function planRunAt({ now, delayMinutes, businessHoursOnly, quiet }: PlanInput): Date {
  const delayed = new Date(now.getTime() + Math.max(0, delayMinutes) * MINUTE_MS)
  const business = businessHoursOnly ? nextBusinessTime(delayed) : delayed
  return quiet && isQuietAt(business, quiet) ? quietEndsAt(business, quiet) : business
}

/** Once per record per rule: a repeat on the same record (same payment, same month) is a duplicate. */
export const dedupeKeyFor = (ruleId: string, subject: Pick<RunSubject, 'entity' | 'entityId' | 'occurrence'>): string =>
  `${ruleId}:${subject.entity}:${subject.entityId}:${subject.occurrence ?? 'once'}`

/** A contact who already had `cap` automated messages today gets no more (0 = no cap). */
export const isCapReached = (sentToday: number, cap: number): boolean => cap > 0 && sentToday >= cap

/** Days back a daily scan still catches a date it missed (a cron outage), once per record. */
export const DAY_LOOKBACK = 3
const LOOKBACK_MS: Readonly<Record<'minutes' | 'hours', number>> = { minutes: 15 * MINUTE_MS, hours: 72 * 60 * MINUTE_MS }

export type DateWindow =
  | Readonly<{ unit: 'days'; from: string; to: string }>
  | Readonly<{ unit: 'minutes' | 'hours'; fromAt: Date; toAt: Date }>

/**
 * The records a date trigger covers now: their date + offset has come.
 * A negative offset ("2 days before expiry", "15 minutes before the meeting")
 * never reaches a date already past.
 */
export function dateWindow(trigger: Pick<Trigger, 'offset' | 'unit'>, now: Date): DateWindow {
  const offset = trigger.offset ?? 0
  const unit = trigger.unit ?? 'days'
  if (unit === 'days') {
    const today = isoDateIST(now)
    const to = addDays(today, -offset)
    const from = addDays(to, -DAY_LOOKBACK)
    return { unit, from: offset < 0 && from < today ? today : from, to }
  }
  const toAt = new Date(now.getTime() - offset * (unit === 'hours' ? 60 : 1) * MINUTE_MS)
  const back = new Date(toAt.getTime() - LOOKBACK_MS[unit])
  return { unit, fromAt: offset < 0 && back < now ? now : back, toAt }
}

/**
 * The occurrence key of a schedule that is due now ('2026-10' monthly,
 * '2026-10-08' daily, the week's date weekly), or null: not today, not yet
 * time, or already run for this occurrence.
 */
export function scheduleOccurrence(trigger: Pick<Trigger, 'frequency' | 'day' | 'time'>, now: Date, lastOccurrence: string | null | undefined): string | null {
  const today = isoDateIST(now)
  const [hh, mm] = (trigger.time ?? '09:00').split(':').map(Number)
  if (minutesOfDayIST(now) < hh * 60 + mm) return null
  const frequency = trigger.frequency ?? 'daily'
  if (frequency === 'monthly' && Number(today.slice(8, 10)) !== (trigger.day ?? 1)) return null
  if (frequency === 'weekly' && weekday(today) !== (trigger.day ?? 1)) return null
  const key = frequency === 'monthly' ? today.slice(0, 7) : today
  return key === lastOccurrence ? null : key
}

const HOURLY_SCAN_EVERY_MS = 30 * MINUTE_MS
/** Day-based rules scan once a day, from 09:00 IST, so client mail lands in the daytime. */
const DAILY_SCAN_FROM_MINUTE = 9 * 60

/** True when a time rule should scan now: minute rules every cron run, hour rules every 30 minutes, day rules once a day. */
export function scanDue(trigger: Pick<Trigger, 'type' | 'unit'>, lastScanAt: Date | null | undefined, now: Date): boolean {
  if (trigger.type === 'schedule') return true
  const unit = trigger.unit ?? 'days'
  if (unit === 'minutes') return true
  if (unit === 'hours') return !lastScanAt || now.getTime() - lastScanAt.getTime() >= HOURLY_SCAN_EVERY_MS
  return minutesOfDayIST(now) >= DAILY_SCAN_FROM_MINUTE && (!lastScanAt || isoDateIST(lastScanAt) !== isoDateIST(now))
}
