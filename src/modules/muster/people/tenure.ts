import { daysBetween } from '@/lib/dates'

/**
 * Length of service (pure), exact to the day. A month is complete on the same
 * date of a later month, or on that month's last day when it is shorter
 * (joined 31 Jan → one month on 28/29 Feb; joined 29 Feb → one year on
 * 28 Feb). Months are counted from the joining date, never chained.
 */

/** The same day `n` months later (or earlier, for negative n), clamped to the month's last day. */
export function addMonthsClamped(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const index = y * 12 + (m - 1) + n
  const year = Math.floor(index / 12)
  const month = index - year * 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export type Service = { years: number; months: number; days: number; completedMonths: number; totalDays: number }

/** Completed years, months and days from `from` (the joining date) to `until`. */
export function completedService(from: string, until: string): Service {
  if (until <= from) return { years: 0, months: 0, days: 0, completedMonths: 0, totalDays: 0 }
  const [fy, fm] = from.split('-').map(Number)
  const [uy, um] = until.split('-').map(Number)
  let completed = (uy - fy) * 12 + (um - fm)
  if (addMonthsClamped(from, completed) > until) completed -= 1
  return {
    years: Math.floor(completed / 12),
    months: completed % 12,
    days: daysBetween(addMonthsClamped(from, completed), until),
    completedMonths: completed,
    totalDays: daysBetween(from, until),
  }
}

const unit = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '')

/** "2 years 2 months"; under a month, days ("19 days"). */
export function formatService(s: Service): string {
  if (!s.completedMonths) return s.totalDays ? unit(s.totalDays, 'day') : 'Under a day'
  return [unit(s.years, 'year'), unit(s.months, 'month')].filter(Boolean).join(' ')
}
