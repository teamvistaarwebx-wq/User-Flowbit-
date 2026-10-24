import { addDays, daysBetween } from '@/lib/dates'
import type { TaskStatus } from './constants'

type DueTask = { status: TaskStatus | string; dueDate?: string | null }

/** Open, with a due date before today (IST). */
export const isOverdue = (t: DueTask, today: string) => t.status !== 'done' && Boolean(t.dueDate) && (t.dueDate as string) < today

export const isDueToday = (t: DueTask, today: string) => t.status !== 'done' && t.dueDate === today

/** "Today", "Tomorrow", "3d overdue", "In 4d" (null when no due date). */
export function relativeDue(dueDate: string | null | undefined, today: string): { label: string; overdue: boolean } | null {
  if (!dueDate) return null
  const diff = daysBetween(today, dueDate)
  if (diff === 0) return { label: 'Today', overdue: false }
  if (diff === 1) return { label: 'Tomorrow', overdue: false }
  if (diff < 0) return { label: `${-diff}d overdue`, overdue: true }
  return { label: `In ${diff}d`, overdue: false }
}

/** Days overdue (0 when not overdue). */
export const daysOverdue = (dueDate: string | null | undefined, today: string) => (dueDate && dueDate < today ? daysBetween(dueDate, today) : 0)

/** The date `days` from today. */
export const presetDate = (today: string, days: number) => addDays(today, days)

/** Task dates outside these years are typing slips (a half-typed year reads as 0002). */
export const MIN_TASK_YEAR = 2000
export const MAX_TASK_YEAR = 2100

/** A complete YYYY-MM-DD whose year is in the range above. */
export function isPlausibleDate(date: string | null | undefined): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const year = Number(date.slice(0, 4))
  return year >= MIN_TASK_YEAR && year <= MAX_TASK_YEAR
}
