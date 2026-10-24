/**
 * Console staff roles and what each may do (console spec 7.1). Pure and
 * client-safe: the Console's server actions and pages check `staffCan` on the
 * server; the UI uses the same table only to hide buttons.
 */

export const STAFF_ROLES = ['admin', 'sales', 'accounts'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = { admin: 'Admin', sales: 'Sales', accounts: 'Accounts' }

export const isStaffRole = (value: unknown): value is StaffRole => typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)

export const CONSOLE_PERMS = [
  'accounts.view',
  'accounts.note',
  'accounts.assign',
  'trial.extend_once',
  'trial.extend_more',
  'trial.end',
  'account.set_type',
  'account.set_plan',
  'account.set_status',
  'account.disable',
  'account.restore',
  'support.request',
  'import.run',
  'handover.manage',
  'billing.view',
  'invoice.cancel',
  'bill.create',
  'payment.record',
  'payment.verify',
  'credit_note.issue',
  'tds.manage',
  'inbox.reply',
  'wallet.grant',
  'reports.view',
  'breach.notify',
  'staff.manage',
  'settings.edit',
] as const
export type ConsolePerm = (typeof CONSOLE_PERMS)[number]

const SALES: readonly ConsolePerm[] = ['accounts.view', 'accounts.note', 'trial.extend_once', 'support.request', 'import.run', 'handover.manage', 'bill.create', 'inbox.reply', 'reports.view']
const ACCOUNTS: readonly ConsolePerm[] = ['accounts.view', 'accounts.note', 'billing.view', 'invoice.cancel', 'support.request', 'bill.create', 'payment.record', 'payment.verify', 'credit_note.issue', 'tds.manage', 'inbox.reply', 'reports.view']

/** The role table: Admin has everything; Sales and Accounts their rows of spec 7.1. */
export const ROLE_PERMS: Record<StaffRole, ReadonlySet<ConsolePerm>> = {
  admin: new Set(CONSOLE_PERMS),
  sales: new Set(SALES),
  accounts: new Set(ACCOUNTS),
}

export function staffCan(role: StaffRole | null | undefined, perm: ConsolePerm): boolean {
  return role ? ROLE_PERMS[role].has(perm) : false
}

/** Days one Sales extension adds (spec 4.1: "Sales may extend it once by 15 days"). */
export const SALES_TRIAL_EXTENSION_DAYS = 15

export const TRIAL_ALREADY_EXTENDED = 'This trial was already extended once. Ask an Admin to extend it again.'

/**
 * Why this staff member may not extend the trial now, or null. Sales gets one
 * extension of at most `maxDays` (Console settings, default 15) per
 * workspace; a second one, or a longer one, needs Admin. The "once" is
 * enforced again atomically when the extension is claimed (V2-REVIEW C9).
 */
export function trialExtensionRefusal(role: StaffRole, input: { extensionsSoFar: number; days: number; maxDays?: number }): string | null {
  const maxDays = input.maxDays ?? SALES_TRIAL_EXTENSION_DAYS
  if (staffCan(role, 'trial.extend_more')) return null
  if (!staffCan(role, 'trial.extend_once')) return 'Only Sales or Admin can extend a trial.'
  if (input.extensionsSoFar > 0) return TRIAL_ALREADY_EXTENDED
  if (input.days > maxDays) return `Sales can extend by at most ${maxDays} days. Ask an Admin for more.`
  return null
}

/** Storage for the extension count (ConsoleAccount.trialExtensions); `claim` is one conditional update. */
export type ExtensionStore = Readonly<{
  /** Adds one extension; with `onlyFirst`, only when none was made yet. False when that condition failed. */
  claim: (orgId: string, onlyFirst: boolean) => Promise<boolean>
  /** Gives the claim back when the trial itself could not be moved. */
  release: (orgId: string) => Promise<void>
}>

/**
 * Claims the extension, then moves the trial. Sales' "once" is part of the
 * claim's filter, so two requests at the same moment cannot both extend
 * (V2-REVIEW C9). A failed move gives the claim back.
 */
export async function claimTrialExtension(store: ExtensionStore, input: { orgId: string; role: StaffRole }, move: () => Promise<void>): Promise<{ ok: true } | { ok: false; error: string }> {
  const onlyFirst = !staffCan(input.role, 'trial.extend_more')
  if (!(await store.claim(input.orgId, onlyFirst))) return { ok: false, error: TRIAL_ALREADY_EXTENDED }
  try {
    await move()
    return { ok: true }
  } catch (error) {
    await store.release(input.orgId)
    throw error
  }
}

