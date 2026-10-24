import { addDays, shiftMonth } from '@/lib/dates'
import { CLIENT_HEALTH, clientHealth, type ClientHealth, type HealthInput } from './health'

/**
 * Pure maths behind the Clients dashboard and client cards (tested on fixtures).
 * Money is paise; hours are minutes until shown.
 */

/** Standard working hours in a month (22 days × 8 h) for turning a monthly salary into an hourly cost. */
export const MONTHLY_WORK_HOURS = 176
export const MONTHS_IN_YEAR = 12
/** Months on the "new clients" chart and the revenue window for top clients. */
export const TREND_MONTHS = 12
/** Days behind a card's margin (revenue and cost over the same window). */
export const MARGIN_WINDOW_DAYS = 90
export const NEW_WINDOWS = [30, 90] as const
export type NewWindow = (typeof NEW_WINDOWS)[number]

/** 'YYYY-MM' for the last `count` months, oldest first, ending with `today`'s month. */
export function lastMonths(today: string, count: number): string[] {
  const current = today.slice(0, 7)
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)))
}

/** One value per month key, 0 where a month has no row. */
export function fillMonths(rows: readonly { month: string; n: number }[], months: readonly string[]): number[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.n]))
  return months.map((m) => byMonth.get(m) ?? 0)
}

/** The first day that counts as "new" for a 30 or 90 day window. */
export const newSince = (today: string, days: number) => addDays(today, -days)

/** Salary cost of one hour: annual CTC / 12 / standard hours, in paise. */
export function hourlyCostPaise(ctcAnnualPaise: number): number {
  if (!(ctcAnnualPaise > 0)) return 0
  return Math.round(ctcAnnualPaise / MONTHS_IN_YEAR / MONTHLY_WORK_HOURS)
}

/** Cost of logged minutes at an hourly rate, in paise. */
export const costOfMinutes = (minutes: number, hourlyPaise: number) => Math.round((minutes * hourlyPaise) / 60)

export type Margin = { revenuePaise: number; costPaise: number; marginPaise: number; pct: number | null }

/** Revenue less cost; the percentage is null when nothing was billed. */
export function marginOf(revenuePaise: number, costPaise: number): Margin {
  const marginPaise = revenuePaise - costPaise
  return { revenuePaise, costPaise, marginPaise, pct: revenuePaise > 0 ? Math.round((marginPaise / revenuePaise) * 100) : null }
}

/** Minutes per client from time entries keyed to a project or a task. */
export function minutesByClient(entries: readonly { projectId?: string | null; taskId?: string | null; minutes: number }[], projectClient: ReadonlyMap<string, string>, taskClient: ReadonlyMap<string, string>): Map<string, number> {
  // A local accumulator (never shared): copying the map per entry would be quadratic on a month of time.
  const out = new Map<string, number>()
  for (const e of entries) {
    const client = (e.projectId ? projectClient.get(e.projectId) : undefined) ?? (e.taskId ? taskClient.get(e.taskId) : undefined)
    if (client) out.set(client, (out.get(client) ?? 0) + e.minutes)
  }
  return out
}

/** Cost per client: each member's minutes at that member's hourly cost. */
export function costByClient(entries: readonly { client: string; memberId: string; minutes: number }[], hourly: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.client, (out.get(e.client) ?? 0) + costOfMinutes(e.minutes, hourly.get(e.memberId) ?? 0))
  return out
}

export type HealthCounts = Record<ClientHealth, number>

/** How many clients sit at each health level. */
export function healthCounts(inputs: readonly HealthInput[]): HealthCounts {
  return inputs.reduce<HealthCounts>((acc, input) => {
    const h = clientHealth(input)
    return { ...acc, [h]: acc[h] + 1 }
  }, Object.fromEntries(CLIENT_HEALTH.map((h) => [h, 0])) as HealthCounts)
}

/** The top `limit` rows by value (ties by name), dropping zero and negative values. */
export function topBy<T extends { name: string; value: number }>(rows: readonly T[], limit: number): T[] {
  return [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, limit)
}

/** Hours as "12.5 h" from minutes. */
export const hoursLabel = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} h`

/** Share of retainer hours used (0–100+), or null without a retainer. */
export const retainerUse = (minutes: number, retainerHours: number | null) => (retainerHours && retainerHours > 0 ? Math.round((minutes / 60 / retainerHours) * 100) : null)
