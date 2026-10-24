import 'server-only'
import type { ActionOptions, ActionResult } from '@/lib/actions'
import { addDays, formatDate, formatDuration, todayIST } from '@/lib/dates'
import type { Ctx } from '@/lib/ctx'
import { formatINR } from '@/lib/money'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Task } from '@/models/work/Task'
import { Timesheet } from '@/models/work/Timesheet'
import { CORRECTION_DECIDE_OPTS, decideCorrection } from '@/modules/muster/attendance/correction-decide'
import { CELL_META } from '@/modules/muster/attendance/register'
import { CLAIM_DECIDE_OPTS, decideClaim } from '@/modules/muster/claims/decide'
import { decideLeave, LEAVE_DECIDE_OPTS } from '@/modules/muster/leave/decide'
import { leaveSpanLabel, daysLabel } from '@/modules/muster/leave/days'
import { BANK_VERIFY_OPTS, verifyBankChangeCore } from '@/modules/muster/payroll/bank-verify'
import { requireTask } from '@/modules/work/tasks/load'
import { applyTaskPatch } from '@/modules/work/tasks/mutate'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { getViewer } from '@/modules/work/tasks/viewer'
import { decideTimesheet, refreshTime, TIMESHEET_DECIDE_OPTS } from '@/modules/work/time/decide'
import { weekLabel } from '@/modules/work/time/week'
import { ok } from '@/lib/actions'
import type { ActionChoice, ActionKind } from './kinds'

/**
 * What each kind of action link runs: the very function the app's own
 * buttons call, behind the same `action()` options (permission, product,
 * read-only), and a plain summary for the confirmation page. Everything goes
 * through the approver's own scoped context.
 */

export type ActionSummary = Readonly<{ title: string; lines: readonly string[]; open: boolean; state: string }>

type Handler = Readonly<{
  opts: ActionOptions
  run: (ctx: Ctx, id: string, choice: ActionChoice, note: string | null) => Promise<ActionResult>
  summary: (ctx: Ctx, id: string) => Promise<ActionSummary | null>
}>

const decision = (choice: ActionChoice): 'approved' | 'rejected' => (choice === 'reject' ? 'rejected' : 'approved')

async function employeeName(ctx: Ctx, id: unknown): Promise<string> {
  return (await ctx.db(Employee).findById(id, { fullName: 1 }).lean())?.fullName ?? 'Someone'
}

const state = (status: string) => status.replace(/_/g, ' ')

const leave: Handler = {
  opts: LEAVE_DECIDE_OPTS,
  run: (ctx, id, choice, note) => decideLeave(ctx, { id, decision: decision(choice), note: note ?? undefined }),
  async summary(ctx, id) {
    const r = await ctx.db(LeaveRequest).findById(id).lean()
    if (!r) return null
    const who = await employeeName(ctx, r.employeeId)
    return { title: `${who} asked for ${r.leaveName}`, lines: [`${leaveSpanLabel(r.startDate, r.endDate, Boolean(r.isHalfDay))}, ${daysLabel(r.dayCount)}`, `Reason: ${r.reason}`], open: r.status === 'pending', state: state(r.status) }
  },
}

const timesheet: Handler = {
  opts: TIMESHEET_DECIDE_OPTS,
  async run(ctx, id, choice, note) {
    const result = await decideTimesheet(ctx, id, decision(choice), note ?? undefined)
    refreshTime()
    return result
  },
  async summary(ctx, id) {
    const sheet = await ctx.db(Timesheet).findById(id).lean()
    if (!sheet) return null
    const member = await ctx.db(Member).findById(sheet.memberId, { userId: 1 }).lean()
    const user = member ? await User.findById(member.userId, { name: 1 }).lean() : null
    return { title: `${user?.name ?? 'Someone'} submitted ${weekLabel(sheet.weekStart)}`, lines: [`${formatDuration(sheet.totalMinutes ?? 0)} logged`], open: sheet.status === 'submitted', state: state(sheet.status) }
  },
}

const claim: Handler = {
  opts: CLAIM_DECIDE_OPTS,
  run: (ctx, id, choice, note) => decideClaim(ctx, id, choice === 'reject' ? 'rejected' : 'approved', null, note ?? undefined),
  async summary(ctx, id) {
    const c = await ctx.db(Claim).findById(id).lean()
    if (!c) return null
    const who = await employeeName(ctx, c.employeeId)
    return { title: `${who} claimed ${formatINR(c.amountClaimed)}`, lines: [c.purpose, ...(c.description ? [c.description] : [])], open: c.status === 'submitted' || c.status === 'under_review', state: state(c.status) }
  },
}

const correction: Handler = {
  opts: CORRECTION_DECIDE_OPTS,
  run: (ctx, id, choice, note) => decideCorrection(ctx, { id, decision: decision(choice), note: note ?? undefined }),
  async summary(ctx, id) {
    const r = await ctx.db(AttendanceCorrection).findOne({ _id: id, kind: 'request' }).lean()
    if (!r) return null
    const who = await employeeName(ctx, r.employeeId)
    const label = (s: string | null | undefined) => (s ? (CELL_META[s as keyof typeof CELL_META]?.label ?? s) : '—')
    return { title: `${who} asked to correct ${formatDate(r.date)}`, lines: [`${label(r.currentStatus)} → ${label(r.requestedStatus)}`, `Reason: ${r.reason}`], open: r.status === 'pending', state: state(r.status) }
  },
}

const bankChange: Handler = {
  opts: BANK_VERIFY_OPTS,
  run: (ctx, id) => verifyBankChangeCore(ctx, id),
  async summary(ctx, id) {
    const b = await ctx.db(BankChangeRequest).findById(id).lean()
    if (!b) return null
    return { title: `${b.employeeName} changed their bank account`, lines: [`New account ${b.newMasked ?? ''}${b.newIfsc ? `, IFSC ${b.newIfsc}` : ''}`, `Was ${b.previousMasked ?? 'not set'}`], open: !b.verifiedAt, state: b.verifiedAt ? 'verified' : 'waiting' }
  },
}

const task: Handler = {
  opts: { product: 'work', perm: 'tasks.write' },
  async run(ctx, id, choice) {
    const viewer = await getViewer(ctx)
    const doc = await requireTask(ctx, viewer, id, 'edit')
    if (doc.status === 'done') return ok(`'${doc.title}' is already done.`)
    if (choice === 'done') {
      await applyTaskPatch(ctx, viewer, doc, { status: 'done' })
      revalidateWork()
      return ok(`'${doc.title}' marked done.`)
    }
    // Snooze: the due date moves one day past today (or past the current due date, if that is later).
    const today = todayIST()
    const from = doc.dueDate && doc.dueDate > today ? doc.dueDate : today
    const due = addDays(from, 1)
    await applyTaskPatch(ctx, viewer, doc, { dueDate: due })
    revalidateWork()
    return ok(`'${doc.title}' is now due ${formatDate(due)}.`)
  },
  async summary(ctx, id) {
    const t = await ctx.db(Task).findById(id, { title: 1, dueDate: 1, status: 1 }).lean()
    if (!t) return null
    return { title: t.title, lines: [t.dueDate ? `Due ${formatDate(t.dueDate)}` : 'No due date'], open: t.status !== 'done', state: state(t.status) }
  },
}

export const HANDLERS: Readonly<Record<ActionKind, Handler>> = { leave, timesheet, claim, correction, bank_change: bankChange, task }
