/**
 * Account types (console spec 4.1): who a workspace is to Flowbit, separate
 * from `subscription.status` (the payment state). Pure, client-safe; no
 * imports from plans.ts so plans.ts can depend on it.
 */

export const ACCOUNT_TYPES = ['internal', 'test', 'free', 'trial', 'paid', 'comped'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  internal: 'Internal',
  test: 'Test / Demo',
  free: 'Free',
  trial: 'Trial',
  paid: 'Paid',
  comped: 'Comped / Partner',
}

/** Free plan (console spec 2): up to 5 billable seats, full suite, for 6 months from signup. */
export const FREE_SEAT_LIMIT = 5
export const FREE_MONTHS = 6

/** Types Flowbit never bills and never reminds; they are left out of every platform metric. */
const HOUSE_TYPES: ReadonlySet<AccountType> = new Set(['internal', 'test'])

export const isAccountType = (value: unknown): value is AccountType => typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value)

export type AccountTypeSource = { plan?: string | null; accountType?: string | null } | null | undefined

/**
 * The workspace's account type. Internal, Test and Comped are set by Flowbit
 * staff and always win. Free, Trial and Paid follow the plan: a workspace that
 * has bought a plan is Paid even if it signed up as Free, and a workspace with
 * no plan yet is Free only when it signed up as Free. Orgs created before the
 * field existed (no value stored) resolve the same way, so no migration is
 * needed for reads; `scripts/migrate-account-types.ts` stores the value.
 */
export function accountTypeOf(sub: AccountTypeSource): AccountType {
  const stored = sub?.accountType
  if (stored === 'internal' || stored === 'test' || stored === 'comped') return stored
  const noPlan = !sub?.plan || sub.plan === 'trial'
  if (!noPlan) return 'paid'
  return stored === 'free' ? 'free' : 'trial'
}

/** Internal and Test workspaces: never billed, no reminders, unlimited, always open. */
export const isHouseAccount = (type: AccountType) => HOUSE_TYPES.has(type)

/** Counted in platform metrics (MRR, trials, signups, conversion). */
export const countsInMetrics = (type: AccountType) => !isHouseAccount(type)

/**
 * Why staff cannot set `type` on this workspace, or null. Free and Trial
 * describe a workspace with no plan bought, Paid one with a plan (otherwise
 * accountTypeOf would not show what was set); Comped needs a future end date.
 */
export function accountTypeProblem(type: AccountType, current: { plan?: string | null; compedUntil?: Date | null }, now = new Date()): { message: string; field?: 'compedUntil' | 'accountType' } | null {
  const noPlan = !current.plan || current.plan === 'trial'
  if ((type === 'free' || type === 'trial') && !noPlan) return { message: `This workspace has a paid plan, so it cannot be ${ACCOUNT_TYPE_LABEL[type]}. Use Comped for a free or custom price.`, field: 'accountType' }
  if (type === 'paid' && noPlan) return { message: 'Set a plan first (Change plan); the workspace then counts as Paid.', field: 'accountType' }
  if (type === 'comped' && (!current.compedUntil || current.compedUntil.getTime() <= now.getTime())) return { message: 'Comped needs an end date in the future.', field: 'compedUntil' }
  return null
}

/** Last instant of the Free window: `months` (default FREE_MONTHS, or the Console setting) calendar months after `start`. */
export function freeEndsAt(start: Date, months: number = FREE_MONTHS): Date {
  const end = new Date(start.getTime())
  end.setUTCMonth(end.getUTCMonth() + months)
  return end
}

// ---------------------------------------------------------------------------
// Signup: Free or Trial by team size (console spec 5.3)
// ---------------------------------------------------------------------------

/** Onboarding answers to "How many people?". 2-5 and 6-10 replace the old 2-10 so the Free cut-off is exact. */
export const TEAM_SIZES = ['Just myself', '2-5', '6-10', '11-50', '51-200', '200-500', '500+'] as const
/** Stored values that are still valid (workspaces created before the split keep '2-10'). */
export const TEAM_SIZE_VALUES = [...TEAM_SIZES, '2-10'] as const
export type TeamSize = (typeof TEAM_SIZE_VALUES)[number]

/** The most people a team-size answer allows ('500+' has no top, so it is above any limit). */
export function teamSizeMax(size: string): number {
  if (size === 'Just myself') return 1
  const range = /^(\d+)-(\d+)$/.exec(size)
  return range ? Number(range[2]) : Number.POSITIVE_INFINITY
}

/**
 * Free when the answer and the people invited at onboarding (plus the owner)
 * fit in 5 seats; otherwise a 15-day Trial with everything.
 */
export function signupAccountType(input: { teamSize: string; invites: number }, freeSeats: number = FREE_SEAT_LIMIT): 'free' | 'trial' {
  const people = Math.max(teamSizeMax(input.teamSize), 1 + Math.max(0, input.invites))
  return people <= freeSeats ? 'free' : 'trial'
}
