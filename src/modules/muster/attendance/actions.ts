'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate, formatMonth, monthRange, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { isoDate, isoMonth, objectId, requiredText } from '@/lib/validation'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { Employee } from '@/models/muster/Employee'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { payrollFrozen } from '../people/foreign'
import { reopenTarget, STALE_ON_REOPEN } from '../payroll/stages'
import { OWN_RECORD_REFUSAL } from '../leave/approvals'
import { assertVisible, mayDecideOwn, ownEmployeeId, PARTIAL_VIEW_REFUSAL, visibleEmployeeIds } from '../people/scope'
import { resetCoreDay, supersede, writeCoreDay } from './core-day'
import { assertMonthsOpen, pendingInMonth } from './lock'
import { pendingLockRefusal } from './pending-copy'
import { getMonthRegister } from './queries'
import { CELL_META, employedOn, OVERRIDE_STATUSES } from './register'

const REGISTER = '/app/hr/attendance'

export const overrideAttendanceDay = action(
  z.object({ employeeId: objectId, date: isoDate, status: z.enum(OVERRIDE_STATUSES, { error: 'Choose a status' }), reason: requiredText('Reason', 280) }),
  async ({ employeeId, date, status, reason }, ctx) => {
    await assertVisible(ctx, employeeId)
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const employee = await ctx.db(Employee).findById(employeeId, { fullName: 1, memberId: 1, joinDate: 1, exitDate: 1 }).lean()
    if (!employee) throw new NotFoundError('That employee')
    if (!employedOn(date, employee.joinDate, employee.exitDate)) return fail(`${employee.fullName} was not employed on ${formatDate(date)}.`)
    if (date > todayIST()) return fail('That day has not happened yet. Mark it once it has.')
    await assertMonthsOpen(ctx, [date], 'an attendance change')
    await supersede(ctx, employee._id, date)
    await ctx.db(AttendanceCorrection).create({
      employeeId: employee._id, memberId: employee.memberId, date, kind: 'override', source: 'register', requestedStatus: status, reason, status: 'approved',
      stages: ['hr'], completedStages: ['hr'], decisions: [{ stage: 'hr', decision: 'approved', decidedBy: ctx.userId, decidedByName: ctx.user.name, note: reason }],
      raisedBy: ctx.userId, raisedByName: ctx.user.name, decidedAt: new Date(),
    })
    await writeCoreDay(ctx, employee, date, status, `Set by ${ctx.user.name}: ${reason}`)
    const label = CELL_META[status].label
    await audit(ctx, { action: 'attendance.overridden', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName} marked ${label} for ${formatDate(date)}`, product: 'muster', meta: { date, status, reason } })
    revalidatePath(REGISTER)
    return ok(`${employee.fullName} marked ${label} for ${formatDate(date)}.`)
  },
  { product: 'muster', perm: 'attendance.manage' },
)

export const clearAttendanceOverride = action(
  z.object({ employeeId: objectId, date: isoDate }),
  async ({ employeeId, date }, ctx) => {
    await assertVisible(ctx, employeeId)
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const employee = await ctx.db(Employee).findById(employeeId, { fullName: 1, memberId: 1 }).lean()
    if (!employee) throw new NotFoundError('That employee')
    await assertMonthsOpen(ctx, [date], 'an attendance change')
    const res = await ctx.db(AttendanceCorrection).updateMany({ employeeId: employee._id, date, status: 'approved' }, { $set: { status: 'superseded' } })
    if (!res.modifiedCount) return fail('That day has no override to remove.')
    await resetCoreDay(ctx, employee, date)
    await audit(ctx, { action: 'attendance.override_cleared', entity: 'Employee', entityId: employee._id, summary: `Override removed for ${employee.fullName} on ${formatDate(date)}`, product: 'muster', meta: { date } })
    revalidatePath(REGISTER)
    return ok(`${formatDate(date)} for ${employee.fullName} is back to what was recorded.`)
  },
  { product: 'muster', perm: 'attendance.manage' },
)

export const lockAttendanceMonth = action(
  z.object({ month: isoMonth, lockAnyway: z.boolean().optional().default(false) }),
  async ({ month, lockAnyway }, ctx) => {
    if ((await visibleEmployeeIds(ctx)) !== null) return fail(PARTIAL_VIEW_REFUSAL)
    const { start, end } = monthRange(month)
    if (end >= todayIST()) return fail(`${formatMonth(month)} has not ended yet. Lock it once the last day is over.`)
    const register = await getMonthRegister(ctx, month)
    const unmarked = register.rows.filter((r) => r.summary.unmarkedDays > 0)
    if (unmarked.length) {
      const total = unmarked.reduce((s, r) => s + r.summary.unmarkedDays, 0)
      const names = unmarked.slice(0, 4).map((r) => `${r.name} (${r.summary.unmarkedDays})`).join(', ')
      return fail(`${total} days across ${unmarked.length} people are still unmarked. Mark them before locking — ${names}${unmarked.length > 4 ? ', …' : ''}.`)
    }
    const pendingRefusal = pendingLockRefusal(await pendingInMonth(ctx, start, end), formatMonth(month), lockAnyway)
    if (pendingRefusal) return fail(pendingRefusal)
    const [y, m] = month.split('-').map(Number)
    await ctx.db(AttendancePeriod).updateOne(
      { year: y, month: m },
      { $set: { period: month, status: 'locked', workingDays: register.rows[0]?.summary.workingDays ?? register.workdays.length, headcount: register.rows.length, lockedBy: ctx.userId, lockedByName: ctx.user.name, lockedAt: new Date() } },
      { upsert: true },
    )
    await ctx.db(AttendanceDay).updateMany({ date: { $gte: start, $lte: end } }, { $set: { locked: true } })
    // Keep the payroll month's gate in step, so the payroll list does not wait for someone to open the month.
    await ctx.db(PayrollCycle).updateOne({ year: y, month: m, status: 'attendance_open' }, { $set: { status: 'attendance_locked' } })
    revalidatePath('/app/hr/payroll')
    await audit(ctx, { action: 'attendance.locked', entity: 'AttendancePeriod', entityId: month, summary: `${formatMonth(month)} attendance locked for ${register.rows.length} people`, product: 'muster' })
    revalidatePath(REGISTER)
    return ok(`${formatMonth(month)} attendance locked for ${register.rows.length} people. Payroll can now be generated for it.`)
  },
  { product: 'muster', perm: 'attendance.lock' },
)

/**
 * Reopening attendance sends the month's payroll back before generation: figures built from the old register,
 * and the HR and Finance sign-offs on them, must be regenerated and signed again. True when generated figures were set aside.
 */
async function sendPayrollBack(ctx: Parameters<typeof getMonthRegister>[0], year: number, month: number): Promise<boolean> {
  const cycle = await ctx.db(PayrollCycle).findOne({ year, month }, { status: 1, claimsClosed: 1 }).lean()
  if (!cycle) return false
  const target = reopenTarget(cycle.status, Boolean(cycle.claimsClosed?.at))
  if (!target) return false
  await ctx.db(PayrollCycle).updateOne({ _id: cycle._id, status: cycle.status }, { $set: { status: target }, $unset: { hrReviewed: 1, financeApproved: 1 } })
  return STALE_ON_REOPEN.includes(cycle.status)
}

export const reopenAttendanceMonth = action(
  z.object({ month: isoMonth, reason: requiredText('Reason', 300) }),
  async ({ month, reason }, ctx) => {
    const [y, m] = month.split('-').map(Number)
    const period = await ctx.db(AttendancePeriod).findOne({ year: y, month: m, status: 'locked' }).lean()
    if (!period) return fail(`${formatMonth(month)} is not locked.`)
    if (await payrollFrozen(ctx, y, m)) {
      const cycle = await ctx.db(PayrollCycle).findOne({ year: y, month: m }, { status: 1 }).lean()
      if (cycle?.status === 'locked') return fail(`${formatMonth(month)} payroll is locked, so its attendance must stay locked. Reopen the payroll month first.`)
      return fail(`${formatMonth(month)} salaries are already paid, so its attendance stays locked for good. Make the correction in a later month, for example with a payroll adjustment.`)
    }
    const { start, end } = monthRange(month)
    await ctx.db(AttendancePeriod).updateOne({ _id: period._id }, { $set: { status: 'open', reopenedReason: reason, reopenedAt: new Date() } })
    await ctx.db(AttendanceDay).updateMany({ date: { $gte: start, $lte: end } }, { $set: { locked: false } })
    const stale = await sendPayrollBack(ctx, y, m)
    revalidatePath('/app/hr/payroll')
    await audit(ctx, { action: 'attendance.reopened', entity: 'AttendancePeriod', entityId: month, summary: `${formatMonth(month)} attendance reopened`, product: 'muster', meta: { reason } })
    revalidatePath(REGISTER)
    return ok(`${formatMonth(month)} attendance reopened.${stale ? ' Its generated payroll and sign-offs were set aside:' : ''} Regenerate its payroll once the corrections are in.`)
  },
  { product: 'muster', perm: 'attendance.lock' },
)
