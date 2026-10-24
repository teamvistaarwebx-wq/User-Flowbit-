import { addDays, daysBetween, eachDay, formatDate, monthRange, shiftMonth, startOfWeek } from '@/lib/dates'

export const RANGE_PRESETS = ['this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'custom'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]
export const PRESET_LABELS: Record<RangePreset, string> = { this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', this_quarter: 'This quarter', custom: 'Custom' }
export const MAX_RANGE_DAYS = 366

export type DateRange = { preset: RangePreset; from: string; to: string }
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Resolves ?range=&from=&to= into dates (this month by default; custom ranges are clamped to a year). */
export function resolveRange(input: { range?: string; from?: string; to?: string }, today: string): DateRange {
  const preset = (RANGE_PRESETS as readonly string[]).includes(input.range ?? '') ? (input.range as RangePreset) : input.from || input.to ? 'custom' : 'this_month'
  if (preset === 'custom' && ISO.test(input.from ?? '') && ISO.test(input.to ?? '')) {
    const [from, to] = [input.from as string, input.to as string].sort()
    return { preset, from, to: daysBetween(from, to) > MAX_RANGE_DAYS ? addDays(from, MAX_RANGE_DAYS) : to }
  }
  const monday = startOfWeek(today)
  const month = today.slice(0, 7)
  switch (preset) {
    case 'this_week':
      return { preset, from: monday, to: addDays(monday, 6) }
    case 'last_week':
      return { preset, from: addDays(monday, -7), to: addDays(monday, -1) }
    case 'last_month': {
      const { start, end } = monthRange(shiftMonth(month, -1))
      return { preset, from: start, to: end }
    }
    case 'this_quarter': {
      const m = Number(month.slice(5, 7))
      const startMonth = `${month.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, '0')}`
      return { preset, from: monthRange(startMonth).start, to: monthRange(shiftMonth(startMonth, 2)).end }
    }
    default: {
      const { start, end } = monthRange(month)
      return { preset: 'this_month', from: start, to: end }
    }
  }
}

export type Bucket = { key: string; label: string; from: string; to: string }

/** Daily buckets up to 31 days, weekly (Monday) beyond. */
export function buckets(range: { from: string; to: string }): Bucket[] {
  if (daysBetween(range.from, range.to) <= 30) return eachDay(range.from, range.to).map((d) => ({ key: d, label: formatDate(d, { short: true }), from: d, to: d }))
  const out: Bucket[] = []
  for (let w = startOfWeek(range.from); w <= range.to; w = addDays(w, 7)) {
    const from = w < range.from ? range.from : w
    const end = addDays(w, 6)
    out.push({ key: w, label: formatDate(from, { short: true }), from, to: end > range.to ? range.to : end })
  }
  return out
}

/** Index of the bucket containing `day`, or -1. */
export const bucketOf = (list: Bucket[], day: string) => list.findIndex((b) => day >= b.from && day <= b.to)

export const AGING = [
  { key: '1-3', label: '1–3 days', min: 1, max: 3 },
  { key: '4-7', label: '4–7 days', min: 4, max: 7 },
  { key: '8-14', label: '8–14 days', min: 8, max: 14 },
  { key: '15+', label: '15+ days', min: 15, max: Infinity },
] as const

export const agingKey = (daysOverdue: number) => AGING.find((a) => daysOverdue >= a.min && daysOverdue <= a.max)?.key ?? '1-3'

/** Mean days from start (or creation) to completion, one decimal; null when nothing completed. */
export function avgCycleDays(tasks: { completedAt: Date; startedAt?: Date | null; createdAt: Date }[]): number | null {
  if (!tasks.length) return null
  const total = tasks.reduce((s, t) => s + (t.completedAt.getTime() - (t.startedAt ?? t.createdAt).getTime()) / 86_400_000, 0)
  return Math.round((total / tasks.length) * 10) / 10
}

/** Completed on or before the due date (IST day), as a percentage of completed tasks that had one. */
export function onTimePercent(tasks: { completedDay: string; dueDate?: string | null }[]): number | null {
  const withDue = tasks.filter((t) => t.dueDate)
  if (!withDue.length) return null
  return Math.round((withDue.filter((t) => t.completedDay <= (t.dueDate as string)).length / withDue.length) * 100)
}
