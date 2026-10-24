/**
 * One filter for logged time across every report section (Time, By assignee,
 * Project health), so their totals agree: stopped timers only, never rejected
 * time, and only approved time when "approved only" is on. Pure and client-safe.
 */
export function reportTimeFilter(approvedOnly: boolean) {
  return { isRunning: false, status: approvedOnly ? 'approved' : { $ne: 'rejected' } } as const
}

/** The most time entries the Time section reads; beyond it the section says it is truncated. */
export const TIME_REPORT_LIMIT = 20_000

/** Reads one past the limit, so `rows.length > limit` means the range was cut short. */
export function cutToLimit<T>(rows: readonly T[], limit: number = TIME_REPORT_LIMIT): { rows: T[]; truncated: boolean } {
  return rows.length > limit ? { rows: rows.slice(0, limit), truncated: true } : { rows: [...rows], truncated: false }
}
