import { addDays, daysBetween, formatDate, minutesOfDayIST, parseHHMM, startOfWeek } from '@/lib/dates'
import { addMonthsClamped } from '../people/tenure'
import type { Cell } from './register'

/**
 * Attendance over a range of days (pure), like a stock chart: Today shows
 * check-ins by the hour, 1M by day, 6M and 1Y by week, Custom picks the
 * bucket from its length. The figures and the line follow the same range.
 */

export const RANGE_KEYS = ['today', '1m', '6m', '1y', 'custom'] as const
export type RangeKey = (typeof RANGE_KEYS)[number]
export const RANGE_LABEL: Record<RangeKey, string> = { today: 'Today', '1m': '1M', '6m': '6M', '1y': '1Y', custom: 'Custom' }

/** A custom range covers at most a year and a day. */
export const MAX_RANGE_DAYS = 366
const DAILY_UP_TO = 62
const WEEKLY_UP_TO = 200

export type Bucket = 'hour' | 'day' | 'week' | 'month'
export type ResolvedRange = { key: RangeKey; start: string; end: string; bucket: Bucket; problem?: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isRealDate = (v: string | undefined): v is string => Boolean(v && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v))

/** The same day `n` months earlier, clamped to the month's last day (31 Mar − 1 month = 28/29 Feb). */
export const minusMonths = (iso: string, n: number): string => addMonthsClamped(iso, -n)

const bucketFor = (days: number): Bucket => (days <= DAILY_UP_TO ? 'day' : days <= WEEKLY_UP_TO ? 'week' : 'month')
const trailing = (key: RangeKey, today: string, months: number, bucket: Bucket): ResolvedRange => ({ key, start: addDays(minusMonths(today, months), 1), end: today, bucket })

/** Reads `?range=&from=&to=`; anything unreadable falls back to the last month, with a note saying why. */
export function resolveRange(input: { range?: string; from?: string; to?: string }, today: string): ResolvedRange {
  const key = (RANGE_KEYS as readonly string[]).includes(input.range ?? '') ? (input.range as RangeKey) : '1m'
  if (key === 'today') return { key, start: today, end: today, bucket: 'hour' }
  if (key === '6m') return trailing(key, today, 6, 'week')
  if (key === '1y') return trailing(key, today, 12, 'week')
  if (key === '1m') return trailing(key, today, 1, 'day')
  if (!isRealDate(input.from) || !isRealDate(input.to)) return { ...trailing('1m', today, 1, 'day'), problem: 'Pick a start and an end date for a custom range.' }
  let [start, end] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from]
  let problem: string | undefined
  if (end > today) {
    end = today
    problem = 'The range stops today; attendance after today has not happened yet.'
  }
  if (start > end) return { ...trailing('1m', today, 1, 'day'), problem: 'That range is entirely in the future.' }
  if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) {
    start = addDays(end, -(MAX_RANGE_DAYS - 1))
    problem = `A custom range covers at most ${MAX_RANGE_DAYS} days, so it starts on ${formatDate(start)}.`
  }
  return { key, start, end, bucket: bucketFor(daysBetween(start, end) + 1), problem }
}

export type Tally = {
  /** Person-days that were working days (holidays, week offs, upcoming and not-yet-joined days excluded). */
  personDays: number
  present: number
  late: number
  absent: number
  onLeave: number
  wfh: number
  halfDays: number
  /** Share of person-days attended, 0–100 with one decimal (half days count half). */
  presentPct: number
}

const ATTENDED: Partial<Record<Cell['status'], number>> = { present: 1, late: 1, on_duty: 1, work_from_home: 1, half_day: 0.5, paid_half_day: 0.5 }
const SKIPPED = new Set<Cell['status']>(['na', 'upcoming', 'holiday', 'weekoff'])
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

function emptyTally(): Tally {
  return { personDays: 0, present: 0, late: 0, absent: 0, onLeave: 0, wfh: 0, halfDays: 0, presentPct: 0 }
}

/** How much of a working day a cell attended (0–1), or null when the day does not count. */
const weigh = (c: Cell): number | null => (SKIPPED.has(c.status) ? null : (ATTENDED[c.status] ?? 0))

function add(t: Tally, c: Cell): number {
  const weight = weigh(c)
  if (weight === null) return 0
  t.personDays += 1
  if (c.status === 'present' || c.status === 'on_duty') t.present += 1
  else if (c.status === 'late') t.late += 1
  else if (c.status === 'absent') t.absent += 1
  else if (c.status === 'leave' || c.status === 'sick_leave' || c.status === 'lop') t.onLeave += 1
  else if (c.status === 'work_from_home') t.wfh += 1
  else if (c.status === 'half_day' || c.status === 'paid_half_day') t.halfDays += 1
  return weight
}

/** Figures for a set of cells (every person, every day in the range). */
export function tallyCells(cells: Iterable<Cell>): Tally {
  const t = emptyTally()
  let attended = 0
  for (const c of cells) attended += add(t, c)
  return { ...t, presentPct: pct(attended, t.personDays) }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const bucketKey = (date: string, bucket: Bucket): string => (bucket === 'week' ? startOfWeek(date) : bucket === 'month' ? date.slice(0, 7) : date)

const bucketLabel = (key: string, bucket: Bucket) =>
  bucket === 'month' ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}` : formatDate(key, { short: true })

export type Point = { label: string; value: number }

/** Present % per day, week or month. Days with no working day in them (a Sunday, a holiday) are left out. */
export function presentSeries(rows: readonly { cells: readonly Cell[] }[], bucket: Exclude<Bucket, 'hour'>): Point[] {
  const order: string[] = []
  const totals = new Map<string, { personDays: number; attended: number }>()
  for (const row of rows) {
    for (const c of row.cells) {
      const weight = weigh(c)
      if (weight === null) continue
      const k = bucketKey(c.date, bucket)
      const entry = totals.get(k) ?? { personDays: 0, attended: 0 }
      if (!totals.has(k)) order.push(k)
      totals.set(k, { personDays: entry.personDays + 1, attended: entry.attended + weight })
    }
  }
  return order
    .sort()
    .map((k) => {
      const e = totals.get(k)!
      return { label: bucketLabel(k, bucket), value: pct(e.attended, e.personDays) }
    })
}

/** People checked in by each hour of today: from two hours before the start to the end of the day (or now). */
export function checkInCurve(firstIns: readonly Date[], hours: { start: string; end: string }, now: Date): Point[] {
  const minutes = firstIns.map(minutesOfDayIST).sort((a, b) => a - b)
  const from = Math.max(0, Math.floor(parseHHMM(hours.start) / 60) - 2)
  const to = Math.min(23, Math.max(from + 1, Math.min(Math.ceil(parseHHMM(hours.end) / 60), Math.ceil(minutesOfDayIST(now) / 60))))
  const points: Point[] = []
  for (let h = from; h <= to; h += 1) {
    const mark = h * 60
    const h12 = h % 12 === 0 ? 12 : h % 12
    points.push({ label: `${h12} ${h < 12 ? 'am' : 'pm'}`, value: minutes.filter((m) => m <= mark).length })
  }
  return points
}
