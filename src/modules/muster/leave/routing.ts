import 'server-only'
import { Types } from 'mongoose'
import type { Permission } from '@/lib/catalog'
import type { Ctx } from '@/lib/ctx'
import { notify, notifyMembers, userIdsWithPermission } from '@/lib/notify'
import { resolvePermissions } from '@/lib/permissions'
import { Member } from '@/models/Member'
import { Role } from '@/models/Role'
import { Employee } from '@/models/muster/Employee'
import type { ActionSubject } from '@/modules/actionlinks/kinds'
import { mayDecideOwn, ownEmployeeId } from '../people/scope'
import { currentStage, stagesFor, type Actor, type ApprovalStage } from './approvals'

/**
 * Server side of approval routing: who the actor is, which stages a new
 * request needs, and who to tell. `hrPerm` is leave.approve for leave and
 * attendance.approve for corrections and comp-off.
 */

export function approvalActor(ctx: Ctx, hrPerm: Permission): Actor {
  return {
    employeeId: ownEmployeeId(ctx),
    canSignHr: ctx.can(hrPerm) && ctx.can('people.read_all'),
    canEscalated: ctx.can('approvals.escalated'),
    canDecideOwn: mayDecideOwn(ctx),
  }
}

async function permissionsOfEmployee(ctx: Pick<Ctx, 'db' | 'orgId'>, employeeId: Types.ObjectId) {
  const [members, customRoles] = await Promise.all([
    ctx.db(Member).find({ employeeId, status: 'active' }, { role: 1 }).lean(),
    Role.find({ orgId: ctx.orgId, builtIn: false }).lean(),
  ])
  return members.length ? members.map((m) => resolvePermissions(m.role, customRoles)) : [resolvePermissions('member', customRoles)]
}

/** Manager employee ids (of those given) whose active login may approve this kind of request. */
async function managersWhoCanSign(ctx: Pick<Ctx, 'db' | 'orgId'>, managerIds: readonly Types.ObjectId[], hrPerm: Permission): Promise<Set<string>> {
  if (!managerIds.length) return new Set()
  const managers = await ctx.db(Employee).find({ _id: { $in: managerIds } }, { memberId: 1 }).lean()
  const memberIds = managers.map((m) => m.memberId).filter(Boolean)
  if (!memberIds.length) return new Set()
  const [members, customRoles] = await Promise.all([ctx.db(Member).find({ _id: { $in: memberIds }, status: 'active' }, { role: 1 }).lean(), Role.find({ orgId: ctx.orgId, builtIn: false }).lean()])
  const signing = new Set(members.filter((m) => resolvePermissions(m.role, customRoles).has(hrPerm)).map((m) => String(m._id)))
  return new Set(managers.filter((m) => m.memberId && signing.has(String(m.memberId))).map((m) => String(m._id)))
}

/** Stages for a new request, judged by the applicant's own accounts (never by who raised it). */
export async function routeFor(ctx: Pick<Ctx, 'db' | 'orgId'>, employee: { _id: Types.ObjectId; managerId?: Types.ObjectId | null }, hrPerm: Permission): Promise<{ stages: ApprovalStage[]; managerId: Types.ObjectId | null }> {
  const managerCanSign = employee.managerId ? (await managersWhoCanSign(ctx, [employee.managerId], hrPerm)).has(String(employee.managerId)) : false
  const perms = await permissionsOfEmployee(ctx, employee._id)
  const applicantCanSignHr = perms.some((p) => p.has(hrPerm) && p.has('people.read_all'))
  const stages = stagesFor({ employeeId: String(employee._id), managerId: employee.managerId ? String(employee.managerId) : null, managerCanSign, applicantCanSignHr })
  return { stages, managerId: employee.managerId ?? null }
}

type Pending = { employeeId: Types.ObjectId | string; managerId?: Types.ObjectId | string | null; stages: readonly string[]; completedStages: readonly string[]; status: string }

/**
 * For requests waiting at the manager stage: true when that manager can no
 * longer sign (their login is gone or may not approve, or the person now
 * reports to someone else). HR then signs the stage instead.
 */
export async function managerLapse(ctx: Pick<Ctx, 'db' | 'orgId'>, requests: readonly Pending[], hrPerm: Permission): Promise<(request: Pending) => boolean> {
  const atManager = requests.filter((r) => r.status === 'pending' && r.managerId && currentStage(r.stages, r.completedStages) === 'manager')
  if (!atManager.length) return () => false
  const ids = (list: (Types.ObjectId | string)[]) => [...new Set(list.map(String))].map((id) => new Types.ObjectId(id))
  const [signers, people] = await Promise.all([
    managersWhoCanSign(ctx, ids(atManager.map((r) => r.managerId!)), hrPerm),
    ctx.db(Employee).find({ _id: { $in: ids(atManager.map((r) => r.employeeId)) } }, { managerId: 1 }).lean(),
  ])
  const currentManager = new Map(people.map((p) => [String(p._id), p.managerId ? String(p.managerId) : null]))
  return (r) => {
    if (r.status !== 'pending' || !r.managerId || currentStage(r.stages, r.completedStages) !== 'manager') return false
    return !signers.has(String(r.managerId)) || currentManager.get(String(r.employeeId)) !== String(r.managerId)
  }
}

/** The request as the approval rules see it, with the manager-stage lapse worked out. */
export const routedWith = (lapsed: (r: Pending) => boolean) => (r: Pending) => ({
  employeeId: String(r.employeeId), managerId: r.managerId ? String(r.managerId) : null, stages: r.stages, completedStages: r.completedStages, status: r.status, managerLapsed: lapsed(r),
})

type Message = { title: string; body?: string; href: string; event: string; /** Approve / Reject buttons in the alert's email and WhatsApp copy. */ action?: ActionSubject }

/** Tells whoever signs the request's current stage that it is waiting on them. */
export async function notifyApprovers(ctx: Ctx, request: { stages: readonly string[]; completedStages: readonly string[]; managerId?: Types.ObjectId | null }, hrPerm: Permission, message: Message): Promise<void> {
  const stage = currentStage(request.stages, request.completedStages)
  const input = { ...message, kind: 'approval' as const, product: 'muster' }
  if (stage === 'manager' && request.managerId) {
    const manager = await ctx.db(Employee).findById(request.managerId, { memberId: 1 }).lean()
    if (manager?.memberId) await notifyMembers(ctx, [manager.memberId], input)
    return
  }
  if (stage === 'hr' || stage === 'manager') {
    const [signers, everyone] = await Promise.all([userIdsWithPermission(ctx.orgId, hrPerm), userIdsWithPermission(ctx.orgId, 'people.read_all')])
    const all = new Set(everyone.map(String))
    await notify(ctx, { ...input, userIds: signers.filter((id) => all.has(String(id))) })
    return
  }
  if (stage === 'management') await notify(ctx, { ...input, userIds: await userIdsWithPermission(ctx.orgId, 'approvals.escalated') })
}

/** Tells the employee (when they have a login) about the final decision. */
export async function notifyEmployee(ctx: Ctx, employeeId: Types.ObjectId, message: Message & { kind?: 'success' | 'warning' | 'info' }): Promise<void> {
  const employee = await ctx.db(Employee).findById(employeeId, { memberId: 1 }).lean()
  if (!employee?.memberId) return
  await notifyMembers(ctx, [employee.memberId], { ...message, kind: message.kind ?? 'info', product: 'muster' })
}
