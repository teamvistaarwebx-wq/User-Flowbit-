import { addDays, formatDate, istInstant } from '@/lib/dates'

/**
 * Attendance correction rules (pure). Employees may ask for these statuses
 * only; leave goes through the leave screen, where the balance is checked.
 */
export const CORRECTABLE_STATUSES = ['present', 'work_from_home', 'on_duty', 'half_day'] as const
export type CorrectableStatus = (typeof CORRECTABLE_STATUSES)[number]

export const DEFAULT_CORRECTION_WINDOW_HOURS = 360

export const isCorrectable = (status: string): status is CorrectableStatus => (CORRECTABLE_STATUSES as readonly string[]).includes(status)

/** "Within 15 days of the day itself." */
export const windowHint = (hours: number) => {
  const days = Math.round(hours / 24)
  return days >= 1 ? `Within ${days} day${days === 1 ? '' : 's'} of the day itself.` : `Within ${hours} hours of the day itself.`
}

/** The window is measured from the end of that day in IST. */
export function withinCorrectionWindow(date: string, windowHours: number, now: Date = new Date()): boolean {
  const endOfDay = istInstant(addDays(date, 1), '00:00').getTime()
  return now.getTime() - endOfDay <= windowHours * 3_600_000
}

/** Why a correction for this day cannot be raised, or null. */
export function correctionProblem(input: { date: string; today: string; requested: string; current?: string | null; windowHours: number; now?: Date }): string | null {
  const { date, today, requested, current, windowHours } = input
  if (date < '2000-01-01') return 'Pick a real date.'
  if (date > today) return 'That day has not happened yet. Corrections are for days already past.'
  if (!isCorrectable(requested)) return 'Leave spends a balance, so it goes through the leave screen where the balance is checked.'
  if (current === requested) return `That day is already marked ${requested.replace(/_/g, ' ')}.`
  if (!withinCorrectionWindow(date, windowHours, input.now)) {
    const days = Math.round(windowHours / 24)
    return `${formatDate(date)} is outside the ${days}-day window for corrections. Ask HR to change it directly.`
  }
  return null
}
