import type { CapacityRow, Usage } from '@/lib/billing'
import { entitlements, type EntitlementLimits } from '@/lib/entitlements'
import type { OrgLike } from '@/lib/plans'

/**
 * The capacity gate (platform spec 6.4, console spec 4.2), pure: the first
 * limit a change pushes past the plan, comparing usage before and after.
 * Only limits the change makes worse count, so a workspace already over a
 * limit can still remove people. All limits come from `entitlements()`.
 */

export type CapacityBreach = {
  row: CapacityRow
  /** The same row before the change. */
  before: CapacityRow
  /** Free's 6th person: true while the workspace may still start its one 15-day trial. */
  trialAvailable: boolean
}

export function capacityBreach(org: OrgLike, before: Usage, after: Usage, now: Date = new Date(), limits: EntitlementLimits = {}): CapacityBreach | null {
  const rowsBefore = entitlements(org, now, before, limits).capacity
  const entAfter = entitlements(org, now, after, limits)
  for (const row of entAfter.capacity) {
    const prev = rowsBefore.find((r) => r.key === row.key) ?? row
    if (row.limit == null || row.used <= row.limit || row.used <= prev.used) continue
    return { row, before: prev, trialAvailable: entAfter.trialAvailable }
  }
  return null
}
