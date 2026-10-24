import type { Usage } from '@/lib/billing'

/**
 * Seat usage for many workspaces at once (pure), counted the way
 * `usageOf` counts one workspace, so the Accounts list, "Call today" and the
 * account page agree: active members, pending invites, on-payroll employees,
 * and persons (members plus employees without an active login). Orbit and
 * Folio users are not counted here; they never decide the seat count.
 */

type Id = { toString(): string }
export type SeatRows = Readonly<{
  /** Active members. */
  members: readonly Readonly<{ orgId: Id; _id: Id }>[]
  /** Pending (not accepted, revoked or expired) invites. */
  invites: readonly Readonly<{ orgId: Id }>[]
  /** On-payroll, not deleted employees. */
  employees: readonly Readonly<{ orgId: Id; memberId?: Id | null }>[]
}>

const EMPTY: Usage = { members: 0, pendingInvites: 0, employees: 0, orbitUsers: 0, folioUsers: 0, persons: 0 }

export function seatUsageByOrg(rows: SeatRows): Map<string, Usage> {
  const memberIds = new Set(rows.members.map((m) => String(m._id)))
  const tally = new Map<string, Usage>()
  const bump = (orgId: Id, add: Partial<Usage>) => {
    const key = String(orgId)
    const now = tally.get(key) ?? EMPTY
    tally.set(key, { ...now, members: now.members + (add.members ?? 0), pendingInvites: now.pendingInvites + (add.pendingInvites ?? 0), employees: now.employees + (add.employees ?? 0), persons: now.persons + (add.persons ?? 0) })
  }
  for (const m of rows.members) bump(m.orgId, { members: 1, persons: 1 })
  for (const i of rows.invites) bump(i.orgId, { pendingInvites: 1 })
  for (const e of rows.employees) bump(e.orgId, { employees: 1, persons: e.memberId && memberIds.has(String(e.memberId)) ? 0 : 1 })
  return tally
}

export const usageFor = (usage: ReadonlyMap<string, Usage>, orgId: Id): Usage => usage.get(String(orgId)) ?? EMPTY
