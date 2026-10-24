import 'server-only'
import type { Ctx } from '@/lib/ctx'
import type { Permission } from '@/lib/catalog'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { CompOff } from '@/models/muster/CompOff'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Timesheet } from '@/models/work/Timesheet'
import { isDecidableBy } from '@/modules/muster/leave/approvals'
import { approvalActor, managerLapse, routedWith } from '@/modules/muster/leave/routing'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'
import { approvalScope } from '@/modules/work/time/approvals'

/**
 * The Approvals inbox (/app/approvals): everything waiting on the signed-in
 * member, across Muster and Work, with a link to each queue. Each queue uses
 * the same gate and routing as the page that decides it, so the inbox never
 * lists a request the member cannot act on. All reads go through ctx.db, so
 * they stay inside the workspace.
 */

export const APPROVAL_KINDS = ['leave', 'correction', 'comp_off', 'claim', 'bank_change', 'timesheet'] as const
export type ApprovalKind = (typeof APPROVAL_KINDS)[number]

export type ApprovalItem = Readonly<{ id: string; who: string; what: string; when: string; href: string }>
export type ApprovalGroup = Readonly<{ kind: ApprovalKind; label: string; queueHref: string; queueLabel: string; total: number; items: readonly ApprovalItem[] }>

/** Rows read per queue; the inbox shows the oldest first and links to the queue for the rest. */
export const QUEUE_READ_LIMIT = 200
export const ITEMS_PER_GROUP = 10

type Muster = Readonly<{ employeeId: unknown; createdAt?: Date }>

const QUEUES: Readonly<Record<ApprovalKind, { label: string; queueHref: string; queueLabel: string }>> = {
  leave: { label: 'Leave requests', queueHref: '/app/hr/leave', queueLabel: 'Open Leave' },
  correction: { label: 'Attendance corrections', queueHref: '/app/hr/attendance/corrections', queueLabel: 'Open Corrections' },
  comp_off: { label: 'Comp-off claims', queueHref: '/app/hr/leave', queueLabel: 'Open Leave' },
  claim: { label: 'Expense claims', queueHref: '/app/hr/claims', queueLabel: 'Open Claims' },
  bank_change: { label: 'Bank details to verify', queueHref: '/app/hr/payroll', queueLabel: 'Open Payroll' },
  timesheet: { label: 'Timesheets', queueHref: '/app/work/time/approvals', queueLabel: 'Open Time approvals' },
}

/** Which queues this member may see at all (the deciding page's own gate). */
export function visibleQueues(ctx: Pick<Ctx, 'has' | 'can' | 'member'>): ApprovalKind[] {
  const muster = ctx.has('muster')
  const signs = (perm: Permission) => ctx.can(perm) || ctx.can('approvals.escalated')
  const kinds: ApprovalKind[] = []
  if (muster && signs('leave.approve')) kinds.push('leave')
  if (muster && signs('attendance.approve')) kinds.push('correction', 'comp_off')
  if (muster && ctx.can('claims.review')) kinds.push('claim')
  if (muster && ctx.can('people.read_sensitive')) kinds.push('bank_change')
  if (ctx.has('work') && ctx.can('time.approve')) kinds.push('timesheet')
  return kinds
}

/** Leave, corrections and comp-off: pending rows whose current stage is this member's to sign. */
async function staged<T extends Muster & { stages: string[]; completedStages: string[]; status: string; managerId?: unknown }>(ctx: Ctx, rows: T[], hrPerm: Permission): Promise<T[]> {
  const actor = approvalActor(ctx, hrPerm)
  const routed = routedWith(await managerLapse(ctx, rows as never, hrPerm))
  return rows.filter((r) => isDecidableBy(actor, routed(r as never)))
}

/** Requests at the HR stage are everyone's to see with people.read_all; otherwise only the member's direct reports. */
function stagedScope(ctx: Ctx): Record<string, unknown> | null {
  if (ctx.can('people.read_all') || ctx.can('approvals.escalated')) return {}
  const own = ownEmployeeId(ctx)
  return own ? { managerId: own } : null
}

const STAGED_FIELDS = { employeeId: 1, managerId: 1, stages: 1, completedStages: 1, status: 1, createdAt: 1 }

async function employeeNames(ctx: Ctx, ids: unknown[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await ctx.db(Employee).find({ _id: { $in: [...new Set(ids.map(String))] } }, { fullName: 1 }).lean()
  return new Map(rows.map((e) => [String(e._id), e.fullName as string]))
}

async function memberNames(ctx: Ctx, ids: unknown[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const members = await ctx.db(Member).find({ _id: { $in: [...new Set(ids.map(String))] } }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const userName = new Map(users.map((u) => [String(u._id), u.name as string]))
  return new Map(members.map((m) => [String(m._id), userName.get(String(m.userId)) ?? 'A member']))
}

const byOldest = { createdAt: 1 } as const
const dayRange = (start: string, end: string) => (start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`)

type Loaded = { total: number; items: ApprovalItem[] }

async function loadLeave(ctx: Ctx): Promise<Loaded> {
  const scope = stagedScope(ctx)
  if (!scope) return { total: 0, items: [] }
  const rows = await ctx.db(LeaveRequest).find({ status: 'pending', ...scope }, { ...STAGED_FIELDS, leaveName: 1, startDate: 1, endDate: 1, dayCount: 1 }).sort(byOldest).limit(QUEUE_READ_LIMIT).lean()
  const mine = await staged(ctx, rows as never[], 'leave.approve')
  const names = await employeeNames(ctx, mine.map((r) => (r as Muster).employeeId))
  const items = (mine as unknown as { _id: unknown; employeeId: unknown; leaveName: string; startDate: string; endDate: string; dayCount: number; createdAt: Date }[]).map((r) => ({
    id: String(r._id),
    who: names.get(String(r.employeeId)) ?? 'An employee',
    what: `${r.leaveName}, ${r.dayCount} day${r.dayCount === 1 ? '' : 's'} · ${dayRange(r.startDate, r.endDate)}`,
    when: formatDate(r.createdAt),
    href: QUEUES.leave.queueHref,
  }))
  return { total: items.length, items }
}

async function loadCorrections(ctx: Ctx): Promise<Loaded> {
  const scope = stagedScope(ctx)
  if (!scope) return { total: 0, items: [] }
  const rows = await ctx.db(AttendanceCorrection).find({ status: 'pending', kind: 'request', ...scope }, { ...STAGED_FIELDS, date: 1, requestedStatus: 1 }).sort(byOldest).limit(QUEUE_READ_LIMIT).lean()
  const mine = await staged(ctx, rows as never[], 'attendance.approve')
  const names = await employeeNames(ctx, mine.map((r) => (r as Muster).employeeId))
  const items = (mine as unknown as { _id: unknown; employeeId: unknown; date: string; requestedStatus: string; createdAt: Date }[]).map((r) => ({
    id: String(r._id),
    who: names.get(String(r.employeeId)) ?? 'An employee',
    what: `${formatDate(r.date)} · asks for ${r.requestedStatus.replace(/_/g, ' ')}`,
    when: formatDate(r.createdAt),
    href: QUEUES.correction.queueHref,
  }))
  return { total: items.length, items }
}

async function loadCompOffs(ctx: Ctx): Promise<Loaded> {
  const scope = stagedScope(ctx)
  if (!scope) return { total: 0, items: [] }
  const rows = await ctx.db(CompOff).find({ status: 'pending', ...scope }, { ...STAGED_FIELDS, workedOn: 1, days: 1 }).sort(byOldest).limit(QUEUE_READ_LIMIT).lean()
  const mine = await staged(ctx, rows as never[], 'attendance.approve')
  const names = await employeeNames(ctx, mine.map((r) => (r as Muster).employeeId))
  const items = (mine as unknown as { _id: unknown; employeeId: unknown; workedOn: string; days: number; createdAt: Date }[]).map((r) => ({
    id: String(r._id),
    who: names.get(String(r.employeeId)) ?? 'An employee',
    what: `${r.days === 1 ? '1 day' : 'Half a day'} for working on ${formatDate(r.workedOn)}`,
    when: formatDate(r.createdAt),
    href: QUEUES.comp_off.queueHref,
  }))
  return { total: items.length, items }
}

/** Claims the member may review: within the people they can see, never their own unless they may decide their own. */
async function loadClaims(ctx: Ctx): Promise<Loaded> {
  const own = ownEmployeeId(ctx)
  const filter: Record<string, unknown> = { status: { $in: ['submitted', 'under_review'] }, ...visibleFilter(await visibleEmployeeIds(ctx), 'employeeId') }
  if (own && !mayDecideOwn(ctx)) filter.$nor = [{ employeeId: own }]
  const [total, rows] = await Promise.all([
    ctx.db(Claim).countDocuments(filter),
    ctx.db(Claim).find(filter, { employeeId: 1, amountClaimed: 1, purpose: 1, expenseDate: 1, createdAt: 1 }).sort(byOldest).limit(ITEMS_PER_GROUP).lean(),
  ])
  const names = await employeeNames(ctx, rows.map((r) => r.employeeId))
  const items = rows.map((r) => ({
    id: String(r._id),
    who: names.get(String(r.employeeId)) ?? 'An employee',
    what: `${formatINR(r.amountClaimed as number, { decimals: 0 })} · ${r.purpose as string}`,
    when: formatDate(r.createdAt as Date),
    href: QUEUES.claim.queueHref,
  }))
  return { total, items }
}

async function loadBankChanges(ctx: Ctx): Promise<Loaded> {
  const filter = { verifiedAt: null, ...visibleFilter(await visibleEmployeeIds(ctx), 'employeeId') }
  const [total, rows] = await Promise.all([
    ctx.db(BankChangeRequest).countDocuments(filter),
    ctx.db(BankChangeRequest).find(filter, { employeeId: 1, employeeName: 1, newMasked: 1, createdAt: 1 }).sort(byOldest).limit(ITEMS_PER_GROUP).lean(),
  ])
  const items = rows.map((r) => ({
    id: String(r._id),
    who: r.employeeName as string,
    what: `New account ${(r.newMasked as string | undefined) ?? ''}`.trim(),
    when: formatDate(r.createdAt as Date),
    href: `/app/hr/people/${String(r.employeeId)}?tab=bank`,
  }))
  return { total, items }
}

async function loadTimesheets(ctx: Ctx): Promise<Loaded> {
  const filter = { status: 'submitted', memberId: { $ne: ctx.memberId }, ...approvalScope(ctx) }
  const [total, rows] = await Promise.all([
    ctx.db(Timesheet).countDocuments(filter),
    ctx.db(Timesheet).find(filter, { memberId: 1, weekStart: 1, totalMinutes: 1, submittedAt: 1 }).sort({ weekStart: 1 }).limit(ITEMS_PER_GROUP).lean(),
  ])
  const names = await memberNames(ctx, rows.map((r) => r.memberId))
  const items = rows.map((r) => ({
    id: String(r._id),
    who: names.get(String(r.memberId)) ?? 'A member',
    what: `Week of ${formatDate(r.weekStart as string)} · ${Math.round(((r.totalMinutes as number) ?? 0) / 6) / 10} h`,
    when: r.submittedAt ? formatDate(r.submittedAt as Date) : '',
    href: QUEUES.timesheet.queueHref,
  }))
  return { total, items }
}

const LOADERS: Readonly<Record<ApprovalKind, (ctx: Ctx) => Promise<Loaded>>> = {
  leave: loadLeave,
  correction: loadCorrections,
  comp_off: loadCompOffs,
  claim: loadClaims,
  bank_change: loadBankChanges,
  timesheet: loadTimesheets,
}

/** Every queue this member may decide, with what is waiting in each (empty queues included, total 0). */
export async function approvalsInbox(ctx: Ctx): Promise<ApprovalGroup[]> {
  const kinds = visibleQueues(ctx)
  const loaded = await Promise.all(kinds.map((k) => LOADERS[k](ctx)))
  return kinds.map((kind, i) => ({ kind, ...QUEUES[kind], total: loaded[i].total, items: loaded[i].items.slice(0, ITEMS_PER_GROUP) }))
}

/** Total waiting on the member (for the Home card and the bell). */
export const pendingTotal = (groups: readonly ApprovalGroup[]): number => groups.reduce((sum, g) => sum + g.total, 0)
