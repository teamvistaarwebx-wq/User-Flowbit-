/** Orbit formulas (cold vs warm conversion, targets, staleness). Pure. */

export const SMALL_SAMPLE = 30
export const MATURITY_DAYS = 14
const DAY_MS = 86_400_000

/** Percent to one decimal; null when the denominator is 0. */
export const pct1 = (n: number, d: number): number | null => (d > 0 ? Math.round((n * 1000) / d) / 10 : null)

export type FunnelCounts = { total: number; contacted: number; engaged: number; meetingsBooked: number; meetingsDone: number; converted: number; won: number; lost: number; disqualified: number }
export type Funnel = FunnelCounts & { open: number; cold: number | null; warm: number | null; replyRate: number | null; contactRate: number | null }

/** Cold % = meetings booked ÷ contacted. Warm % = meetings booked ÷ engaged (replied). */
export function funnel(c: FunnelCounts): Funnel {
  return {
    ...c,
    open: c.total - c.converted - c.lost - c.disqualified,
    cold: pct1(c.meetingsBooked, c.contacted),
    warm: pct1(c.meetingsBooked, c.engaged),
    replyRate: pct1(c.engaged, c.contacted),
    contactRate: pct1(c.contacted, c.total),
  }
}

export const EMPTY_FUNNEL: FunnelCounts = { total: 0, contacted: 0, engaged: 0, meetingsBooked: 0, meetingsDone: 0, converted: 0, won: 0, lost: 0, disqualified: 0 }

export function targetState(value: number | null, target: number): { ok: boolean; fill: number } {
  return { ok: value !== null && value >= target, fill: value === null || target <= 0 ? (value ? 1 : 0) : Math.min(value / target, 1) }
}

/** Daily share of a weekly target over the workspace's work week. */
export const dailyTarget = (weekly: number, workWeekDays: number) => Math.round(weekly / Math.max(1, workWeekDays))

export const targetSub = (value: number, target: number) => (value >= target ? `Target ${target} met` : `${target - value} to go today`)

export const weighted = (valuePaise: number, probability: number) => Math.round((valuePaise * probability) / 100)

export const winRate = (won: number, lost: number) => pct1(won, won + lost)

export const daysAgo = (date: Date | string, now: Date = new Date()) => Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS)

export const isStale = (lastActivityAt: Date | string | null | undefined, staleDays: number, now: Date = new Date()) =>
  lastActivityAt ? now.getTime() - new Date(lastActivityAt).getTime() >= staleDays * DAY_MS : false

export const deltaPct = (current: number, previous: number): number | null => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null)

export const AGING_BUCKETS = ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]
export const AGING_LABEL: Record<AgingBucket, string> = { not_due: 'Not due', d1_30: '1–30 days', d31_60: '31–60 days', d61_90: '61–90 days', d90_plus: '90+ days' }

/** Bucket for an amount due on `dueDate` ('YYYY-MM-DD'), relative to `today`. */
export function agingBucket(dueDate: string | null | undefined, today: string): AgingBucket {
  if (!dueDate) return 'not_due'
  const late = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / DAY_MS)
  if (late <= 0) return 'not_due'
  if (late <= 30) return 'd1_30'
  if (late <= 60) return 'd31_60'
  if (late <= 90) return 'd61_90'
  return 'd90_plus'
}

/** "6 ÷ 121" style fraction label. */
export const fraction = (n: number, d: number) => `${n} ÷ ${d}`

/** "5.0%" or "—". */
export const formatPct = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`)
