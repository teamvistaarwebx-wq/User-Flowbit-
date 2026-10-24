'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { addDays, formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { isoDate, objectId, optionalText } from '@/lib/validation'
import { CompOff } from '@/models/muster/CompOff'
import { Employee } from '@/models/muster/Employee'
import { dayCellFor } from '../attendance/queries'
import { assertVisible, ownEmployeeId } from '../people/scope'
import { getPolicy, orgCalendar } from '../settings/queries'
import { applyDecision, decisionRefusal } from './approvals'
import { approvalActor, managerLapse, notifyApprovers, notifyEmployee, routedWith, routeFor } from './routing'

const QUEUE = '/app/hr/attendance/corrections?tab=compoff'
const WORKED = new Set(['present', 'late', 'on_duty'])

/** Raise a comp-off for working a weekly off or holiday (own, or for someone with people.write). */
export const raiseCompOff = action(
  z.object({ employeeId: objectId.optional(), workedOn: isoDate, reason: optionalText(300) }),
  async ({ employeeId: requested, workedOn, reason }, ctx) => {
    const own = ownEmployeeId(ctx)
    const employeeId = requested ?? own
    if (!employeeId) return fail('Your account is not linked to an employee record. Ask HR to link it.')
    if (employeeId !== own) {
      ctx.assert('people.write', 'Only HR can raise a comp-off for someone else.')
      await assertVisible(ctx, employeeId)
    }
    const employee = await ctx.db(Employee).findById(employeeId).lean()
    if (!employee) throw new NotFoundError('That employee')
    if (workedOn > todayIST()) return fail('That day has not happened yet.', { workedOn: 'In the future' })
    if (workedOn < employee.joinDate) return fail(`That is before ${employee.fullName} joined, ${formatDate(employee.joinDate)}.`, { workedOn: 'Before joining' })
    const calendar = await orgCalendar(ctx, workedOn, workedOn)
    const wasOff = !calendar.isWorkday(workedOn) || calendar.holidayNames.has(workedOn)
    if (!wasOff) return fail('That was a normal working day. Comp-off is for giving up a day that was already off.', { workedOn: 'A working day' })
    const cell = await dayCellFor(ctx, employeeId, workedOn)
    const days = cell && WORKED.has(cell.status) ? 1 : cell?.status === 'half_day' ? 0.5 : 0
    if (!days) return fail('A comp-off is earned by work that was recorded, so mark the day first (check-in or an HR override).', { workedOn: 'No work recorded' })
    if (await ctx.db(CompOff).exists({ employeeId: employee._id, workedOn })) return fail('A comp-off has already been raised for that day.', { workedOn: 'Already raised' })
    const policy = await getPolicy(ctx)
    const valid = policy.attendance.compOffValidDays
    const route = await routeFor(ctx, employee, 'attendance.approve')
    const doc = await ctx.db(CompOff).create({
      employeeId: employee._id, workedOn, days, reason, expiresOn: valid ? addDays(workedOn, valid) : null, status: 'pending',
      stages: route.stages, completedStages: [], managerId: route.managerId, raisedBy: ctx.userId, raisedByName: ctx.user.name,
    })
    await notifyApprovers(ctx, doc, 'attendance.approve', { title: `${employee.fullName} claimed a comp-off for ${formatDate(workedOn)}`, href: QUEUE, event: 'attendance.compoff_requested' })
    await audit(ctx, { action: 'attendance.compoff_requested', entity: 'Employee', entityId: employee._id, summary: `Comp-off (${days} day) claimed for ${employee.fullName}, worked ${formatDate(workedOn)}`, product: 'muster' })
    revalidatePath('/app/hr/attendance/corrections')
    return ok(`Comp-off of ${days} day for ${formatDate(workedOn)} sent for approval.${valid ? ` It lapses ${valid} days after the day worked.` : ''}`)
  },
  { product: 'muster', localise: true },
)

export const decideCompOff = action(
  z.object({ id: objectId, decision: z.enum(['approved', 'rejected']), note: optionalText(500) }),
  async ({ id, decision, note }, ctx) => {
    const request = await ctx.db(CompOff).findById(id).lean()
    if (!request) throw new NotFoundError('That comp-off')
    const routed = routedWith(await managerLapse(ctx, [request], 'attendance.approve'))(request)
    const refusal = decisionRefusal(approvalActor(ctx, 'attendance.approve'), routed)
    if (refusal) return fail(refusal)
    if (decision === 'rejected' && !note) return fail('Add a note so they know why.', { note: 'Required when rejecting' })
    const employee = await ctx.db(Employee).findById(request.employeeId, { fullName: 1 }).lean()
    const next = applyDecision(routed, decision)
    const signature = { stage: next.stage, decision, decidedBy: ctx.userId, decidedByName: ctx.user.name, decidedAt: new Date(), note }
    const res = await ctx.db(CompOff).updateOne(
      { _id: id, status: 'pending' },
      { $set: { status: next.status, completedStages: next.completedStages, ...(next.final ? { decidedAt: new Date(), decisionNote: note } : {}) }, $push: { decisions: signature } },
    )
    if (!res.modifiedCount) return fail('Someone decided this a moment ago. Refresh to see it.')
    const name = employee?.fullName ?? 'the employee'
    const when = formatDate(request.workedOn)
    if (next.final) {
      await notifyEmployee(ctx, request.employeeId, { title: decision === 'approved' ? `Comp-off approved for ${when}` : `Comp-off for ${when} was not approved`, body: note, href: '/app/me/leave', event: `attendance.compoff_${decision}`, kind: decision === 'approved' ? 'success' : 'warning' })
    } else {
      await notifyApprovers(ctx, { ...request, completedStages: next.completedStages }, 'attendance.approve', { title: `${name} claimed a comp-off for ${when}`, body: `Approved by ${ctx.user.name}; waiting on you`, href: QUEUE, event: 'attendance.compoff_requested' })
    }
    await audit(ctx, { action: `attendance.compoff_${decision}`, entity: 'Employee', entityId: request.employeeId, summary: `Comp-off for ${name} (${when}) ${decision}`, product: 'muster', meta: { note, stage: next.stage } })
    revalidatePath('/app/hr/attendance/corrections')
    if (!next.final) return ok(`Approved for ${name} and sent to HR for the final say.`)
    return ok(decision === 'approved' ? `Comp-off approved for ${name}: ${request.days} day added to their balance.` : `Comp-off rejected for ${name}. They have been told, with your note.`)
  },
  { product: 'muster', perm: 'attendance.approve' },
)
