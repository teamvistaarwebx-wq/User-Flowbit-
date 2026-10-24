import { addDays, daysBetween, eachDay, formatDate, weekday } from '@/lib/dates'

/** Leave day arithmetic (pure). */

export type Calendar = { workWeek: readonly number[]; holidays: readonly string[] }

/** Dates in the range that cost leave: not weekly offs, not company holidays. */
export function leaveDates(start: string, end: string, cal: Calendar): string[] {
  if (end < start) return []
  const off = new Set(cal.holidays)
  return eachDay(start, end).filter((d) => cal.workWeek.includes(weekday(d)) && !off.has(d))
}

/** Days of leave a request costs; 0.5 for a half day on a working day. */
export function computeLeaveDays(start: string, end: string, isHalfDay: boolean, cal: Calendar): number {
  const dates = leaveDates(start, end, cal)
  if (!dates.length) return 0
  return isHalfDay ? 0.5 : dates.length
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Splits requested days into what the balance pays for and the loss-of-pay
 * remainder. A request of whole days is paid in whole days: each date is
 * either paid or loss of pay (see unpaidDatesOf), so a balance of 2.5 pays 2
 * dates and keeps the half day, instead of charging that half to both.
 */
export function splitAgainstBalance(requested: number, available: number): { paid: number; unpaid: number } {
  const covered = Math.min(requested, Math.max(0, available))
  const paid = r2(Number.isInteger(requested) ? Math.floor(covered) : covered)
  return { paid, unpaid: r2(requested - paid) }
}

/**
 * Which dated days are paid: the first `paidDays` dates are paid, the rest are
 * loss of pay. A half day is one date.
 */
export function unpaidDatesOf(dates: readonly string[], paidDays: number, isHalfDay: boolean): string[] {
  if (isHalfDay) return paidDays >= 0.5 ? [] : [...dates]
  const paidWhole = Math.floor(paidDays)
  return dates.slice(paidWhole)
}

/** Why a leave range is not acceptable, or null. */
export function leaveRangeProblem(input: { start: string; end: string; isHalfDay: boolean; joinDate?: string | null; today: string }): { field: string; message: string } | null {
  const { start, end, isHalfDay, joinDate, today } = input
  if (start < '2000-01-01') return { field: 'startDate', message: 'Pick a real start date.' }
  if (end < start) return { field: 'endDate', message: 'The last day cannot be before the first day.' }
  if (isHalfDay && end !== start) return { field: 'isHalfDay', message: 'A half day starts and ends on the same date.' }
  if (joinDate && start < joinDate) return { field: 'startDate', message: `Leave cannot start before the day they joined, ${formatDate(joinDate)}.` }
  if (start > addDays(today, 366)) return { field: 'startDate', message: 'Leave can be planned up to a year ahead.' }
  if (daysBetween(start, end) > 366) return { field: 'endDate', message: 'One request can cover at most a year. Split it into two.' }
  return null
}

/** "5 Oct – 9 Oct 2026" or "5 Oct 2026 (half day)". */
export function leaveSpanLabel(start: string, end: string, isHalfDay: boolean): string {
  if (start === end) return `${formatDate(start)}${isHalfDay ? ' (half day)' : ''}`
  return `${formatDate(start, { short: start.slice(0, 4) === end.slice(0, 4) })} – ${formatDate(end)}`
}

export const daysLabel = (n: number) => `${n} day${n === 1 ? '' : 's'}`
