import 'server-only'
import { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { DIRECTORY_STATUSES } from './lifecycle'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds, visibleFilter } from './scope'

/**
 * Employee record ↔ Flowbit login. The link is what puts a login's check-ins on the HR register, gives it
 * self-service, and tells check-in whether the person works remotely. One writer for every way a link is made:
 * the Link button, "Link logins" (bulk), adding an employee, the Excel import (both matched by work email).
 */

const LINKABLE_MEMBER = { status: { $in: ['active', 'invited'] }, employeeId: null } as const

export type LinkHow = 'single' | 'bulk' | 'auto'

/** Links both ways and files the login's past check-ins under the employee. Audited. */
export async function linkRecords(ctx: Ctx, employee: { _id: Types.ObjectId; fullName: string; memberId?: Types.ObjectId | null }, member: { _id: Types.ObjectId }, how: LinkHow): Promise<void> {
  if (employee.memberId && String(employee.memberId) !== String(member._id)) await ctx.db(Member).updateOne({ _id: employee.memberId }, { $unset: { employeeId: 1 } })
  await ctx.db(Member).updateOne({ _id: member._id }, { $set: { employeeId: employee._id } })
  await ctx.db(Employee).updateOne({ _id: employee._id }, { $set: { memberId: member._id } })
  await ctx.db(AttendanceDay).updateMany({ memberId: member._id }, { $set: { employeeId: employee._id } })
  const by = how === 'auto' ? ' (matched by work email)' : how === 'bulk' ? ' (Link logins)' : ''
  await audit(ctx, { action: 'employee.member_linked', entity: 'Employee', entityId: employee._id, summary: `Linked ${employee.fullName} to a Flowbit login${by}`, product: 'muster', meta: { memberId: String(member._id), how } })
}

/** Unlinked logins of this workspace by their sign-in email (lowercase). */
async function linkableLoginsByEmail(ctx: Ctx, emails?: string[]) {
  const members = await ctx.db(Member).find(LINKABLE_MEMBER, { userId: 1, status: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) }, ...(emails ? { email: { $in: emails } } : {}) }, { email: 1, name: 1 }).lean()
  const userById = new Map(users.map((u) => [String(u._id), u]))
  return new Map(members.flatMap((m) => {
    const u = userById.get(String(m.userId))
    return u ? [[u.email.toLowerCase(), { member: m, name: u.name, email: u.email.toLowerCase() }] as const] : []
  }))
}

/**
 * After employees are added (one by hand, or an Excel import): links each still-unlinked one to the unlinked
 * login with the same email. Returns the names linked.
 */
export async function linkByWorkEmail(ctx: Ctx, employeeIds: readonly Types.ObjectId[]): Promise<string[]> {
  if (!employeeIds.length) return []
  const employees = await ctx.db(Employee).find({ _id: { $in: employeeIds }, deletedAt: null, memberId: null }, { fullName: 1, workEmailLower: 1 }).lean()
  if (!employees.length) return []
  const logins = await linkableLoginsByEmail(ctx, employees.map((e) => e.workEmailLower))
  const linked: string[] = []
  for (const e of employees) {
    const login = logins.get(e.workEmailLower)
    if (!login) continue
    await linkRecords(ctx, e, login.member, 'auto')
    logins.delete(e.workEmailLower)
    linked.push(login.name)
  }
  return linked
}

export type LinkMatch = { employeeId: string; name: string; code: string; email: string; invited: boolean; own: boolean }
export type UnlinkedEmployee = { employeeId: string; name: string; code: string; email: string }
export type UnlinkedLogin = { name: string; email: string; invited: boolean }
export type LinkPlan = { matches: LinkMatch[]; withoutLogin: UnlinkedEmployee[]; withoutEmployee: UnlinkedLogin[] }

/**
 * "Link logins": every employee this person may see who has no login, paired with the unlinked login that signs
 * in with their work email. `own` marks the viewer's own record, which only someone who may decide their own
 * matters can link.
 */
export async function loginLinkPlan(ctx: Ctx): Promise<LinkPlan> {
  const visible = await visibleEmployeeIds(ctx)
  const [employees, logins] = await Promise.all([
    ctx.db(Employee).find({ deletedAt: null, memberId: null, status: { $in: DIRECTORY_STATUSES }, ...visibleFilter(visible) }, { fullName: 1, code: 1, workEmailLower: 1 }).sort({ fullName: 1 }).lean(),
    linkableLoginsByEmail(ctx),
  ])
  // Without a linked record, "own" is the record whose work email is the viewer's sign-in email.
  const own = ownEmployeeId(ctx)
  const viewerEmail = ctx.user.email.toLowerCase()
  const matches: LinkMatch[] = []
  const withoutLogin: UnlinkedEmployee[] = []
  for (const e of employees) {
    const login = logins.get(e.workEmailLower)
    const row = { employeeId: String(e._id), name: e.fullName, code: e.code, email: e.workEmailLower }
    if (!login) {
      withoutLogin.push(row)
      continue
    }
    matches.push({ ...row, invited: login.member.status === 'invited', own: !mayDecideOwn(ctx) && (String(e._id) === own || e.workEmailLower === viewerEmail) })
    logins.delete(e.workEmailLower)
  }
  const withoutEmployee = [...logins.values()].map((l) => ({ name: l.name, email: l.email, invited: l.member.status === 'invited' })).sort((a, b) => a.name.localeCompare(b.name))
  return { matches, withoutLogin, withoutEmployee }
}

/** Links the chosen matches of a fresh plan (never pairs sent by the browser). Returns how many, and who was left. */
export async function linkChosen(ctx: Ctx, employeeIds: readonly string[]): Promise<{ linked: number; skipped: number }> {
  const chosen = new Set(employeeIds)
  const plan = await loginLinkPlan(ctx)
  const ready = plan.matches.filter((m) => chosen.has(m.employeeId) && !m.own)
  if (!ready.length) return { linked: 0, skipped: chosen.size }
  const logins = await linkableLoginsByEmail(ctx, ready.map((m) => m.email))
  const employees = await ctx.db(Employee).find({ _id: { $in: ready.map((m) => new Types.ObjectId(m.employeeId)) }, memberId: null, deletedAt: null }, { fullName: 1, workEmailLower: 1 }).lean()
  let linked = 0
  for (const e of employees) {
    const login = logins.get(e.workEmailLower)
    if (!login) continue
    await linkRecords(ctx, e, login.member, 'bulk')
    linked += 1
  }
  return { linked, skipped: chosen.size - linked }
}

/** People in the directory with no login linked (the "Missing login" filter and the attendance note count them). */
export const unlinkedCount = async (ctx: Ctx): Promise<number> =>
  ctx.db(Employee).countDocuments({ deletedAt: null, memberId: null, status: { $in: DIRECTORY_STATUSES }, ...visibleFilter(await visibleEmployeeIds(ctx)) })
