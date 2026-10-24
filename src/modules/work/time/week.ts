import { addDays, formatDate, startOfWeek, weekday } from '@/lib/dates'
import type { TimeStatus } from '@/models/work/TimeEntry'

/** The seven 'YYYY-MM-DD' days (Mon..Sun) of the week starting `weekStart`. */
export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

/** "29 Sep – 5 Oct". */
export function weekLabel(weekStart: string): string {
  return `${formatDate(weekStart, { short: true })} – ${formatDate(addDays(weekStart, 6), { short: true })}`
}

/** Monday for a requested ?week= value (any day snaps to its Monday). */
export function normaliseWeek(value: string | undefined, today: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? startOfWeek(value as string) : startOfWeek(today)
}

/** Members can edit a week only while it is a draft or was sent back. */
export const isWeekEditable = (status: TimeStatus | string | undefined) => !status || status === 'draft' || status === 'rejected'

/** Expected minutes for a week: working days in it × 8 h. */
export function expectedMinutes(weekStart: string, workWeek: readonly number[], hoursPerDay = 8): number {
  return weekDays(weekStart).filter((d) => workWeek.includes(weekday(d))).length * hoursPerDay * 60
}

/** Why a week can't be submitted, or null when it can. */
export function submitProblem(input: { status?: string; totalMinutes: number; hasRunningTimer: boolean }): string | null {
  if (!isWeekEditable(input.status)) return 'This week is already submitted.'
  if (input.hasRunningTimer) return 'Stop your timer before submitting.'
  if (input.totalMinutes <= 0) return 'Log some time before submitting.'
  return null
}
