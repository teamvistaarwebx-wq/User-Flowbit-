import { accountTypeOf } from '@/lib/account-types'
import { accessState, effectiveStatus, isHouseOrg, type OrgLike } from '@/lib/plans'

/**
 * Paid add-ons (Console → workspace → Add-ons), pure and client-safe:
 *  - portal: the client portal; included in Suite, an add-on on Custom plans.
 *  - meetings_ai: meeting transcripts and minutes, capped in hours a month.
 *  - domains: a custom sending domain and portal domain (about ₹999 a month).
 * A running trial and Internal/Test workspaces get all of them. The Free plan
 * gets none (owner decision D9; Free is stored as 'trialing', so it is excluded
 * by account type first), even if one was switched on for it. A workspace that
 * is not fully writable (read-only, blocked) gets none either. entitlements()
 * lists them as feature keys, so every gate follows this one rule.
 */

export const ADD_ONS = ['portal', 'meetings_ai', 'domains'] as const
export type AddOn = (typeof ADD_ONS)[number]

export const ADD_ON_LABEL: Readonly<Record<AddOn, string>> = { portal: 'Client portal', meetings_ai: 'Meetings AI', domains: 'Custom domains' }

export const isAddOn = (value: unknown): value is AddOn => typeof value === 'string' && (ADD_ONS as readonly string[]).includes(value)

/** Add-ons included in a plan without buying them. */
const INCLUDED_IN_SUITE: readonly AddOn[] = ['portal']

export function hasAddOn(org: OrgLike, addOn: AddOn, now: Date = new Date()): boolean {
  if (org.deletedAt || org.disabled || accessState(org, now) !== 'full') return false
  if (accountTypeOf(org.subscription) === 'free') return false
  if (isHouseOrg(org) || effectiveStatus(org.subscription, now).status === 'trialing') return true
  if (org.subscription?.plan === 'suite' && INCLUDED_IN_SUITE.includes(addOn)) return true
  return (org.subscription?.addOns ?? []).includes(addOn)
}

export const addOnsOf = (org: OrgLike, now: Date = new Date()): AddOn[] => ADD_ONS.filter((a) => hasAddOn(org, a, now))
