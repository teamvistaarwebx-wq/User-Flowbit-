import 'server-only'
import { leaveOverlaps, type HalfDaySession } from './overlap'
import { revalidatePath } from 'next/cache'
import { fail, ok, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { MAX_UPLOAD_BYTES, saveUpload } from '@/lib/files'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { assertMonthsOpen } from '../attendance/lock'
import { isInDirectory } from '../people/lifecycle'
import { assertVisible, ownEmployeeId } from '../people/scope'
import { overlapFilter, planLeave } from './apply'
import { daysLabel, leaveSpanLabel } from './days'
import { notifyApprovers, routeFor } from './routing'

/**
 * Applying for leave: the app's form (/app/hr/leave, /app/me/leave) and the
 * employee WhatsApp bot both run this, so the overlap, balance, policy and
 * month-lock rules are the same everywhere.
 */

const LEAVE = '/app/hr/leave'
const PROOF_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

/** Checked before anything is saved, so a bad file never leaves a request behind. */
function proofProblem(file: File | undefined): string | null {
  if (!file) return null
  if (file.size > MAX_UPLOAD_BYTES) return `"${file.name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Choose a smaller file.`
  if (!PROOF_MIME.includes(file.type)) return `"${file.name}" cannot be attached. Use a PDF, PNG, JPEG, WebP or HEIC file.`
  return null
}

export type LeaveApplication = Readonly<{ employeeId?: string; leaveTypeId: string; startDate: string; endDate: string; isHalfDay: boolean; halfDaySession?: HalfDaySession; reason: string; attachment?: File }>

export async function requestLeave(ctx: Ctx, input: LeaveApplication): Promise<ActionResult> {
  const own = ownEmployeeId(ctx)
  const employeeId = input.employeeId ?? own
  if (!employeeId) return fail('Your account is not linked to an employee record. Ask HR to link it.')
  const onBehalf = employeeId !== own
  if (onBehalf) {
    ctx.assert('leave.manage', 'Only HR can apply for leave on someone else’s behalf.')
    await assertVisible(ctx, employeeId)
  }
  const [employee, type] = await Promise.all([ctx.db(Employee).findById(employeeId).lean(), ctx.db(LeaveType).findOne({ _id: input.leaveTypeId, isActive: true }).lean()])
  if (!employee || !isInDirectory(employee.status)) return fail('Leave can only be applied for people in the directory.')
  if (!type) return fail('Choose a leave type from the list.', { leaveTypeId: 'Choose a leave type' })
  const session = input.isHalfDay ? input.halfDaySession : undefined
  const near = await ctx.db(LeaveRequest).find(overlapFilter(employee._id, input.startDate, input.endDate), { startDate: 1, endDate: 1, isHalfDay: 1, halfDaySession: 1 }).lean()
  if (near.some((r) => leaveOverlaps(r, { ...input, halfDaySession: session }))) {
    return fail('Those dates overlap another leave request that is pending or approved.', { startDate: 'Overlaps another request' })
  }
  const attachment = input.attachment && input.attachment.size > 0 ? input.attachment : undefined
  const fileProblem = proofProblem(attachment)
  if (fileProblem) return fail(fileProblem, { attachment: fileProblem })
  const plan = await planLeave(ctx, employee, type, { ...input, hasProof: Boolean(attachment) })
  await assertMonthsOpen(ctx, plan.dates, 'leave on those days')
  const route = await routeFor(ctx, employee, 'leave.approve')
  const request = await ctx.db(LeaveRequest).create({
    employeeId: employee._id, leaveTypeId: type._id, leaveCode: type.code, leaveName: type.name, startDate: input.startDate, endDate: input.endDate,
    isHalfDay: input.isHalfDay, ...(session ? { halfDaySession: session } : {}), dayCount: plan.dayCount, paidDays: plan.paidDays, unpaidDays: plan.unpaidDays, dates: plan.dates, unpaidDates: plan.unpaidDates,
    reason: input.reason, status: 'pending', stages: route.stages, completedStages: [], managerId: route.managerId, raisedBy: ctx.userId, raisedByName: ctx.user.name,
  })
  const file = await saveUpload(ctx, attachment, { kind: 'leave_proof', entity: 'LeaveRequest', entityId: request._id, accept: PROOF_MIME }).catch(async (error: unknown) => {
    // Nothing is filed when the proof cannot be stored, so the employee can simply try again.
    await ctx.db(LeaveRequest).deleteOne({ _id: request._id })
    throw error
  })
  if (file) await ctx.db(LeaveRequest).updateOne({ _id: request._id }, { $set: { attachmentFileId: file._id } })
  const span = leaveSpanLabel(input.startDate, input.endDate, input.isHalfDay)
  await notifyApprovers(ctx, request, 'leave.approve', { title: `${employee.fullName} asked for ${type.name}`, body: `${span}, ${daysLabel(plan.dayCount)}`, href: LEAVE, event: 'leave.requested', action: { kind: 'leave', id: String(request._id) } })
  await audit(ctx, { action: 'leave.requested', entity: 'LeaveRequest', entityId: request._id, summary: `${type.name} requested for ${employee.fullName}: ${span}, ${daysLabel(plan.dayCount)}`, product: 'muster', meta: { onBehalf, paidDays: plan.paidDays, unpaidDays: plan.unpaidDays } })
  revalidatePath(LEAVE)
  revalidatePath('/app/me/leave')
  const who = onBehalf ? ` for ${employee.fullName}` : ''
  return ok(`${type.name} requested${who}: ${span}, ${daysLabel(plan.dayCount)}, waiting for approval.${plan.balanceNote ? ` ${plan.balanceNote}` : ''}`)
}
