import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import type { ListParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { DIRECTORY_STATUSES } from '../people/lifecycle'
import { employeeNames } from '../people/queries'
import { visibleEmployeeIds, visibleFilter } from '../people/scope'
import { isDecidableBy, whereItSits } from './approvals'
import { approvalActor, managerLapse, routedWith } from './routing'

export const LEAVE_TABS = ['pending', 'approved', 'rejected', 'all'] as const
export type LeaveTab = (typeof LEAVE_TABS)[number]

export type LeaveRow = {
  id: string
  employeeId: string
  employee: string
  type: string
  code: string
  startDate: string
  endDate: string
  isHalfDay: boolean
  dayCount: number
  paidDays: number
  unpaidDays: number
  reason: string
  status: string
  where: string
  decidable: boolean
  cancellable: boolean
  attachmentFileId: string | null
}

/** Leave requests the viewer may see, newest first, with "waiting on you" flags. */
export async function listLeaveRequests(ctx: Ctx, tab: LeaveTab, p: ListParams) {
  const visible = await visibleEmployeeIds(ctx)
  const actor = approvalActor(ctx, 'leave.approve')
  const filter: Record<string, unknown> = { ...visibleFilter(visible, 'employeeId'), ...(tab === 'all' ? {} : { status: tab }) }
  if (p.q) {
    const ids = await ctx.db(Employee).distinct('_id', { fullName: new RegExp(escapeRegex(p.q), 'i') })
    filter.employeeId = visible === null ? { $in: ids } : { $in: ids.filter((id) => visible.includes(String(id))) }
  }
  const [rows, total, pendingAll] = await Promise.all([
    ctx.db(LeaveRequest).find(filter).sort({ status: tab === 'all' ? 1 : -1, startDate: -1, createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(LeaveRequest).countDocuments(filter),
    ctx.db(LeaveRequest).find({ ...visibleFilter(visible, 'employeeId'), status: 'pending' }, { employeeId: 1, managerId: 1, stages: 1, completedStages: 1, status: 1, dayCount: 1 }).lean(),
  ])
  const names = await employeeNames(ctx, [...rows.map((r) => r.employeeId), ...rows.map((r) => r.managerId)])
  const routed = routedWith(await managerLapse(ctx, [...rows, ...pendingAll], 'leave.approve'))
  const canCancelApproved = ctx.can('leave.manage')
  const out: LeaveRow[] = rows.map((r) => ({
    id: String(r._id),
    employeeId: String(r.employeeId),
    employee: names.get(String(r.employeeId)) ?? 'Unknown',
    type: r.leaveName,
    code: r.leaveCode,
    startDate: r.startDate,
    endDate: r.endDate,
    isHalfDay: Boolean(r.isHalfDay),
    dayCount: r.dayCount,
    paidDays: r.paidDays ?? 0,
    unpaidDays: r.unpaidDays ?? 0,
    reason: r.reason,
    status: r.status,
    where: whereItSits(routed(r), r.managerId ? names.get(String(r.managerId)) : undefined),
    decidable: isDecidableBy(actor, routed(r)),
    cancellable: r.status === 'pending' ? actor.canSignHr || actor.employeeId === String(r.employeeId) : r.status === 'approved' && canCancelApproved,
    attachmentFileId: r.attachmentFileId ? String(r.attachmentFileId) : null,
  }))
  const waiting = pendingAll.filter((r) => isDecidableBy(actor, routed(r)))
  return { rows: out, total, waitingCount: waiting.length, waitingDays: waiting.reduce((s, r) => s + r.dayCount, 0), pendingCount: pendingAll.length }
}

/** Active leave types for pickers. */
export async function leaveTypeOptions(ctx: Ctx) {
  const types = await ctx.db(LeaveType).find({ isActive: true }).sort({ displayOrder: 1, code: 1 }).lean()
  return types.map((t) => ({ value: String(t._id), label: `${t.name} (${t.code})`, allowHalfDay: t.allowHalfDay !== false, isPaid: t.isPaid, code: t.code }))
}

/** People the viewer can apply leave for (visible and in the directory). */
export async function applicableEmployees(ctx: Ctx) {
  const visible = await visibleEmployeeIds(ctx)
  const rows = await ctx.db(Employee).find({ deletedAt: null, status: { $in: DIRECTORY_STATUSES }, ...visibleFilter(visible) }, { fullName: 1, code: 1 }).sort({ fullName: 1 }).lean()
  return rows.map((r) => ({ value: String(r._id), label: `${r.fullName} (${r.code})` }))
}

export type CalendarEntry = { id: string; employee: string; department: string | null; type: string; status: string; dates: string[]; isHalfDay: boolean }

/** Approved and pending leave touching a month, for the team calendar. */
export async function leaveCalendar(ctx: Ctx, start: string, end: string, departmentId?: string): Promise<CalendarEntry[]> {
  const visible = await visibleEmployeeIds(ctx)
  const empFilter: Record<string, unknown> = { deletedAt: null, ...visibleFilter(visible) }
  if (departmentId && Types.ObjectId.isValid(departmentId)) empFilter.departmentId = new Types.ObjectId(departmentId)
  const employees = await ctx.db(Employee).find(empFilter, { fullName: 1, departmentId: 1 }).lean()
  const byId = new Map(employees.map((e) => [String(e._id), e]))
  const requests = await ctx.db(LeaveRequest).find({ employeeId: { $in: employees.map((e) => e._id) }, status: { $in: ['approved', 'pending'] }, startDate: { $lte: end }, endDate: { $gte: start } }).sort({ startDate: 1 }).lean()
  return requests.map((r) => ({
    id: String(r._id),
    employee: byId.get(String(r.employeeId))?.fullName ?? 'Unknown',
    department: byId.get(String(r.employeeId))?.departmentId ? String(byId.get(String(r.employeeId))?.departmentId) : null,
    type: r.leaveName,
    status: r.status,
    dates: (r.dates ?? []).filter((d) => d >= start && d <= end),
    isHalfDay: Boolean(r.isHalfDay),
  }))
}
