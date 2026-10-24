import 'server-only'
import type { ClientSession } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Claim } from '@/models/muster/Claim'
import { PayrollCycle } from '@/models/muster/PayrollCycle'

type ClaimFilter = Record<string, unknown>

/**
 * Takes scheduled claims back out of their payroll month: they return to
 * Approved (or Partly approved when the amount was reduced) with no month, so
 * they can be sent to another month or marked paid outside payroll.
 */
export async function returnScheduledClaims(ctx: Pick<Ctx, 'db'>, filter: ClaimFilter, session?: ClientSession): Promise<number> {
  const base = { ...filter, status: 'scheduled_for_payroll' }
  const full = await ctx.db(Claim).updateMany({ ...base, $expr: { $eq: ['$amountApproved', '$amountClaimed'] } }, { $set: { status: 'approved', payrollCycleId: null } }, { session })
  const reduced = await ctx.db(Claim).updateMany(base, { $set: { status: 'partially_approved', payrollCycleId: null } }, { session })
  return full.modifiedCount + reduced.modifiedCount
}

/** Claims left "In payroll" on a month that was released without them (from before release returned them). */
export async function returnStrandedClaims(ctx: Pick<Ctx, 'db'>, ids: readonly unknown[]): Promise<number> {
  const released = await ctx.db(PayrollCycle).distinct('_id', { status: { $in: ['released', 'payslips_published'] } })
  if (!released.length) return 0
  return returnScheduledClaims(ctx, { _id: { $in: ids }, payrollCycleId: { $in: released } })
}
