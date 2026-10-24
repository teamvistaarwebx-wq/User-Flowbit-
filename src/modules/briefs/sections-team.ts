import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays } from '@/lib/dates'
import { pluralize } from '@/lib/utils'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { CompOff } from '@/models/muster/CompOff'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Task } from '@/models/work/Task'
import { Timesheet } from '@/models/work/Timesheet'
import { hrDashboard } from '@/modules/muster/dashboard/queries'
import { daysOverdue } from '@/modules/work/tasks/due'
import { LINES_PER_SECTION } from './sections-work'
import type { BriefLine, BuiltSection } from './schedule'

/** Approvals and Team sections: what waits on the person, and who is out or late. Each count is gated by its own permission. */

type Queue = Readonly<{ label: string; href: string; count: () => Promise<number> }>

function queues(ctx: Ctx): Queue[] {
  const muster = ctx.has('muster')
  const out: Queue[] = []
  if (muster && (ctx.can('leave.approve') || ctx.member.employeeId)) {
    const scope = ctx.can('leave.approve') ? {} : { managerId: ctx.member.employeeId }
    out.push({ label: 'leave request', href: '/app/hr/leave', count: () => ctx.db(LeaveRequest).countDocuments({ status: 'pending', ...scope }) })
  }
  if (muster && ctx.can('attendance.approve')) {
    out.push({ label: 'attendance correction', href: '/app/hr/attendance/corrections', count: () => ctx.db(AttendanceCorrection).countDocuments({ status: 'pending', kind: 'request' }) })
    out.push({ label: 'comp-off claim', href: '/app/hr/leave', count: () => ctx.db(CompOff).countDocuments({ status: 'pending' }) })
  }
  if (muster && ctx.can('claims.review')) out.push({ label: 'expense claim', href: '/app/hr/claims', count: () => ctx.db(Claim).countDocuments({ status: { $in: ['submitted', 'under_review'] } }) })
  if (muster && ctx.can('people.read_sensitive')) out.push({ label: 'bank change to verify', href: '/app/hr/payroll', count: () => ctx.db(BankChangeRequest).countDocuments({ verifiedAt: null }) })
  if (ctx.has('work') && ctx.can('time.approve')) out.push({ label: 'timesheet', href: '/app/work/time/approvals', count: () => ctx.db(Timesheet).countDocuments({ status: 'submitted', memberId: { $ne: ctx.memberId } }) })
  return out
}

export async function approvals(ctx: Ctx): Promise<BuiltSection> {
  const list = queues(ctx)
  const counts = await Promise.all(list.map((q) => q.count()))
  const lines: BriefLine[] = list.flatMap((q, i) => (counts[i] ? [{ text: pluralize(counts[i], q.label), href: q.href, meta: 'Review' }] : []))
  const total = counts.reduce((s, n) => s + n, 0)
  return { key: 'approvals.pending', title: 'Waiting on me', lines, summary: total ? pluralize(total, 'approval') : undefined }
}

const BUCKET_LABEL: Readonly<Record<string, string>> = { leave: 'On leave', absent: 'Absent', late: 'Late' }

export async function teamToday(ctx: Ctx): Promise<BuiltSection> {
  const hr = await hrDashboard(ctx)
  const out = hr.roll.filter((p) => p.bucket in BUCKET_LABEL)
  const lines = out.slice(0, LINES_PER_SECTION * 2).map((p) => ({ text: p.name, href: `/app/hr/people/${p.id}`, meta: BUCKET_LABEL[p.bucket] }))
  return { key: 'team.today', title: 'Out or late today', lines, summary: out.length ? `${out.length} out or late` : undefined, href: '/app/hr' }
}

export async function teamOverdue(ctx: Ctx, today: string): Promise<BuiltSection> {
  const filter = { status: { $ne: 'done' }, dueDate: { $lt: today, $gte: addDays(today, -90) }, 'assigneeIds.0': { $exists: true } }
  const [rows, total] = await Promise.all([
    ctx.db(Task).find(filter, { title: 1, dueDate: 1 }).sort({ dueDate: 1 }).limit(LINES_PER_SECTION).lean(),
    ctx.db(Task).countDocuments(filter),
  ])
  const lines = rows.map((t) => ({ text: t.title, href: `/app/work/tasks/${String(t._id)}`, meta: `${pluralize(daysOverdue(t.dueDate, today), 'day')} late` }))
  return { key: 'team.overdue', title: "Team's overdue tasks", lines, summary: total ? `${total} team tasks overdue` : undefined, href: '/app/work/tasks' }
}
