import 'server-only'
import { isValidObjectId } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { PayrollAdjustment } from '@/models/muster/PayrollAdjustment'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { visibleEmployeeIds } from '@/modules/muster/people/scope'
import { APPROVED } from '@/modules/muster/claims/constants'
import { attendanceLocked, getCycle, statutoryFor, syncAttendanceStages } from './queries'
import { pendingTransitions } from './timeline'

export async function loadCycleView(ctx: Ctx, id: string, opts: { q?: string; entryId?: string }) {
  const found = await getCycle(ctx, id)
  if (!found) return null
  // A month whose attendance was locked (or reopened) after it was opened moves between the two attendance stages.
  const [locked, [cycle]] = await Promise.all([attendanceLocked(ctx, found.year, found.month), syncAttendanceStages(ctx, [found])])
  const entryFilter: Record<string, unknown> = { cycleId: cycle._id, ...(opts.q ? { $or: [{ employeeName: new RegExp(escapeRegex(opts.q), 'i') }, { employeeCode: new RegExp(escapeRegex(opts.q), 'i') }] } : {}) }
  const [statutory, entries, adjustments, bankChanges, unscheduled, seesEveryone, payslips] = await Promise.all([
    statutoryFor(ctx, cycle.year, cycle.month),
    ctx.db(PayrollEntry).find(entryFilter, { snapshot: 0 }).sort({ employeeName: 1 }).lean(),
    ctx.db(PayrollAdjustment).find({ cycleId: cycle._id, voidedAt: null }).sort({ createdAt: 1 }).lean(),
    ctx.can('people.read_sensitive') ? ctx.db(BankChangeRequest).find({ verifiedAt: null }).sort({ createdAt: -1 }).lean() : Promise.resolve([]),
    ctx.db(Claim).countDocuments({ status: { $in: [...APPROVED] }, payrollCycleId: null }),
    visibleEmployeeIds(ctx).then((v) => v === null),
    ctx.db(Payslip).countDocuments({ cycleId: cycle._id, isPublished: true }),
  ])
  const entry = opts.entryId && isValidObjectId(opts.entryId) ? await ctx.db(PayrollEntry).findOne({ _id: opts.entryId, cycleId: cycle._id }).lean() : null
  return {
    cycle,
    attendanceLocked: locked,
    statutory: { version: statutory.version, block: statutory.block, transitions: pendingTransitions(statutory.versions, cycle.year, cycle.month) },
    entries,
    adjustments,
    bankChanges,
    unscheduled,
    seesEveryone,
    payslips,
    entry,
    entryAdjustments: entry ? adjustments.filter((a) => String(a.employeeId) === String(entry.employeeId)) : [],
  }
}
export type CycleView = NonNullable<Awaited<ReturnType<typeof loadCycleView>>>
