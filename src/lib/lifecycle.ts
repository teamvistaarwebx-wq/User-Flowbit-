import { accountTypeOf, FREE_MONTHS, FREE_SEAT_LIMIT, freeEndsAt, isHouseAccount, type AccountType } from '@/lib/account-types'
import { accessState, effectiveStatus, PAST_DUE_GRACE_DAYS, READ_ONLY_DAYS, readOnlyFrom, TRIAL_DAYS, type OrgLike } from '@/lib/plans'

/**
 * The workspace lifecycle (console spec 2, 4.2, 4.3): Free (6 months, 5
 * people), one 15-day Trial, Paid; when that ends without payment, 30 days
 * read-only, then blocked, then the data is deleted 90 days later. Pure and
 * client-safe: banners, the subscription page, reminders and the lifecycle
 * cron all read the same dates from here.
 */

const DAY_MS = 86_400_000
/** Days between blocking and deletion (console spec 4.3). */
export const DELETE_AFTER_BLOCKED_DAYS = 90
/** Owner notices before deletion, in days. */
export const DELETION_NOTICE_DAYS = [30, 7, 1] as const
/** Free-ending reminders, in days before the 6 months end. */
export const FREE_NOTICE_DAYS = [30, 7, 1] as const
/** Trial-ending reminders, in days before the trial ends. */
export const TRIAL_NOTICE_DAYS = [3, 1] as const
/**
 * Message and processing logs are kept 13 months, then deleted (DPA
 * "Retention and deletion", FAQ; at least the year DPDP asks for, with a
 * month's margin). The one constant for log pruning (modules/privacy/retention)
 * and for the logs of a deleted workspace (modules/lifecycle/purge).
 */
export const LOG_RETENTION_DAYS = 395
/** The same period in words for the DPA, Privacy policy and FAQ. */
export const LOG_RETENTION_MONTHS = 13
/** An owner-deleted workspace can be restored by Flowbit for this many days; then its data is removed (DPA, Settings → General). */
export const OWNER_DELETE_PURGE_DAYS = 30
/** Days before the purge of an owner-deleted workspace when the owner is reminded. */
export const OWNER_DELETE_NOTICE_DAYS = 7

export type LifecycleStage = 'house' | 'free' | 'trial' | 'paid' | 'comped' | 'read_only' | 'blocked' | 'disabled' | 'deleted'

export type Lifecycle = {
  stage: LifecycleStage
  accountType: AccountType
  /** When the current stage ends (Free/trial end, renewal, blocking, deletion), or null when nothing is scheduled. */
  endsAt: Date | null
  /** Whole days until `endsAt` (0 on its last day), or null. */
  daysLeft: number | null
  /** Read-only began (or begins), blocked from, data deleted on: set once full access has ended. */
  readOnlyFrom: Date | null
  blockedFrom: Date | null
  deleteAt: Date | null
  /** End of the 6-month Free window (also for a Trial that may trim back to Free), or null. */
  freeWindowEndsAt: Date | null
}

const toDate = (value: Date | string | null | undefined) => (value ? new Date(value) : null)
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS)
export const daysUntil = (end: Date, now: Date) => Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS))

/** True once the lifecycle job has removed the workspace's data. */
export const isTombstone = (org: OrgLike) => org.status === 'deleted'

/**
 * End of the 6-month Free window: stored on the subscription, else a Free
 * workspace's own end date, else 6 months from signup (a signup Trial).
 */
export function freeWindowEnd(org: OrgLike): Date | null {
  const sub = org.subscription
  const stored = toDate(sub?.freeEndsAt)
  if (stored) return stored
  if (accountTypeOf(sub) === 'free') return toDate(sub?.trialEndsAt)
  const created = toDate(org.createdAt)
  return created ? freeEndsAt(created) : null
}

/** Full-access stage by account type. */
function runningStage(type: AccountType): LifecycleStage {
  return type === 'internal' || type === 'test' ? 'house' : type
}

/** When full access ends for a running workspace (Free/trial end, renewal or the end of the payment grace). */
function fullAccessEnds(org: OrgLike, type: AccountType, now: Date): Date | null {
  const sub = org.subscription
  if (isHouseAccount(type)) return null
  const eff = effectiveStatus(sub, now)
  if (eff.status === 'trialing') return toDate(sub?.trialEndsAt)
  if (eff.status === 'past_due') return plusDays(eff.since ?? now, PAST_DUE_GRACE_DAYS)
  return toDate(sub?.currentPeriodEnd)
}

const NO_DATES = { readOnlyFrom: null, blockedFrom: null, deleteAt: null }

export function lifecycleOf(org: OrgLike, now: Date = new Date()): Lifecycle {
  const type = accountTypeOf(org.subscription)
  const freeWindowEndsAt = type === 'free' || type === 'trial' ? freeWindowEnd(org) : null
  const base = { accountType: type, freeWindowEndsAt }
  if (isTombstone(org) || org.deletedAt) return { ...base, ...NO_DATES, stage: 'deleted', endsAt: null, daysLeft: null }
  if (org.disabled) return { ...base, ...NO_DATES, stage: 'disabled', endsAt: null, daysLeft: null }
  const access = accessState(org, now)
  const from = access === 'full' ? null : readOnlyFrom(org.subscription, now)
  if (!from) {
    const endsAt = fullAccessEnds(org, type, now)
    return { ...base, ...NO_DATES, stage: runningStage(type), endsAt, daysLeft: endsAt ? daysUntil(endsAt, now) : null }
  }
  const blockedFrom = plusDays(from, READ_ONLY_DAYS)
  const deleteAt = plusDays(blockedFrom, DELETE_AFTER_BLOCKED_DAYS)
  const stage: LifecycleStage = access === 'read_only' ? 'read_only' : 'blocked'
  const endsAt = stage === 'read_only' ? blockedFrom : deleteAt
  return { ...base, stage, endsAt, daysLeft: daysUntil(endsAt, now), readOnlyFrom: from, blockedFrom, deleteAt }
}

// ---------------------------------------------------------------------------
// Start trial (once) and back to Free (console spec 2, 4.2)
// ---------------------------------------------------------------------------

export type TrialRefusal = 'not_free' | 'used' | 'not_active' | 'business_used'

export const TRIAL_REFUSAL_MESSAGE: Record<TrialRefusal, string> = {
  not_free: 'Only a workspace on the Free plan can start a trial.',
  used: 'This workspace has already had its trial. Choose a plan to add more people.',
  business_used: 'Your business has already had its trial in another workspace (same email, GSTIN or PAN). Each business gets one trial. Choose a plan to add more people.',
  not_active: 'Your free months have ended. Choose a plan to keep editing.',
}

/**
 * Why a Free workspace may not start its one 15-day trial now, or null when it
 * may. Pure: the once-per-business check (D5) needs the database and runs in
 * modules/lifecycle/plan-switch startTrial ('business_used').
 */
export function trialStartRefusal(org: OrgLike, now: Date = new Date()): TrialRefusal | null {
  if (accountTypeOf(org.subscription) !== 'free') return 'not_free'
  if (org.subscription?.trialStartedAt) return 'used'
  if (accessState(org, now) !== 'full' || effectiveStatus(org.subscription, now).status !== 'trialing') return 'not_active'
  return null
}

/** The subscription fields that start the trial: everything for everyone for 15 days, the Free end kept for later. */
export function trialStartFields(org: OrgLike, now: Date = new Date(), trialDays: number = TRIAL_DAYS) {
  return {
    accountType: 'trial' as const,
    status: 'trialing' as const,
    trialStartedAt: now,
    trialEndsAt: plusDays(now, trialDays),
    freeEndsAt: freeWindowEnd(org),
    seats: 10,
  }
}

export type FreeReturnRefusal = 'not_trial' | 'too_many' | 'window_over' | 'duplicate'

export const FREE_RETURN_REFUSAL_MESSAGE: Record<FreeReturnRefusal, string> = {
  not_trial: 'Only a workspace on a trial can move to the Free plan.',
  too_many: `The Free plan covers ${FREE_SEAT_LIMIT} people. Disable members, revoke invitations or move employees off payroll until ${FREE_SEAT_LIMIT} are left.`,
  window_over: 'The 6 free months from signup have passed, so the Free plan is no longer available. Choose a plan to keep editing.',
  duplicate: 'Another workspace already uses the Free plan for your email, GSTIN or PAN. Each business gets one Free workspace. Choose a plan to keep editing.',
}

/** The refusal wording with the Free seats and months from Console settings (lib/plan-config). */
export function freeReturnMessage(reason: FreeReturnRefusal, freeSeats: number = FREE_SEAT_LIMIT, freeMonths: number = FREE_MONTHS): string {
  if (reason === 'window_over') return `The ${freeMonths} free months from signup have passed, so the Free plan is no longer available. Choose a plan to keep editing.`
  if (reason !== 'too_many') return FREE_RETURN_REFUSAL_MESSAGE[reason]
  return `The Free plan covers ${freeSeats} people. Disable members, revoke invitations or move employees off payroll until ${freeSeats} are left.`
}

/**
 * Why a Trial workspace may not drop back to Free now, or null when it may:
 * no plan bought, at most 5 billable seats, and still inside the 6 months
 * from signup. `seatsUsed` is lib/billing billableSeats.
 */
export function freeReturnRefusal(org: OrgLike, seatsUsed: number, now: Date = new Date(), freeSeats: number = FREE_SEAT_LIMIT): FreeReturnRefusal | null {
  const sub = org.subscription
  if (accountTypeOf(sub) !== 'trial' || (sub?.plan && sub.plan !== 'trial')) return 'not_trial'
  const windowEnd = freeWindowEnd(org)
  if (!windowEnd || windowEnd.getTime() <= now.getTime()) return 'window_over'
  if (seatsUsed > freeSeats) return 'too_many'
  return null
}

/** The subscription fields that put a trimmed Trial workspace back on Free until the 6 months end. The trial stays used. */
export function freeReturnFields(org: OrgLike, now: Date = new Date(), freeSeats: number = FREE_SEAT_LIMIT) {
  const windowEnd = freeWindowEnd(org)
  return {
    accountType: 'free' as const,
    status: 'trialing' as const,
    trialEndsAt: windowEnd,
    freeEndsAt: windowEnd,
    trialStartedAt: toDate(org.subscription?.trialStartedAt) ?? now,
    seats: freeSeats,
  }
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/** When an owner-deleted workspace's data is removed: 30 days after the owner deleted it; null when not owner-deleted or already removed. */
export function ownerDeletionPurgeAt(org: OrgLike): Date | null {
  const deleted = toDate(org.deletedAt)
  if (!deleted || isTombstone(org)) return null
  return plusDays(deleted, OWNER_DELETE_PURGE_DAYS)
}

/**
 * True when an owner-deleted workspace is due for removal (B2, owner decision
 * D4): 30 days after the owner deleted it. Internal and Test are never purged,
 * nor a workspace Flowbit staff disabled (held), nor a tombstone.
 */
export function ownerDeletionPurgeDue(org: OrgLike, now: Date = new Date()): boolean {
  if (isHouseAccount(accountTypeOf(org.subscription)) || org.disabled) return false
  const at = ownerDeletionPurgeAt(org)
  return at !== null && now.getTime() >= at.getTime()
}

/**
 * True when the workspace's data is due for deletion: blocked for 90 days.
 * Internal, Test and a Comped workspace before its end date are never deleted,
 * nor is a workspace Flowbit staff disabled, nor one already deleted.
 */
export function deletionDue(org: OrgLike, now: Date = new Date()): boolean {
  const type = accountTypeOf(org.subscription)
  if (isHouseAccount(type)) return false
  const comped = toDate(org.subscription?.compedUntil)
  if (type === 'comped' && (!comped || comped.getTime() > now.getTime())) return false
  const lc = lifecycleOf(org, now)
  return lc.stage === 'blocked' && lc.deleteAt !== null && now.getTime() >= lc.deleteAt.getTime()
}
