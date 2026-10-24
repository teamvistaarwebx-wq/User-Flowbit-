/**
 * Usage events (console spec 7.3, V2-PLAN 3.3): the few product moments that
 * show whether a workspace is really used. They feed the health score and,
 * later, wallet metering. Pure and client-safe.
 */
export const USAGE_KINDS = [
  'login',
  'attendance_marked',
  'invoice_issued',
  'task_created',
  'task_moved',
  'lead_touched',
  'upgrade_clicked',
  'limit_hit',
] as const
export type UsageKind = (typeof USAGE_KINDS)[number]

/** Days a usage event is kept: enough for a year-on-year health score. */
export const USAGE_RETENTION_DAYS = 400
