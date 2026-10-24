import 'server-only'
import type { Types } from 'mongoose'
import { revalidatePath } from 'next/cache'
import { fail, ok, type ActionOptions, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { assertMonthsOpen } from '../attendance/lock'
import { applyDecision, decisionRefusal } from './approvals'
import { daysLabel, leaveSpanLabel } from './days'
import { approvalActor, managerLapse, notifyApprovers, notifyEmployee, routedWith } from './routing'

/**
 * Deciding a leave request: the app's Approve/Reject buttons and an approval
 * link (email or WhatsApp) both run this, behind the same `action()` checks
 * (LEAVE_DECIDE_OPTS), so every channel enforces the same permission, stage
 * and month lock.
 */

const LEAVE = '/app/hr/leave'

export const LEAVE_DECIDE_OPTS: ActionOptions = { product: 'muster', perm: 'leave.approve' }

export type LeaveDecision = Readonly<{ id: string; decision: 'approved' | 'rejected'; note?: string }>

/** Writes the leave onto linked members' core attendance days so the check-in widget and Home agree. */
export async function markLeaveDays(ctx: Ctx, employee: { _id: Types.ObjectId; memberId?: Types.ObjectId | null }, dates: string[], label: string) {
  if (!employee.memberId || !dates.length) return
  await Promise.all(
    dates.map((date) =>
      ctx.db(AttendanceDay).updateOne(
        { memberId: employee.memberId, date },
        { $set: { status: 'leave', note: label, employeeId: employee._id }, $setOnInsert: { punches: [], workedMinutes: 0, breakMinutes: 0 } },
        { upsert: true },
      ),
    ),
  )
}

export async function decideLeave(ctx: Ctx, { id, decision, note }: LeaveDecision): Promise<ActionResult> {
  const request = await ctx.db(LeaveRequest).findById(id).lean()
  if (!request) throw new NotFoundError('That leave request')
  const routed = routedWith(await managerLapse(ctx, [request], 'leave.approve'))(request)
  const refusal = decisionRefusal(approvalActor(ctx, 'leave.approve'), routed)
  if (refusal) return fail(refusal)
  if (decision === 'rejected' && !note) return fail('Add a note so they know why.', { note: 'Required when rejecting' })
  const employee = await ctx.db(Employee).findById(request.employeeId, { fullName: 1, memberId: 1 }).lean()
  if (!employee) throw new NotFoundError('That employee')
  const next = applyDecision(routed, decision)
  if (next.status === 'approved') {
    if (!(await ctx.db(LeaveType).exists({ _id: request.leaveTypeId }))) return fail('That leave type no longer exists, so this request cannot be approved. Reject it and ask for a new one.')
    await assertMonthsOpen(ctx, request.dates, 'this leave')
  }
  const signature = { stage: next.stage, decision, decidedBy: ctx.userId, decidedByName: ctx.user.name, decidedAt: new Date(), note }
  const res = await ctx.db(LeaveRequest).updateOne(
    { _id: id, status: 'pending' },
    { $set: { status: next.status, completedStages: next.completedStages, ...(next.final ? { decidedAt: new Date(), decisionNote: note } : {}) }, $push: { decisions: signature } },
  )
  if (!res.modifiedCount) return fail('Someone decided this a moment ago. Refresh to see it.')
  const span = leaveSpanLabel(request.startDate, request.endDate, Boolean(request.isHalfDay))
  const days = daysLabel(request.dayCount)
  if (next.status === 'approved') {
    await markLeaveDays(ctx, employee, request.dates, `${request.leaveName} (approved)`)
    await notifyEmployee(ctx, request.employeeId, { title: `Leave approved: ${request.leaveName}, ${days}`, body: span, href: '/app/me/leave', event: 'leave.approved', kind: 'success' })
  } else if (next.status === 'rejected') {
    await notifyEmployee(ctx, request.employeeId, { title: `Leave not approved: ${request.leaveName}, ${span}`, body: note, href: '/app/me/leave', event: 'leave.rejected', kind: 'warning' })
  } else {
    await notifyApprovers(ctx, { ...request, completedStages: next.completedStages }, 'leave.approve', { title: `${employee.fullName} asked for ${request.leaveName}`, body: `${span}, ${days}. Approved by ${ctx.user.name}; waiting on you.`, href: LEAVE, event: 'leave.requested', action: { kind: 'leave', id } })
  }
  await audit(ctx, { action: `leave.${decision}`, entity: 'LeaveRequest', entityId: id, summary: `Leave ${decision} for ${employee.fullName}: ${request.leaveName}, ${span}`, product: 'muster', meta: { stage: next.stage, note } })
  revalidatePath(LEAVE)
  revalidatePath('/app/hr/attendance')
  if (next.status === 'pending') return ok(`Leave approved for ${employee.fullName}, ${days}, and sent to HR, who will check the balance and policy.`)
  if (next.status === 'approved') return ok(`Leave approved for ${employee.fullName}, ${days}: ${span} marked on the attendance sheet.`)
  return ok(`Leave rejected for ${employee.fullName}: ${request.leaveName}, ${span}. They have been told, with your note.`)
}
