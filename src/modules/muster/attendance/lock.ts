import 'server-only'
import type { ClientSession } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { formatMonth } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { CompOff } from '@/models/muster/CompOff'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import type { PendingInMonth } from './pending-copy'

/** True when the month ('YYYY-MM') is locked. */
export async function isMonthLocked(ctx: Pick<Ctx, 'db'>, month: string, session?: ClientSession): Promise<boolean> {
  return Boolean(await ctx.db(AttendancePeriod).findOne({ period: month, status: 'locked' }, { _id: 1 }, session ? { session } : undefined).lean())
}

/**
 * Every attendance write checks this first: a locked month refuses the write
 * until someone with unlock rights reopens it.
 */
export async function assertMonthsOpen(ctx: Pick<Ctx, 'db'>, dates: readonly string[], what = 'this change', session?: ClientSession): Promise<void> {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort()
  for (const month of months) {
    if (await isMonthLocked(ctx, month, session)) {
      throw new UserError(`Attendance for ${formatMonth(month)} is locked, so ${what} cannot be saved. Ask someone with unlock rights to reopen that month first.`)
    }
  }
}

/** Requests still waiting on a decision for days of the month (`start`..`end`, ISO dates). */
export async function pendingInMonth(ctx: Pick<Ctx, 'db'>, start: string, end: string): Promise<PendingInMonth> {
  const [leave, corrections, compOffs] = await Promise.all([
    ctx.db(LeaveRequest).countDocuments({ status: 'pending', dates: { $elemMatch: { $gte: start, $lte: end } } }),
    ctx.db(AttendanceCorrection).countDocuments({ status: 'pending', date: { $gte: start, $lte: end } }),
    ctx.db(CompOff).countDocuments({ status: 'pending', workedOn: { $gte: start, $lte: end } }),
  ])
  return { leave, corrections, compOffs }
}
