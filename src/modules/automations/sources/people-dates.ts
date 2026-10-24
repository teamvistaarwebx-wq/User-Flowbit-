import { addDays } from '@/lib/dates'

/**
 * Yearly dates for the People recipes (pure): which birthdays and work
 * anniversaries fall in a scan window. A 29 February date is celebrated on
 * 28 February in other years.
 */

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** Every ISO date from `from` to `to` (inclusive), at most 31 of them. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 31; d = addDays(d, 1)) out.push(d)
  return out
}

/** 'MM-DD' keys a stored date may carry to fall on one of these days. */
export function monthDayKeys(dates: readonly string[]): string[] {
  const keys = new Set<string>()
  for (const d of dates) {
    keys.add(d.slice(5))
    if (d.slice(5) === '02-28' && !isLeap(Number(d.slice(0, 4)))) keys.add('02-29')
  }
  return [...keys]
}

/** The day in the window this yearly date falls on, or null. */
export function occurrenceIn(stored: string, dates: readonly string[]): string | null {
  const md = stored.slice(5)
  return dates.find((d) => d.slice(5) === md || (md === '02-29' && d.slice(5) === '02-28' && !isLeap(Number(d.slice(0, 4))))) ?? null
}

/** Completed years at an anniversary date (0 on the joining day itself). */
export const yearsAt = (joinDate: string, on: string): number => Number(on.slice(0, 4)) - Number(joinDate.slice(0, 4))
