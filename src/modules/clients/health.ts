/**
 * Client health (pure): a plain traffic light from money owed and how recently anyone touched the client.
 * Leads and inactive clients have no health; it is for the clients you are working for.
 */

export const CLIENT_HEALTH = ['good', 'watch', 'at_risk'] as const
export type ClientHealth = (typeof CLIENT_HEALTH)[number]
export const isClientHealth = (value: unknown): value is ClientHealth => typeof value === 'string' && (CLIENT_HEALTH as readonly string[]).includes(value)

export const HEALTH_LABEL: Record<ClientHealth, string> = { good: 'Healthy', watch: 'Needs attention', at_risk: 'At risk' }
export const HEALTH_TONE: Record<ClientHealth, 'success' | 'warning' | 'danger'> = { good: 'success', watch: 'warning', at_risk: 'danger' }
export const HEALTH_COLOR: Record<ClientHealth, string> = { good: 'var(--success)', watch: 'var(--warning)', at_risk: 'var(--danger)' }

/** Overdue for longer than this, or untouched for longer than QUIET_RISK_DAYS, is at risk. */
export const OVERDUE_RISK_DAYS = 60
export const QUIET_RISK_DAYS = 90
/** Untouched for longer than this needs attention. */
export const QUIET_WATCH_DAYS = 30

const DAY_MS = 86_400_000

export type HealthInput = {
  /** Balance on invoices past their due date (paise). */
  overduePaise: number
  /** Earliest due date among overdue invoices ('YYYY-MM-DD'), or null. */
  oldestOverdueDue: string | null
  /** Latest sign of work or contact (activity, time, invoice or an edit). */
  lastTouchAt: Date | null
  today: string
}

const daysSince = (iso: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / DAY_MS)

/** Healthy, needs attention or at risk. */
export function clientHealth(input: HealthInput): ClientHealth {
  const overdueDays = input.overduePaise > 0 && input.oldestOverdueDue ? daysSince(input.oldestOverdueDue, input.today) : 0
  const quietDays = input.lastTouchAt ? daysSince(input.lastTouchAt.toISOString(), input.today) : Number.POSITIVE_INFINITY
  if (overdueDays > OVERDUE_RISK_DAYS || quietDays > QUIET_RISK_DAYS) return 'at_risk'
  if (input.overduePaise > 0 || quietDays > QUIET_WATCH_DAYS) return 'watch'
  return 'good'
}

/** The latest of several optional dates. */
export function latest(...dates: (Date | string | null | undefined)[]): Date | null {
  const times = dates.filter((d): d is Date | string => Boolean(d)).map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t))
  return times.length ? new Date(Math.max(...times)) : null
}
