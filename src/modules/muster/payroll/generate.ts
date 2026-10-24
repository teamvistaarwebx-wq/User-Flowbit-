import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { UserError } from '@/lib/errors'
import { Claim } from '@/models/muster/Claim'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { PayrollAdjustment } from '@/models/muster/PayrollAdjustment'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { PARTIAL_VIEW_REFUSAL, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { buildEntry, registerTotals, type BuiltEntry } from './entry-builder'
import { attendanceLocked, componentMap, cycleLabel, cycleMonth, statutoryFor, structuresOn, type CycleRecord, type StructureRecord } from './queries'
import { isOnPayroll, statusLabelOf } from '../people/lifecycle'
import { canGenerate } from './stages'
import { taxContexts } from '@/modules/muster/tax/queries'

const PRE_JOINING = ['candidate', 'offered', 'joining_pending']

export type GenerationReport = { paid: number; onHold: number; skipped: { name: string; reason: string }[] }

/** Refusals checked before anything is computed. */
async function assertCanGenerate(ctx: Ctx, cycle: CycleRecord) {
  if ((await visibleEmployeeIds(ctx)) !== null) throw new UserError(PARTIAL_VIEW_REFUSAL)
  const label = cycleLabel(cycle)
  if (!canGenerate(cycle.status)) throw new UserError(`${label} payroll is locked. Reopen it before generating again.`)
  if (!(await attendanceLocked(ctx, cycle.year, cycle.month))) throw new UserError(`Lock ${label} attendance first, then generate payroll.`)
  const { version, settings, block } = await statutoryFor(ctx, cycle.year, cycle.month)
  if (block || !version || !settings) throw new UserError(block ?? 'No statutory rates for this month.')
  return { version, settings }
}

/** People whose employment overlaps the month (exits inside it included; nobody before joining). */
async function peopleFor(ctx: Ctx, cycle: CycleRecord) {
  return ctx.db(Employee)
    .find({
      deletedAt: null,
      status: { $nin: PRE_JOINING },
      joinDate: { $lte: cycle.periodEnd },
      $or: [{ exitDate: null }, { exitDate: '' }, { exitDate: { $gte: cycle.periodStart } }],
    })
    .lean()
}

async function claimsByEmployee(ctx: Ctx, cycleId: Types.ObjectId) {
  const claims = await ctx.db(Claim).find({ payrollCycleId: cycleId, status: 'scheduled_for_payroll' }, { employeeId: 1, amountApproved: 1, amountClaimed: 1 }).lean()
  const map = new Map<string, { total: number; claimIds: string[] }>()
  for (const c of claims) {
    const key = String(c.employeeId)
    const current = map.get(key) ?? { total: 0, claimIds: [] }
    map.set(key, { total: current.total + (c.amountApproved ?? c.amountClaimed), claimIds: [...current.claimIds, String(c._id)] })
  }
  return map
}

export async function generatePayroll(ctx: Ctx, cycle: CycleRecord): Promise<GenerationReport> {
  const { version, settings } = await assertCanGenerate(ctx, cycle)
  const people = await peopleFor(ctx, cycle)
  const ids = people.map((p) => p._id)
  const [components, attendance, adjustments, claims, departments, structures] = await Promise.all([
    componentMap(ctx),
    getMonthRegister(ctx, cycleMonth(cycle), { employeeIds: ids.map(String) }).then((r) => new Map(r.rows.map((row) => [row.employeeId, row.summary]))),
    ctx.db(PayrollAdjustment).find({ cycleId: cycle._id, voidedAt: null }).sort({ createdAt: 1 }).lean(),
    claimsByEmployee(ctx, cycle._id),
    ctx.db(Department).find({}, { name: 1 }).lean(),
    structuresFor(ctx, people, cycle.periodEnd),
  ])
  const taxes = settings.tds.enabled && settings.tds.mode === 'auto' ? await taxContexts(ctx, cycle, people) : null
  const deptName = new Map(departments.map((d) => [String(d._id), d.name]))
  const holds = new Map((cycle.holds ?? []).map((h) => [String(h.employeeId), h]))
  const generatedAt = new Date()
  const versionFacts = { id: String(version._id), effectiveFrom: version.effectiveFrom, payrollFrom: version.payrollFrom, note: version.note ?? '' }
  const skipped: { employeeId: Types.ObjectId; name: string; reason: string }[] = []
  const entries: BuiltEntry[] = []
  for (const person of people) {
    const id = String(person._id)
    const hold = holds.get(id)
    const structure = structures.get(id)
    const summary = attendance.get(id)
    const reason = hold?.kind === 'exclude' ? `Excluded: ${hold.reason}` : !isOnPayroll(person.status) && !person.exitDate ? `${statusLabelOf(person.status)}, so not paid. Change their status back to a working one to pay them.` : !structure ? 'No salary structure is in force for this month.' : !summary ? 'Not on this month’s attendance register.' : null
    if (reason || !structure || !summary) {
      skipped.push({ employeeId: person._id, name: person.fullName, reason: reason ?? 'Skipped' })
      continue
    }
    entries.push(
      buildEntry({
        cycleId: cycle._id, month: cycle.month, generatedAt, person, structure, components, summary, settings, version: versionFacts,
        department: person.departmentId ? (deptName.get(String(person.departmentId)) ?? '') : '',
        adjustments: adjustments.filter((a) => String(a.employeeId) === id),
        reimbursement: claims.get(id) ?? { total: 0, claimIds: [] },
        holdReason: hold?.kind === 'hold' ? hold.reason : null,
        tax: taxes?.get(id) ?? null,
      }),
    )
  }
  await withTransaction(async (session) => {
    await ctx.db(PayrollEntry).deleteMany({ cycleId: cycle._id }, { session })
    if (entries.length) await ctx.db(PayrollEntry).insertMany(entries, { session })
    await ctx.db(PayrollCycle).updateOne(
      { _id: cycle._id },
      { $set: { status: 'generated', generated: { at: generatedAt, by: ctx.userId, name: ctx.user.name }, skipped, workingDays: entries[0]?.workingDays ?? 0, ...registerTotals(entries) }, $unset: { hrReviewed: 1, financeApproved: 1 } },
      { session },
    )
  })
  return { paid: entries.filter((e) => e.status === 'ready').length, onHold: entries.filter((e) => e.status === 'on_hold').length, skipped }
}

/** The structure in force for each person: on the month end, or on their last day if they left mid-month. */
async function structuresFor(ctx: Ctx, people: { _id: Types.ObjectId; exitDate?: string | null }[], periodEnd: string) {
  const dayOf = (p: { exitDate?: string | null }) => (p.exitDate && p.exitDate < periodEnd ? p.exitDate : periodEnd)
  const result = new Map<string, StructureRecord>()
  for (const day of new Set(people.map(dayOf))) {
    const onDay = await structuresOn(ctx, people.filter((p) => dayOf(p) === day).map((p) => p._id), day)
    onDay.forEach((s, k) => result.set(k, s))
  }
  return result
}

/** Cycle totals over entries that will be paid (on-hold entries wait until released). */
export async function recomputeTotals(ctx: Pick<Ctx, 'db'>, cycleId: Types.ObjectId): Promise<void> {
  const [t] = await ctx.db(PayrollEntry).aggregate<{ gross: number; deductions: number; reimbursements: number; net: number; employer: number; count: number }>([
    { $match: { cycleId, status: 'ready' } },
    { $group: { _id: null, gross: { $sum: '$totalEarnings' }, deductions: { $sum: '$totalDeductions' }, reimbursements: { $sum: '$reimbursementAmount' }, net: { $sum: '$netPay' }, employer: { $sum: { $add: ['$totalEarnings', '$totalEmployerContrib'] } }, count: { $sum: 1 } } },
  ])
  await ctx.db(PayrollCycle).updateOne(
    { _id: cycleId },
    { $set: { totalGross: t?.gross ?? 0, totalDeductions: t?.deductions ?? 0, totalReimbursements: t?.reimbursements ?? 0, totalNet: t?.net ?? 0, totalEmployerCost: t?.employer ?? 0, employeeCount: t?.count ?? 0 } },
  )
}

/** "Payroll generated for 18 employees. 2 skipped, named below. …" */
export function generationMessage(report: GenerationReport): string {
  const skipped = report.skipped.length
  if (report.paid + report.onHold === 0) return `Nobody could be paid: ${skipped} skipped, named below. Fix that, then generate again.`
  const held = report.onHold ? ` ${report.onHold} on hold.` : ''
  const skip = skipped ? ` ${skipped} skipped, named below.` : ''
  const people = report.paid + report.onHold
  return `Payroll generated for ${people} employee${people === 1 ? '' : 's'}.${held}${skip} Check the register, then mark it HR reviewed.`
}
