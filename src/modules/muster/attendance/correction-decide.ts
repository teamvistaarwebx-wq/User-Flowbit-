import 'server-only'
import { revalidatePath } from 'next/cache'
import { fail, ok, type ActionOptions, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { Employee } from '@/models/muster/Employee'
import { applyDecision, decisionRefusal } from '../leave/approvals'
import { approvalActor, managerLapse, notifyApprovers, notifyEmployee, routedWith } from '../leave/routing'
import { supersede, writeCoreDay } from './core-day'
import { assertMonthsOpen } from './lock'
import { CELL_META } from './register'

/** Deciding an attendance correction: the app and approval links (email, WhatsApp) run this behind the same checks. */

const QUEUE = '/app/hr/attendance/corrections'

export const CORRECTION_DECIDE_OPTS: ActionOptions = { product: 'muster', perm: 'attendance.approve' }

export async function decideCorrection(ctx: Ctx, { id, decision, note }: Readonly<{ id: string; decision: 'approved' | 'rejected'; note?: string }>): Promise<ActionResult> {
  const request = await ctx.db(AttendanceCorrection).findOne({ _id: id, kind: 'request' }).lean()
  if (!request) throw new NotFoundError('That correction')
  const routed = routedWith(await managerLapse(ctx, [request], 'attendance.approve'))(request)
  const refusal = decisionRefusal(approvalActor(ctx, 'attendance.approve'), routed)
  if (refusal) return fail(refusal)
  if (decision === 'rejected' && !note) return fail('Add a note so they know why.', { note: 'Required when rejecting' })
  const employee = await ctx.db(Employee).findById(request.employeeId, { fullName: 1, memberId: 1 }).lean()
  if (!employee) throw new NotFoundError('That employee')
  const next = applyDecision(routed, decision)
  if (next.status === 'approved') await assertMonthsOpen(ctx, [request.date], 'this correction')
  const signature = { stage: next.stage, decision, decidedBy: ctx.userId, decidedByName: ctx.user.name, decidedAt: new Date(), note }
  const res = await ctx.db(AttendanceCorrection).updateOne(
    { _id: id, status: 'pending' },
    { $set: { status: next.status, completedStages: next.completedStages, ...(next.final ? { decidedAt: new Date(), decisionNote: note } : {}) }, $push: { decisions: signature } },
  )
  if (!res.modifiedCount) return fail('Someone decided this a moment ago. Refresh to see it.')
  const label = CELL_META[request.requestedStatus as keyof typeof CELL_META]?.label ?? request.requestedStatus
  const when = formatDate(request.date)
  if (next.status === 'approved') {
    await supersede(ctx, request.employeeId, request.date, request._id)
    await writeCoreDay(ctx, employee, request.date, request.requestedStatus as 'present', `Corrected: ${request.reason}`)
    await notifyEmployee(ctx, request.employeeId, { title: `Correction approved: ${when} is now ${label}`, href: '/app/me/attendance', event: 'attendance.correction_approved', kind: 'success' })
  } else if (next.status === 'rejected') {
    await notifyEmployee(ctx, request.employeeId, { title: `Correction for ${when} was not approved`, body: note, href: '/app/me/attendance', event: 'attendance.correction_rejected', kind: 'warning' })
  } else {
    await notifyApprovers(ctx, { ...request, completedStages: next.completedStages }, 'attendance.approve', { title: `${employee.fullName} asked to correct ${when}`, body: `Approved by ${ctx.user.name}; waiting on you`, href: QUEUE, event: 'attendance.correction_requested', action: { kind: 'correction', id } })
  }
  await audit(ctx, { action: `attendance.correction_${decision}`, entity: 'Employee', entityId: request.employeeId, summary: `Correction for ${employee.fullName} on ${when} ${decision}`, product: 'muster', meta: { note, stage: next.stage } })
  revalidatePath(QUEUE)
  revalidatePath('/app/hr/attendance')
  if (next.status === 'pending') return ok(`Approved for ${employee.fullName} and sent to HR for the final say.`)
  return ok(decision === 'approved' ? `${employee.fullName}: ${when} is now ${label}.` : `Correction rejected for ${employee.fullName}. They have been told, with your note.`)
}
