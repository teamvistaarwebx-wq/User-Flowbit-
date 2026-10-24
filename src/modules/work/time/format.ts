import { isoDateIST } from '@/lib/dates'

/** Pure time formatting and parsing for timers and timesheets. */

export const MAX_DAY_MINUTES = 1440
/** A timer stopped after this long (10 h), or on a later day, asks before logging. */
export const LONG_TIMER_MINUTES = 600

/** "02:05:03" from seconds (timer display). */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** "1:30" from minutes (timesheet cells); blank for 0. */
export function formatHM(minutes: number, blankZero = false): string {
  const m = Math.max(0, Math.round(minutes))
  if (blankZero && m === 0) return ''
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** "2.08" decimal hours (CSV). */
export const hoursDecimal = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toFixed(2)

/**
 * Minutes from what people type: "1h 30m", "90m", "1:30", "1.5" (hours), "2h", "45m".
 * Returns null when it can't be read or is over a day.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!text) return 0
  let minutes: number | null = null
  const colon = /^(\d{1,2}):([0-5]?\d)$/.exec(text)
  const units = /^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:s|utes?)?)?)?$/.exec(text)
  if (colon) minutes = Number(colon[1]) * 60 + Number(colon[2])
  else if (/^\d+(\.\d+)?$/.test(text)) minutes = Math.round(Number(text) * 60)
  else if (units && (units[1] || units[2])) minutes = Math.round(Number(units[1] ?? 0) * 60) + Number(units[2] ?? 0)
  if (minutes === null || !Number.isFinite(minutes) || minutes > MAX_DAY_MINUTES) return null
  return minutes
}

/** Timer minutes from start to stop, rounded to the nearest minute, at least 1. */
export function timerMinutes(startedAt: Date, endedAt: Date): number {
  const seconds = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1000)
  return Math.min(MAX_DAY_MINUTES, Math.max(1, Math.round(seconds / 60)))
}

/** True when a timer ran over 10 h or past IST midnight: likely forgotten, so stopping asks first. */
export function isLongTimer(startedAt: Date, endedAt: Date): boolean {
  const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000
  return minutes > LONG_TIMER_MINUTES || isoDateIST(startedAt) !== isoDateIST(endedAt)
}

/** Minutes still free on a day that already has `loggedMinutes` (a day holds at most 24 h). */
export function dayRoom(loggedMinutes: number): number {
  return Math.max(0, MAX_DAY_MINUTES - loggedMinutes)
}
