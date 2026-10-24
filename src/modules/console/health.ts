import { addDays } from '@/lib/dates'
import type { UsageKind } from '@/lib/usage-kinds'

/**
 * Health score (console spec 7.3), computed nightly from UsageEvent. Pure.
 *
 * | Signal        | Habit-formed when                          |
 * | Active people | 3+ people active on 5 of the last 7 days   |
 * | Muster        | attendance on 10+ of the last 14 days      |
 * | Folio         | 5+ invoices sent (last 30 days)            |
 * | Work          | 20+ tasks created or moved (last 30 days)  |
 * | Orbit         | 10+ leads touched (last 30 days)           |
 *
 * Green: active people formed and at least one product formed.
 * Amber: any signal formed, or any use in the last 7 days.
 * Red: nothing.
 */

export const HEALTH_SCORES = ['green', 'amber', 'red'] as const
export type HealthScore = (typeof HEALTH_SCORES)[number]
export const HEALTH_LABEL: Record<HealthScore, string> = { green: 'Green', amber: 'Amber', red: 'Red' }

export const THRESHOLDS = {
  activePeople: { people: 3, days: 5, window: 7 },
  muster: { days: 10, window: 14 },
  folio: { count: 5, window: 30 },
  work: { count: 20, window: 30 },
  orbit: { count: 10, window: 30 },
} as const

/** Days of events the job reads: the longest window. */
export const HEALTH_LOOKBACK_DAYS = 30

export const SIGNALS = ['activePeople', 'muster', 'folio', 'work', 'orbit'] as const
export type Signal = (typeof SIGNALS)[number]
export const SIGNAL_LABEL: Record<Signal, string> = { activePeople: 'Active people', muster: 'Muster', folio: 'Folio', work: 'Work', orbit: 'Orbit' }

/** One aggregated row: events of a kind by one user on one IST day. */
export type UsageRow = { day: string; kind: UsageKind; userId?: string | null; count: number }

export type SignalValue = { value: number; target: number; formed: boolean }
export type HealthResult = { score: HealthScore; signals: Record<Signal, SignalValue>; activeLast7: boolean }

const DAY_MS = 86_400_000

/**
 * The last full IST day to score as of. The nightly job runs at 01:30 IST, when "today" has
 * barely begun, so windows end yesterday and every "last N days" holds N full days (R3 L-26b).
 */
export const healthScoreDay = (today: string): string => addDays(today, -1)

/** The 'YYYY-MM-DD' days of a window ending today (today included). */
export function windowDays(today: string, days: number): Set<string> {
  const end = new Date(`${today}T00:00:00Z`).getTime()
  return new Set(Array.from({ length: days }, (_, i) => new Date(end - i * DAY_MS).toISOString().slice(0, 10)))
}

const inWindow = (rows: readonly UsageRow[], today: string, days: number) => {
  const set = windowDays(today, days)
  return rows.filter((r) => set.has(r.day))
}

const countOf = (rows: readonly UsageRow[], kinds: readonly UsageKind[]) => rows.filter((r) => kinds.includes(r.kind)).reduce((sum, r) => sum + r.count, 0)

function activePeopleDays(rows: readonly UsageRow[], today: string): number {
  const t = THRESHOLDS.activePeople
  const byDay = new Map<string, Set<string>>()
  for (const r of inWindow(rows, today, t.window)) {
    if (!r.userId) continue
    byDay.set(r.day, new Set([...(byDay.get(r.day) ?? []), r.userId]))
  }
  return [...byDay.values()].filter((users) => users.size >= t.people).length
}

const signal = (value: number, target: number): SignalValue => ({ value, target, formed: value >= target })

export function healthOf(rows: readonly UsageRow[], today: string): HealthResult {
  const signals: Record<Signal, SignalValue> = {
    activePeople: signal(activePeopleDays(rows, today), THRESHOLDS.activePeople.days),
    muster: signal(new Set(inWindow(rows, today, THRESHOLDS.muster.window).filter((r) => r.kind === 'attendance_marked').map((r) => r.day)).size, THRESHOLDS.muster.days),
    folio: signal(countOf(inWindow(rows, today, THRESHOLDS.folio.window), ['invoice_issued']), THRESHOLDS.folio.count),
    work: signal(countOf(inWindow(rows, today, THRESHOLDS.work.window), ['task_created', 'task_moved']), THRESHOLDS.work.count),
    orbit: signal(countOf(inWindow(rows, today, THRESHOLDS.orbit.window), ['lead_touched']), THRESHOLDS.orbit.count),
  }
  const activeLast7 = inWindow(rows, today, 7).some((r) => r.count > 0 && r.kind !== 'limit_hit' && r.kind !== 'upgrade_clicked')
  const productFormed = signals.muster.formed || signals.folio.formed || signals.work.formed || signals.orbit.formed
  const anyFormed = signals.activePeople.formed || productFormed
  const score: HealthScore = signals.activePeople.formed && productFormed ? 'green' : anyFormed || activeLast7 ? 'amber' : 'red'
  return { score, signals, activeLast7 }
}

/** Free workspaces in their last 30 days, and Red accounts bigger than the Free plan (5 seats by default), make the "Call today" list. */
export const CALL_TODAY = { redSeats: 5, freeDaysLeft: 30 } as const

/** `redSeats`: the Console's Free plan seats; a Red account above it is worth a call. */
export type CallCandidate = { health: HealthScore | null; seats: number; accountType: string; daysLeft: number | null; inMetrics: boolean; live: boolean; redSeats?: number }
export type CallReason = 'red_big' | 'free_ending'

export function callTodayReason(c: CallCandidate): CallReason | null {
  if (!c.inMetrics || !c.live) return null
  if (c.health === 'red' && c.seats > (c.redSeats ?? CALL_TODAY.redSeats)) return 'red_big'
  if (c.accountType === 'free' && c.daysLeft != null && c.daysLeft <= CALL_TODAY.freeDaysLeft) return 'free_ending'
  return null
}
