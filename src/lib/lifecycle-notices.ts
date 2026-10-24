import { accountTypeOf, isHouseAccount } from '@/lib/account-types'
import { DELETION_NOTICE_DAYS, FREE_NOTICE_DAYS, lifecycleOf, TRIAL_NOTICE_DAYS, type Lifecycle } from '@/lib/lifecycle'
import type { OrgLike } from '@/lib/plans'

/**
 * Which lifecycle notice is due for a workspace now (console spec 4.3, 5.5):
 * Free ending (30, 7, 1 days), trial ending (3, 1), read-only, blocked and
 * deletion (30, 7, 1 days before). Pure. At most one notice is due at a time,
 * the tightest threshold reached, and its `key` (the Message/Notification
 * dedupeKey) names the threshold and the date it counts to, so a daily cron
 * and page loads can ask as often as they like and each notice goes out once.
 * A missed day sends the next threshold, never the ones in between.
 */

export type NoticeKind = 'free_ending' | 'trial_ending' | 'read_only' | 'blocked' | 'deletion'

export type LifecycleNotice = {
  kind: NoticeKind
  /** Unique per workspace: kind, threshold and the date it counts to. */
  key: string
  /** The threshold (days before) for countdown notices; null for read-only and blocked. */
  days: number | null
  /** The date the notice is about (Free or trial end, blocking, deletion). */
  date: Date
  lifecycle: Lifecycle
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** The smallest threshold that `daysLeft` has reached (thresholds descending), or null when none has. */
export function thresholdReached(daysLeft: number, thresholds: readonly number[]): number | null {
  const reached = thresholds.filter((t) => daysLeft <= t)
  return reached.length ? Math.min(...reached) : null
}

function countdown(kind: NoticeKind, prefix: string, end: Date | null, daysLeft: number | null, thresholds: readonly number[], lc: Lifecycle): LifecycleNotice | null {
  if (!end || daysLeft == null) return null
  const days = thresholdReached(daysLeft, thresholds)
  return days == null ? null : { kind, key: `${prefix}-${days}d:${isoDay(end)}`, days, date: end, lifecycle: lc }
}

export function dueNotice(org: OrgLike, now: Date = new Date()): LifecycleNotice | null {
  if (isHouseAccount(accountTypeOf(org.subscription))) return null
  const lc = lifecycleOf(org, now)
  switch (lc.stage) {
    case 'free':
      return countdown('free_ending', 'free', lc.endsAt, lc.daysLeft, FREE_NOTICE_DAYS, lc)
    case 'trial':
      return countdown('trial_ending', 'trial', lc.endsAt, lc.daysLeft, TRIAL_NOTICE_DAYS, lc)
    case 'read_only':
      return lc.readOnlyFrom && lc.blockedFrom ? { kind: 'read_only', key: `read-only:${isoDay(lc.readOnlyFrom)}`, days: null, date: lc.blockedFrom, lifecycle: lc } : null
    case 'blocked': {
      const deletion = countdown('deletion', 'deletion', lc.deleteAt, lc.daysLeft, DELETION_NOTICE_DAYS, lc)
      if (deletion) return deletion
      return lc.blockedFrom && lc.deleteAt ? { kind: 'blocked', key: `blocked:${isoDay(lc.blockedFrom)}`, days: null, date: lc.deleteAt, lifecycle: lc } : null
    }
    default:
      return null
  }
}
