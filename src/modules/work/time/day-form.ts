/**
 * Phone timesheet (v2 step 6): below 768px the week grid becomes one day at a time. These map the grid's rows
 * (task or project × day minutes) onto a single day's form. Pure.
 */

export type WeekRow = { key: string; label: string; sub?: string; taskId?: string; days: Record<string, number> }
export type DayFormRow = { key: string; label: string; sub?: string; taskId?: string; minutes: number }

/** The day the form opens on: today when it is in the week, else the week's first day. */
export function initialDay(days: readonly string[], today: string): string {
  return days.includes(today) ? today : (days[0] ?? today)
}

/** Every row of the week with its minutes on `date` (0 when nothing is logged), in the grid's order. */
export function dayFormRows(rows: readonly WeekRow[], date: string): DayFormRow[] {
  return rows.map(({ key, label, sub, taskId, days }) => ({ key, label, sub, taskId, minutes: days[date] ?? 0 }))
}

/** Minutes logged on `date` across all rows. */
export function dayTotal(rows: readonly WeekRow[], date: string): number {
  return rows.reduce((sum, r) => sum + (r.days[date] ?? 0), 0)
}

/** A day's cell can be edited when the sheet is editable and the day is not in the future (unless time is already there). */
export function canEditDay(editable: boolean, date: string, today: string, minutes: number): boolean {
  return editable && (date <= today || minutes > 0)
}
