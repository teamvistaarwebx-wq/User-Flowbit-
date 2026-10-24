import { addDays, eachDay, monthRange, startOfWeek, weekday, workingDaysBetween } from '@/lib/dates'

/** One working day of capacity: the default workday's 8 hours (lib/attendance-core). */
export { WORKDAY_MINUTES } from '@/lib/attendance-core'
import { WORKDAY_MINUTES } from '@/lib/attendance-core'
export const PERIODS = ['this_week', 'last_week', 'this_month'] as const
export type Period = (typeof PERIODS)[number]
export const PERIOD_LABELS: Record<Period, string> = { this_week: 'This week', last_week: 'Last week', this_month: 'This month' }

export function periodRange(period: Period, today: string): { from: string; to: string } {
  if (period === 'this_month') {
    const { start, end } = monthRange(today.slice(0, 7))
    return { from: start, to: end }
  }
  const monday = startOfWeek(today)
  const from = period === 'last_week' ? addDays(monday, -7) : monday
  return { from, to: addDays(from, 6) }
}

export const capacityMinutes = (from: string, to: string, workWeek: readonly number[], holidays: readonly string[] = []) => workingDaysBetween(from, to, workWeek, holidays) * WORKDAY_MINUTES

export type LeaveSpan = { dates: readonly string[]; isHalfDay?: boolean | null }

/**
 * One person's capacity in a range: working days (work week, less holidays) × 8 h,
 * less their approved leave on those days (a half day takes 4 h; a day never goes below 0).
 */
export function memberCapacityMinutes(range: { from: string; to: string }, workWeek: readonly number[], holidays: readonly string[], leave: readonly LeaveSpan[]): number {
  const off = new Set(holidays)
  const working = new Set(eachDay(range.from, range.to).filter((d) => workWeek.includes(weekday(d)) && !off.has(d)))
  const away = new Map<string, number>()
  for (const span of leave) {
    for (const d of span.dates) {
      if (working.has(d)) away.set(d, Math.min(1, (away.get(d) ?? 0) + (span.isHalfDay ? 0.5 : 1)))
    }
  }
  const awayDays = [...away.values()].reduce((s, v) => s + v, 0)
  return Math.round((working.size - awayDays) * WORKDAY_MINUTES)
}

export const loadPercent = (minutes: number, capacity: number) => (capacity > 0 ? Math.round((minutes / capacity) * 100) : 0)

/** Under 70 % green, up to 100 % amber, over 100 % red. */
export function loadTone(pct: number): 'success' | 'warning' | 'danger' {
  if (pct > 100) return 'danger'
  if (pct >= 70) return 'warning'
  return 'success'
}

export type WorkloadTask = { assigneeIds: string[]; status: string; dueDate?: string | null; estimateMinutes?: number | null }

/** Per-member counts from open tasks (overdue, due in period, blocked, estimate due in period). */
export function openTaskStats(memberId: string, tasks: WorkloadTask[], today: string, range: { from: string; to: string }) {
  const mine = tasks.filter((t) => t.assigneeIds.includes(memberId) && t.status !== 'done')
  const dueInPeriod = mine.filter((t) => t.dueDate && t.dueDate >= range.from && t.dueDate <= range.to)
  return {
    open: mine.length,
    overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
    dueInPeriod: dueInPeriod.length,
    blocked: mine.filter((t) => t.status === 'blocked').length,
    estimateOpen: mine.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0),
    estimateDue: dueInPeriod.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0),
  }
}
