import { addDays, istInstant, isoDateIST } from '@/lib/dates'

/**
 * Leave days and holidays (notifications-v2 §5, pure): a non-urgent alert
 * that would reach someone on approved leave or a company holiday waits for
 * their first day back, at the start of the morning. The bell still shows it
 * at once; urgent groups (security) always go.
 */

export const BACK_AT = '09:00'
const MAX_DAYS_AHEAD = 60

/** When to send instead of now, or null when today is a working day for this person. */
export function holdUntil(now: Date, offDates: ReadonlySet<string>, backAt = BACK_AT): Date | null {
  const today = isoDateIST(now)
  if (!offDates.has(today)) return null
  let day = today
  for (let i = 0; i < MAX_DAYS_AHEAD && offDates.has(day); i += 1) day = addDays(day, 1)
  return istInstant(day, backAt)
}

/** The days off of one person: their approved leave dates plus the company holidays. */
export const offDatesOf = (leaveDates: readonly string[], holidays: readonly string[]): Set<string> => new Set([...leaveDates, ...holidays])
