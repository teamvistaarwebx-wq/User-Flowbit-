import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { CompOff } from '@/models/muster/CompOff'
import { isDecidableBy, whereItSits } from '../leave/approvals'
import { approvalActor, managerLapse, routedWith } from '../leave/routing'
import { employeeNames } from '../people/queries'
import { visibleEmployeeIds, visibleFilter } from '../people/scope'

export const REQUEST_TABS = ['pending', 'approved', 'all'] as const
export type RequestTab = (typeof REQUEST_TABS)[number]


export type RequestRow = { id: string; employeeId: string; employee: string; date: string; what: string; reason: string; status: string; where: string; signedBy: string[]; decidable: boolean; extra?: string }

const statusFilter = (tab: RequestTab): Record<string, unknown> => (tab === 'pending' ? { status: 'pending' } : tab === 'approved' ? { status: 'approved' } : {})

/** Correction requests raised by employees (HR overrides are not listed here). */
export async function listCorrections(ctx: Ctx, tab: RequestTab, labelOf: (status: string) => string) {
  const visible = await visibleEmployeeIds(ctx)
  const rows = await ctx.db(AttendanceCorrection).find({ kind: 'request', ...visibleFilter(visible, 'employeeId'), ...statusFilter(tab) }).sort({ createdAt: -1 }).limit(200).lean()
  const names = await employeeNames(ctx, [...rows.map((r) => r.employeeId), ...rows.map((r) => r.managerId)])
  const actor = approvalActor(ctx, 'attendance.approve')
  const routedOf = routedWith(await managerLapse(ctx, rows, 'attendance.approve'))
  return rows.map<RequestRow>((r) => ({
    id: String(r._id),
    employeeId: String(r.employeeId),
    employee: names.get(String(r.employeeId)) ?? 'Unknown',
    date: r.date,
    what: `${labelOf(r.currentStatus ?? 'unmarked')} → ${labelOf(r.requestedStatus)}`,
    reason: r.reason,
    status: r.status,
    where: whereItSits(routedOf(r), r.managerId ? names.get(String(r.managerId)) : undefined),
    signedBy: (r.decisions ?? []).map((d) => d.decidedByName ?? '').filter(Boolean),
    decidable: isDecidableBy(actor, routedOf(r)),
  }))
}

export async function listCompOffs(ctx: Ctx, tab: RequestTab) {
  const visible = await visibleEmployeeIds(ctx)
  const rows = await ctx.db(CompOff).find({ ...visibleFilter(visible, 'employeeId'), ...statusFilter(tab) }).sort({ workedOn: -1 }).limit(200).lean()
  const names = await employeeNames(ctx, [...rows.map((r) => r.employeeId), ...rows.map((r) => r.managerId)])
  const actor = approvalActor(ctx, 'attendance.approve')
  const routedOf = routedWith(await managerLapse(ctx, rows, 'attendance.approve'))
  const today = todayIST()
  return rows.map<RequestRow>((r) => ({
    id: String(r._id),
    employeeId: String(r.employeeId),
    employee: names.get(String(r.employeeId)) ?? 'Unknown',
    date: r.workedOn,
    what: `${r.days} day${r.days === 1 ? '' : 's'}`,
    reason: r.reason ?? '',
    status: r.status,
    where: whereItSits(routedOf(r), r.managerId ? names.get(String(r.managerId)) : undefined),
    signedBy: (r.decisions ?? []).map((d) => d.decidedByName ?? '').filter(Boolean),
    decidable: isDecidableBy(actor, routedOf(r)),
    extra: r.expiresOn ? (r.expiresOn < today ? 'Lapsed' : `Lapses ${formatDate(r.expiresOn)}`) : 'Does not lapse',
  }))
}

/** Approved comp-off days not yet lapsed, across the visible people. */
export async function compOffInHand(ctx: Ctx): Promise<number> {
  const visible = await visibleEmployeeIds(ctx)
  const today = todayIST()
  const rows = await ctx.db(CompOff).find({ ...visibleFilter(visible, 'employeeId'), status: 'approved', $or: [{ expiresOn: null }, { expiresOn: { $gte: today } }] }, { days: 1 }).lean()
  return rows.reduce((s, r) => s + r.days, 0)
}
