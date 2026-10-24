/** IST date ranges for Orbit queries and the reports range picker. Pure. */
import { addDays, dayBoundsIST, monthOf, monthRange, shiftMonth, todayIST } from '@/lib/dates'

/** [start, end) instants covering IST days `from`..`to` inclusive. */
export function istRange(from: string, to: string): { start: Date; end: Date } {
  return { start: dayBoundsIST(from).start, end: dayBoundsIST(to).end }
}

export const REPORT_RANGES = ['7d', '30d', '90d', 'month', 'last_month', 'all', 'custom'] as const
export type ReportRange = (typeof REPORT_RANGES)[number]
export const RANGE_LABEL: Record<ReportRange, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', month: 'This month', last_month: 'Last month', all: 'All time', custom: 'Custom' }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const EPOCH = '2000-01-01'
/** A real calendar day in YYYY-MM-DD ('2026-02-30' is refused). */
export const isRealDate = (d: string) => ISO.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d

/** Resolves `?range=&from=&to=` into IST dates (inclusive). */
export function resolveRange(range: string | undefined, from?: string, to?: string, today: string = todayIST()): { range: ReportRange; from: string; to: string } {
  const r = (REPORT_RANGES as readonly string[]).includes(range ?? '') ? (range as ReportRange) : '30d'
  if (r === '7d') return { range: r, from: addDays(today, -6), to: today }
  if (r === '90d') return { range: r, from: addDays(today, -89), to: today }
  if (r === 'month') return { range: r, from: monthRange(monthOf(today)).start, to: today }
  if (r === 'last_month') {
    const m = monthRange(shiftMonth(monthOf(today), -1))
    return { range: r, from: m.start, to: m.end }
  }
  if (r === 'all') return { range: r, from: EPOCH, to: today }
  if (r === 'custom' && from && to && isRealDate(from) && isRealDate(to) && from <= to) return { range: r, from, to }
  return { range: '30d', from: addDays(today, -29), to: today }
}
