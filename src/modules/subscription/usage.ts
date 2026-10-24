import 'server-only'
import type { Model, Types } from 'mongoose'
import { capacity, SEAT_ROW_KEYS, type CapacityRow, type Usage } from '@/lib/billing'
import { entitlements } from '@/lib/entitlements'
import { capacityBreach } from './capacity-gate'
import type { Scoped } from '@/lib/db/scoped'
import { FreeSeatLimitError, UserError } from '@/lib/errors'
import { permissionsOf } from '@/lib/catalog'
import { resolvePermissions } from '@/lib/permissions'
import { recordUsage } from '@/lib/usage'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { Employee } from '@/models/muster/Employee'
import { FolioEntity } from '@/models/folio/Entity'
import { PAYROLL_STATUSES } from '@/modules/muster/people/lifecycle'
import { planConfig } from '@/modules/console/settings-query'

/** Anything with an org-scoped db: a member Ctx or platformDb().forOrg(orgId). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrgDb = { orgId: Types.ObjectId; db: <M extends Model<any>>(model: M) => Scoped<M> }

const FOLIO_PERMS = new Set<string>(permissionsOf('folio'))

type CapacitySub = Parameters<typeof capacity>[0]
const NO_PLAN: CapacitySub = { status: 'expired', plan: 'trial' }
/** The stored subscription as `capacity()` reads it. */
export const subOf = (org: { subscription?: unknown } | null | undefined): CapacitySub => (org?.subscription as CapacitySub | undefined) ?? NO_PLAN

type CustomRoles = { _id: unknown; key: string; label: string; permissions: string[] }[]
type UsageOpts = {
  /** "What if these members had these roles": capacity checks before a role change or ownership transfer. */
  roleOverrides?: { memberId: string; role: string }[]
  customRoles?: CustomRoles
  /** Leave out pending invites to these emails (they are about to be replaced by new ones). */
  excludeInviteEmails?: string[]
}

/** Which per-product seats a set of permissions takes: Orbit sales user, Folio user. */
function seatKinds(perms: Set<string>): { orbit: boolean; folio: boolean } {
  return { orbit: perms.has('leads.write') || perms.has('deals.write'), folio: [...perms].some((p) => FOLIO_PERMS.has(p)) }
}

/** Employees that take a seat: on payroll, not deleted, and not part of the sample agency (R1 1.3). */
export const SEAT_EMPLOYEES = { status: { $in: PAYROLL_STATUSES }, deletedAt: null, sample: { $ne: true } } as const

/**
 * Usage counted from the collections every time (platform spec 6.4), never a
 * stored counter. Pending invites count towards Orbit and Folio users with
 * their invited role, as they do towards logins, so accepting one never goes
 * past a limit. Optional overrides answer "what if" for capacity checks.
 */
export async function usageOf(target: OrgDb, opts: UsageOpts = {}): Promise<Usage> {
  const now = new Date()
  const excluded = opts.excludeInviteEmails?.length ? { email: { $nin: opts.excludeInviteEmails } } : {}
  const [members, invites, customRoles, employees, folioFirms] = await Promise.all([
    target.db(Member).find({ status: 'active' }, { role: 1 }).lean(),
    target.db(Invite).find({ acceptedAt: null, revokedAt: null, expiresAt: { $gt: now }, ...excluded }, { role: 1 }).lean(),
    opts.customRoles ?? target.db(Role).find({ builtIn: false }).lean(),
    target.db(Employee).find(SEAT_EMPLOYEES, { memberId: 1 }).lean(),
    activeFirmCount(target),
  ])
  const memberIds = new Set(members.map((m) => String(m._id)))
  const overrides = new Map((opts.roleOverrides ?? []).map((o) => [o.memberId, o.role]))
  const roles = [...members.map((m) => overrides.get(String(m._id)) ?? m.role), ...invites.map((i) => i.role)]
  let orbitUsers = 0
  let folioUsers = 0
  for (const role of roles) {
    const kinds = seatKinds(resolvePermissions(role, customRoles))
    if (kinds.orbit) orbitUsers += 1
    if (kinds.folio) folioUsers += 1
  }
  const employeesWithoutLogin = employees.filter((e) => !e.memberId || !memberIds.has(String(e.memberId))).length
  return { members: members.length, pendingInvites: invites.length, employees: employees.length, orbitUsers, folioUsers, persons: members.length + employeesWithoutLogin, folioFirms }
}

/** Active Folio firms (billing entities) of the workspace. */
export const activeFirmCount = (target: OrgDb) => target.db(FolioEntity).countDocuments({ isActive: true })

/** Capacity rows for the workspace's current plan. */
export async function capacityOf(target: OrgDb): Promise<{ usage: Usage; rows: CapacityRow[] }> {
  const [usage, org, config] = await Promise.all([usageOf(target), Org.findById(target.orgId, { subscription: 1 }).lean(), planConfig()])
  return { usage, rows: entitlements({ subscription: subOf(org) }, new Date(), usage, config).capacity }
}

const ROW_MESSAGES: Record<string, (row: CapacityRow, before: CapacityRow) => string> = {
  logins: (row, before) => seatsMessage(row, before),
  persons: (row, before) => seatsMessage(row, before),
  seats: (row) => `The Free plan covers ${row.limit ?? 0} people. Upgrade to a plan, or start a trial with your whole team, to add more.`,
  employees: (row) => `Muster is paid for ${row.limit} employees. Add more in Settings → Plan & billing.`,
  orbit: (row) => `Orbit is paid for ${row.limit} sales users and all of them are in use. Add one in Settings → Plan & billing.`,
  folio: (row) => `Folio includes ${row.limit} users. Move to Suite for more.`,
  firms: (row) => `Your plan includes ${row.limit} Folio firms and all of them are in use. Add a firm in Settings → Plan & billing.`,
}

function seatsMessage(row: CapacityRow, before: CapacityRow): string {
  const needed = row.used - before.used
  const left = Math.max(0, (row.limit ?? 0) - before.used)
  return `That needs ${needed} ${needed === 1 ? 'seat' : 'seats'} and you have ${left} left. Add seats in Settings → Plan & billing.`
}

/**
 * Refuses a change that would push a limit past the plan (invites, enabling a
 * member, giving someone Orbit or Folio, adding employees on payroll). Only limits the change makes worse
 * are checked. `message` overrides the copy for seat limits.
 */
export async function assertCapacity(
  target: OrgDb,
  change: {
    addLogins?: number
    /** The role of each login being added (invites, re-enabling): counts them as Orbit or Folio users. */
    addRoles?: string[]
    /** Employees moving onto payroll (create, import, reactivate); they count as persons until they get a login. */
    addEmployees?: number
    /** Of those, how many already have an active login (already counted as persons). */
    addEmployeesWithLogin?: number
  } & UsageOpts,
  message?: string,
): Promise<void> {
  const org = await Org.findById(target.orgId, { subscription: 1 }).lean()
  if (!org) return
  const customRoles = change.customRoles ?? (change.addRoles?.length ? await target.db(Role).find({ builtIn: false }).lean() : undefined)
  const whatIf = Boolean(change.roleOverrides?.length || change.customRoles || change.excludeInviteEmails?.length)
  const [before, afterBase] = await Promise.all([
    usageOf(target, { customRoles: change.customRoles ? undefined : customRoles }),
    whatIf ? usageOf(target, { roleOverrides: change.roleOverrides, customRoles, excludeInviteEmails: change.excludeInviteEmails }) : null,
  ])
  const after = { ...(afterBase ?? before) }
  if (change.addLogins) {
    after.pendingInvites += change.addLogins
    after.persons += change.addLogins
  }
  for (const role of change.addRoles ?? []) {
    const kinds = seatKinds(resolvePermissions(role, customRoles ?? []))
    if (kinds.orbit) after.orbitUsers += 1
    if (kinds.folio) after.folioUsers += 1
  }
  if (change.addEmployees) {
    after.employees += change.addEmployees
    after.persons += change.addEmployees - (change.addEmployeesWithLogin ?? 0)
  }
  const breach = capacityBreach({ subscription: subOf(org) }, before, after, new Date(), await planConfig())
  if (!breach) return
  const { row, before: prev } = breach
  recordUsage({ kind: 'limit_hit', orgId: target.orgId, meta: { limit: row.key, used: row.used, max: row.limit } })
  // Free's 6th person: the client offers Upgrade or Start trial (console spec 4.2).
  if (row.key === 'seats') throw new FreeSeatLimitError(ROW_MESSAGES.seats(row, prev), breach.trialAvailable)
  const seatLimit = SEAT_ROW_KEYS.includes(row.key)
  throw new UserError(seatLimit && message ? message : ROW_MESSAGES[row.key](row, prev))
}
