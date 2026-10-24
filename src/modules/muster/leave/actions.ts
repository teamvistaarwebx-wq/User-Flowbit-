'use server'

import { revalidatePath } from 'next/cache'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { computeDay, DEFAULT_OFFICE_HOURS, type OfficeHours } from '@/lib/attendance-core'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { checkbox, isoDate, objectId, optionalText } from '@/lib/validation'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Employee } from '@/models/muster/Employee'
import { LeaveBalance } from '@/models/muster/LeaveBalance'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { assertMonthsOpen } from '../attendance/lock'
import { assertVisible, mayDecideOwn, ownEmployeeId } from '../people/scope'
import { getPolicy } from '../settings/queries'
import { leaveYearFor } from './accrual'
import { availableDays } from './balances'
import { OWN_RECORD_REFUSAL } from './approvals'
import { decideLeave, LEAVE_DECIDE_OPTS } from './decide'
import { daysLabel } from './days'
import { requestLeave } from './request'
import { planLeave } from './apply'
import { leavePreviewText } from './overlap'
import { approvalActor, notifyApprovers, notifyEmployee } from './routing'
import { cancelAudience, cancelAuditSummary } from './cancel-copy'

const LEAVE = '/app/hr/leave'

const applySchema = z.object({
  employeeId: objectId.optional(),
  leaveTypeId: objectId,
  startDate: isoDate,
  endDate: isoDate,
  isHalfDay: checkbox,
  halfDaySession: z.enum(['first', 'second']).optional(),
  reason: z.string({ error: 'Tell your manager why' }).trim().min(3, 'Tell your manager why').max(500),
  attachment: z.instanceof(File).optional(),
})

/** Applies for leave: your own, or on someone's behalf with leave.manage. Used by /app/hr/leave and /app/me/leave. */
export const applyForLeave = action(applySchema, async (input, ctx) => requestLeave(ctx, input), { product: 'muster', localise: true })

/** What a request would cost before it is sent: days, and paid vs loss of pay (the form's preview). */
export const previewLeave = action(
  z.object({ employeeId: objectId.optional(), leaveTypeId: objectId, startDate: isoDate, endDate: isoDate, isHalfDay: z.boolean().default(false) }),
  async (input, ctx) => {
    const employeeId = input.employeeId ?? ownEmployeeId(ctx)
    if (!employeeId) return fail('Your account is not linked to an employee record.')
    if (employeeId !== ownEmployeeId(ctx)) {
      ctx.assert('leave.manage')
      await assertVisible(ctx, employeeId)
    }
    const [employee, type] = await Promise.all([ctx.db(Employee).findById(employeeId).lean(), ctx.db(LeaveType).findOne({ _id: input.leaveTypeId, isActive: true }).lean()])
    if (!employee || !type) return fail('Choose a leave type.')
    const plan = await planLeave(ctx, employee, type, { ...input, hasProof: true })
    return ok(leavePreviewText(plan), { paidDays: plan.paidDays, unpaidDays: plan.unpaidDays })
  },
  { product: 'muster' },
)

export const decideLeaveRequest = action(
  z.object({ id: objectId, decision: z.enum(['approved', 'rejected']), note: optionalText(500) }),
  async (input, ctx) => decideLeave(ctx, input),
  LEAVE_DECIDE_OPTS,
)

export const cancelLeaveRequest = action(
  z.object({ id: objectId, reason: z.string().trim().max(300).optional() }),
  async ({ id, reason }, ctx) => {
    const request = await ctx.db(LeaveRequest).findById(id).lean()
    if (!request) throw new NotFoundError('That leave request')
    const actor = approvalActor(ctx, 'leave.approve')
    const ownRequest = actor.employeeId === String(request.employeeId)
    if (request.status === 'pending' && !ownRequest && !actor.canSignHr) return fail('Only the applicant or HR can withdraw a pending request.')
    if (request.status === 'approved') {
      ctx.assert('leave.manage', 'Only HR can cancel approved leave.')
      if (!reason) return fail('Say why the approved leave is being cancelled.', { reason: 'Required' })
      await assertMonthsOpen(ctx, request.dates, 'cancelling this leave')
    }
    if (request.status !== 'pending' && request.status !== 'approved') return fail('That request is already closed.')
    if (!ownRequest) await assertVisible(ctx, String(request.employeeId))
    const res = await ctx.db(LeaveRequest).updateOne({ _id: id, status: request.status }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason } })
    if (!res.modifiedCount) return fail('That request changed a moment ago. Refresh to see it.')
    if (request.status === 'approved') await unmarkLeaveDays(ctx, request.employeeId, request.dates)
    const how = { own: ownRequest, wasApproved: request.status === 'approved' }
    const span = request.startDate === request.endDate ? formatDate(request.startDate) : `${formatDate(request.startDate)} to ${formatDate(request.endDate)}`
    const audience = cancelAudience(how)
    if (audience === 'approvers') await notifyApprovers(ctx, request, 'leave.approve', { title: `${ctx.user.name} withdrew their ${request.leaveName} request`, body: `${span}. Nothing to decide any more.`, href: LEAVE, event: 'leave.withdrawn' })
    if (audience === 'employee') await notifyEmployee(ctx, request.employeeId, { title: `Your ${request.leaveName} was cancelled by ${ctx.user.name}`, body: reason ? `${span}. ${reason}` : span, href: '/app/me/leave', event: 'leave.cancelled', kind: 'warning' })
    await audit(ctx, { action: 'leave.cancelled', entity: 'LeaveRequest', entityId: id, summary: cancelAuditSummary(how, request.leaveName, formatDate(request.startDate), ctx.user.name), product: 'muster', meta: { reason, wasApproved: how.wasApproved, byApplicant: ownRequest } })
    revalidatePath(LEAVE)
    revalidatePath('/app/me/leave')
    return ok(`Leave request withdrawn: ${request.leaveName}, ${formatDate(request.startDate)}.`)
  },
  { product: 'muster', localise: true },
)

/** Puts days back to what the punches say after approved leave is cancelled. */
async function unmarkLeaveDays(ctx: Ctx, employeeId: Types.ObjectId, dates: string[]) {
  const employee = await ctx.db(Employee).findById(employeeId, { memberId: 1 }).lean()
  if (!employee?.memberId) return
  const hours = { ...DEFAULT_OFFICE_HOURS, ...(ctx.org.officeHours ?? {}) } as OfficeHours
  const days = await ctx.db(AttendanceDay).find({ memberId: employee.memberId, date: { $in: dates }, status: 'leave' }).lean()
  await Promise.all(
    days.map((d) => {
      const result = computeDay({ punches: d.punches ?? [] }, hours)
      return ctx.db(AttendanceDay).updateOne({ _id: d._id }, { $set: { status: result.status, note: 'Leave cancelled' } })
    }),
  )
}

export const adjustLeaveBalance = action(
  z.object({ employeeId: objectId, leaveTypeId: objectId, days: z.coerce.number({ error: 'Enter days' }).min(-365, 'Remove at most 365 days at a time').max(365, 'Add at most 365 days at a time').refine((n) => n !== 0, 'Enter a number other than zero'), kind: z.enum(['opening', 'adjustment']).default('adjustment'), reason: z.string().trim().min(3, 'Say why').max(300) }),
  async (input, ctx) => {
    await assertVisible(ctx, input.employeeId)
    if (input.employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const [employee, type, policy] = await Promise.all([ctx.db(Employee).findById(input.employeeId, { fullName: 1, employmentType: 1, status: 1, joinDate: 1, exitDate: 1 }).lean(), ctx.db(LeaveType).findById(input.leaveTypeId).lean(), getPolicy(ctx)])
    if (!employee) throw new NotFoundError('That employee')
    if (!type) throw new NotFoundError('That leave type')
    if (input.days < 0 && !policy.leave.allowNegativeBalance) {
      const row = await availableDays(ctx, employee, String(type._id), todayIST())
      const left = row?.remaining
      if (left != null && left + input.days < 0) {
        const message = left > 0 ? `Only ${daysLabel(left)} ${left === 1 ? 'is' : 'are'} left to remove.` : `${employee.fullName} has no ${type.name} left to remove.`
        return fail(`${message} Negative balances are off in the leave policy.`, { days: message })
      }
    }
    const year = leaveYearFor(todayIST(), policy.leave.leaveYearStartMonth)
    await ctx.db(LeaveBalance).create({ employeeId: employee._id, leaveTypeId: type._id, leaveYear: year.label, kind: input.kind, days: input.days, reason: input.reason, createdBy: ctx.userId, createdByName: ctx.user.name })
    await audit(ctx, { action: 'leave.balance_adjusted', entity: 'Employee', entityId: employee._id, summary: `${type.name} balance ${input.days > 0 ? '+' : ''}${input.days} for ${employee.fullName}`, product: 'muster', meta: { reason: input.reason, leaveYear: year.label } })
    revalidatePath('/app/hr/leave/balances')
    return ok(`${type.name} for ${employee.fullName}: ${input.days > 0 ? 'added' : 'removed'} ${daysLabel(Math.abs(input.days))} for ${year.label}.`)
  },
  { product: 'muster', perm: 'leave.manage' },
)
