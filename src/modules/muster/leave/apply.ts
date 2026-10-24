import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import type { LeaveType } from '@/models/muster/LeaveType'
import type { RawOf } from '@/lib/db/scoped'
import { COMP_OFF_CODE, NO_BALANCE_CODES } from '../settings/defaults'
import { getPolicy, orgCalendar } from '../settings/queries'
import { availableDays } from './balances'
import { computeLeaveDays, leaveDates, leaveRangeProblem, splitAgainstBalance, unpaidDatesOf } from './days'

type Person = { _id: Types.ObjectId; employmentType: string; status: string; joinDate: string; exitDate?: string | null; fullName: string }
type TypeDoc = RawOf<typeof LeaveType> & { _id: Types.ObjectId }

export type LeavePlan = { dates: string[]; dayCount: number; paidDays: number; unpaidDays: number; unpaidDates: string[]; balanceNote: string | null }

const fieldError = (field: string, message: string) => new UserError(message, { [field]: message })

/**
 * Works out what a leave request costs before it is saved: the dated days
 * (weekly offs and holidays skipped) and the paid / loss-of-pay split against
 * the balance. Throws a UserError with a field error when the request cannot be made.
 */
export async function planLeave(ctx: Ctx, person: Person, type: TypeDoc, input: { startDate: string; endDate: string; isHalfDay: boolean; hasProof: boolean }): Promise<LeavePlan> {
  const today = todayIST()
  const range = leaveRangeProblem({ start: input.startDate, end: input.endDate, isHalfDay: input.isHalfDay, joinDate: person.joinDate, today })
  if (range) throw fieldError(range.field, range.message)
  if (person.exitDate && input.endDate > person.exitDate) throw fieldError('endDate', `Leave cannot run past their last working day, ${formatDate(person.exitDate)}.`)
  if (input.isHalfDay && type.allowHalfDay === false) throw fieldError('isHalfDay', `${type.name} cannot be taken as a half day.`)

  const calendar = await orgCalendar(ctx, input.startDate, input.endDate)
  const dates = leaveDates(input.startDate, input.endDate, calendar)
  const dayCount = computeLeaveDays(input.startDate, input.endDate, input.isHalfDay, calendar)
  if (!dayCount) throw fieldError('endDate', 'That range contains only weekly offs and holidays — no leave is needed.')
  const needsProof = type.requiresProof || (type.proofRequiredAfterDays != null && dayCount > type.proofRequiredAfterDays)
  if (needsProof && !input.hasProof) throw fieldError('attachment', `${type.name} for ${dayCount} days needs a supporting document. Attach it to the request.`)

  const { paid, unpaid, note } = await splitFor(ctx, person, type, dayCount, input.startDate)
  return { dates, dayCount, paidDays: paid, unpaidDays: unpaid, unpaidDates: unpaidDatesOf(dates, paid, input.isHalfDay), balanceNote: note }
}

async function splitFor(ctx: Ctx, person: Person, type: TypeDoc, dayCount: number, startDate: string): Promise<{ paid: number; unpaid: number; note: string | null }> {
  if (!type.isPaid) return { paid: 0, unpaid: dayCount, note: null }
  if (NO_BALANCE_CODES.has(type.code)) return { paid: dayCount, unpaid: 0, note: null }
  if (type.accrualModel === 'on_application' && type.code !== COMP_OFF_CODE) {
    const cap = type.annualQuota || dayCount
    const split = splitAgainstBalance(dayCount, cap)
    return { ...split, note: split.unpaid ? `${type.name} is granted up to ${cap} days per request.` : null }
  }
  const policy = await getPolicy(ctx)
  const balance = await availableDays(ctx, person, String(type._id), startDate > todayIST() ? startDate : todayIST())
  const available = (balance?.remaining ?? 0) - (balance?.pending ?? 0)
  if (policy.leave.allowNegativeBalance) return { paid: dayCount, unpaid: 0, note: null }
  const split = splitAgainstBalance(dayCount, available)
  const note = split.unpaid ? `${split.paid} paid from the ${type.name} balance and ${split.unpaid} as loss of pay, because the balance does not cover the whole period.` : null
  return { ...split, note }
}

/** Overlap with another pending or approved request. */
export function overlapFilter(employeeId: Types.ObjectId, startDate: string, endDate: string): Record<string, unknown> {
  return { employeeId, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } }
}
