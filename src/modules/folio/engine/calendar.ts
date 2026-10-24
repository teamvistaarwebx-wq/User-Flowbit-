/**
 * Calendar helpers that never touch the host time zone (port of BillingOS
 * `lib/dates.ts`). Everything works on UTC midnights and 'YYYY-MM-DD'
 * strings; never `new Date('YYYY-MM-DD')` read with local getters.
 */

export type IsoDate = string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date: 2026-02-30 is refused (Date.parse would roll it into March). */
export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

export function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Expected an ISO date (YYYY-MM-DD), received "${value}"`)
  return new Date(`${value}T00:00:00Z`)
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

export function makeIsoDate(year: number, month: number, day: number): IsoDate {
  return toIsoDate(new Date(Date.UTC(year, month - 1, day)))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const next = parseIsoDate(date)
  next.setUTCDate(next.getUTCDate() + days)
  return toIsoDate(next)
}
