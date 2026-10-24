import { entitlements } from '@/lib/entitlements'
import type { SubscriptionLike } from '@/lib/plans'

/** Platform admin maths (platform spec 11.2–11.3). Pure; plan state comes from lib/entitlements. */

const DAY_MS = 86_400_000

export type PlatformSub = SubscriptionLike & { amountPaise?: number | null; quantities?: { work?: number | null } | null }
export type OrgState = 'trial' | 'free' | 'house' | 'active' | 'past_due' | 'ending' | 'read_only' | 'locked' | 'disabled' | 'deleted'
type PlatformOrg = { subscription?: PlatformSub | null; disabled?: boolean | null; deletedAt?: Date | string | null }

/**
 * Monthly recurring revenue of one workspace, ex-GST: paid plans with full
 * access (active, past due in grace, canceled within the period) contribute
 * their amount, yearly divided by 12. Trials, Free, Internal and Test add 0.
 */
export function mrrOf(sub: PlatformSub | null | undefined, now = new Date()): number {
  if (!sub || sub.plan === 'trial') return 0
  const ent = entitlements({ subscription: sub }, now)
  if (!ent.billed || !['active', 'past_due', 'canceled'].includes(ent.status) || ent.access !== 'full') return 0
  const amount = sub.amountPaise ?? 0
  return sub.cycle === 'yearly' ? Math.round(amount / 12) : amount
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/** The workspace's state for the platform list, with a short context line. */
export function orgState(org: PlatformOrg, now = new Date()): { state: OrgState; label: string } {
  if (org.deletedAt) return { state: 'deleted', label: 'Deleted' }
  if (org.disabled) return { state: 'disabled', label: 'Disabled' }
  const ent = entitlements(org, now)
  if (!ent.billed) return { state: 'house', label: `${ent.accountTypeLabel} · not billed` }
  if (ent.access === 'blocked') return { state: 'locked', label: 'Locked' }
  if (ent.access === 'read_only') return { state: 'read_only', label: `Read-only · ${ent.readOnlyDaysLeft ?? 0} days left` }
  if (ent.trialing) {
    const left = ent.trialDaysLeft ?? 0
    return ent.accountType === 'free' ? { state: 'free', label: `Free · ${days(left)}` } : { state: 'trial', label: `Trial · ${days(left)}` }
  }
  if (ent.status === 'past_due') return { state: 'past_due', label: 'Payment due' }
  if (ent.status === 'canceled') return { state: 'ending', label: 'Ending' }
  return { state: 'active', label: 'Active' }
}

/** Seat limit for display: the plan's people limit (lib/entitlements), null when unlimited. */
export function seatLimitOf(sub: PlatformSub | null | undefined, now = new Date(), freeSeats?: number): number | null {
  return entitlements({ subscription: sub }, now, undefined, { freeSeats }).seatLimit
}

/** Monday-start week labels and counts for the last `weeks` weeks (IST dates as 'YYYY-MM-DD'). */
export function weeklyCounts(dates: readonly string[], todayIso: string, weeks = 12): { label: string; count: number }[] {
  const today = new Date(`${todayIso}T00:00:00Z`)
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS)
  return Array.from({ length: weeks }, (_, i) => {
    const start = new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY_MS)
    const end = new Date(start.getTime() + 7 * DAY_MS)
    const s = start.toISOString().slice(0, 10)
    const e = end.toISOString().slice(0, 10)
    return { label: `${start.getUTCDate()}/${start.getUTCMonth() + 1}`, count: dates.filter((d) => d >= s && d < e).length }
  })
}
