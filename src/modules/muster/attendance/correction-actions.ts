'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { isoDate, objectId, optionalText, requiredText } from '@/lib/validation'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { Employee } from '@/models/muster/Employee'
import { notifyApprovers, routeFor } from '../leave/routing'
import { ownEmployeeId } from '../people/scope'
import { getPolicy } from '../settings/queries'
import { CORRECTABLE_STATUSES, correctionProblem } from './correction'
import { CORRECTION_DECIDE_OPTS, decideCorrection } from './correction-decide'
import { assertMonthsOpen } from './lock'
import { dayCellFor } from './queries'
import { CELL_META } from './register'

const QUEUE = '/app/hr/attendance/corrections'

/** An employee asks for a day to be corrected (used by /app/me/attendance). Routed manager → HR. */
export const requestAttendanceCorrection = action(
  z.object({ date: isoDate, requestedStatus: z.enum(CORRECTABLE_STATUSES, { error: 'Choose what the day should say' }), reason: requiredText('What actually happened', 500) }),
  async ({ date, requestedStatus, reason }, ctx) => {
    const own = ownEmployeeId(ctx)
    if (!own) return fail('Your account is not linked to an employee record. Ask HR to link it.')
    const employee = await ctx.db(Employee).findById(own).lean()
    if (!employee) throw new NotFoundError('Your employee record')
    const [policy, cell] = await Promise.all([getPolicy(ctx), dayCellFor(ctx, own, date)])
    if (!cell || cell.status === 'na') return fail(`You were not employed on ${formatDate(date)}.`, { date: 'Outside your employment' })
    const problem = correctionProblem({ date, today: todayIST(), requested: requestedStatus, current: cell.status, windowHours: policy.attendance.correctionWindowHours })
    if (problem) return fail(problem, { date: problem })
    await assertMonthsOpen(ctx, [date], 'a correction')
    if (await ctx.db(AttendanceCorrection).exists({ employeeId: employee._id, date, status: 'pending' })) return fail('You already have a correction waiting for that day.', { date: 'Already requested' })
    const route = await routeFor(ctx, employee, 'attendance.approve')
    const doc = await ctx.db(AttendanceCorrection).create({
      employeeId: employee._id, memberId: employee.memberId, date, kind: 'request', currentStatus: cell.status, requestedStatus, reason, status: 'pending',
      stages: route.stages, completedStages: [], managerId: route.managerId, raisedBy: ctx.userId, raisedByName: ctx.user.name,
    })
    await notifyApprovers(ctx, doc, 'attendance.approve', { title: `${employee.fullName} asked to correct ${formatDate(date)}`, body: `${CELL_META[cell.status].label} → ${CELL_META[requestedStatus].label}`, href: QUEUE, event: 'attendance.correction_requested', action: { kind: 'correction', id: String(doc._id) } })
    await audit(ctx, { action: 'attendance.correction_requested', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName} asked to mark ${formatDate(date)} ${CELL_META[requestedStatus].label}`, product: 'muster', meta: { reason } })
    revalidatePath(QUEUE)
    return ok(`Correction requested for ${formatDate(date)}. You are told when it is decided.`)
  },
  { product: 'muster', localise: true },
)

export const decideAttendanceCorrection = action(
  z.object({ id: objectId, decision: z.enum(['approved', 'rejected']), note: optionalText(500) }),
  async (input, ctx) => decideCorrection(ctx, input),
  CORRECTION_DECIDE_OPTS,
)
