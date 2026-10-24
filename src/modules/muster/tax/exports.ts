import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Employee } from '@/models/muster/Employee'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { readSnapshot } from '@/modules/muster/payroll/snapshot'
import { isAtLeast } from '@/modules/muster/payroll/stages'
import type { EntryTaxSnapshot } from '@/modules/muster/payroll/entry-builder'
import { declarationsFor } from './queries'
import { quarterMonths, type DeducteeRow, type Quarter, type SalaryDetailRow } from './form138'
import { tdsOf } from './salary-month'
import { monthsOfTaxYear } from './worksheet'

/**
 * Loads paid payroll months for the salary-tax exports. Only months that have
 * been released (salary actually paid) count: TDS is deducted on payment.
 */

type DbCtx = Pick<Ctx, 'db'>

async function paidCycles(ctx: DbCtx, months: readonly { year: number; month: number }[]) {
  const cycles = await ctx.db(PayrollCycle).find({ $or: months.map((m) => ({ year: m.year, month: m.month })) }, { year: 1, month: 1, status: 1, paymentDate: 1, periodEnd: 1 }).lean()
  return cycles.filter((c) => isAtLeast(c.status, 'released'))
}

export async function deducteesFor(ctx: DbCtx, fy: string, quarter: Quarter): Promise<{ rows: DeducteeRow[]; unpaidMonths: number }> {
  const months = quarterMonths(fy, quarter)
  const cycles = await paidCycles(ctx, months)
  const entries = await ctx.db(PayrollEntry).find({ cycleId: { $in: cycles.map((c) => c._id) }, status: 'ready' }, { employeeId: 1, employeeCode: 1, employeeName: 1, totalEarnings: 1, lines: 1, cycleId: 1, 'snapshot.employee.pan': 1 }).lean()
  const declarations = await declarationsFor(ctx, fy, entries.map((e) => e.employeeId))
  const cycleOf = new Map(cycles.map((c) => [String(c._id), c]))
  const rows = entries.map((e) => {
    const c = cycleOf.get(String(e.cycleId))
    const pan = (e.snapshot as { employee?: { pan?: string } } | undefined)?.employee?.pan ?? ''
    return {
      employeeCode: e.employeeCode ?? '', name: e.employeeName, pan, regime: declarations.get(String(e.employeeId))?.regime === 'old' ? 'old' as const : 'new' as const,
      paidOn: c?.paymentDate || c?.periodEnd || '', amountPaid: e.totalEarnings, tds: tdsOf(e.lines ?? []),
    }
  })
  return { rows, unpaidMonths: months.length - cycles.length }
}

/** Each person's year: their latest worksheet, TDS deducted and dates employed. */
export async function salaryDetailsFor(ctx: DbCtx, fy: string): Promise<SalaryDetailRow[]> {
  const months = monthsOfTaxYear(fy)
  const cycles = await paidCycles(ctx, months)
  const order = new Map(cycles.map((c) => [String(c._id), c.year * 12 + c.month]))
  const entries = await ctx.db(PayrollEntry).find({ cycleId: { $in: cycles.map((c) => c._id) }, status: 'ready' }, { employeeId: 1, employeeCode: 1, employeeName: 1, lines: 1, cycleId: 1, snapshot: 1 }).lean()
  const people = new Map<string, { entries: typeof entries; employeeId: Types.ObjectId }>()
  for (const e of entries) {
    const key = String(e.employeeId)
    people.set(key, { employeeId: e.employeeId, entries: [...(people.get(key)?.entries ?? []), e] })
  }
  const employees = await ctx.db(Employee).find({ _id: { $in: [...people.values()].map((p) => p.employeeId) } }, { joinDate: 1, exitDate: 1 }).lean()
  const dates = new Map(employees.map((e) => [String(e._id), e]))
  const fyStart = `${fy.slice(0, 4)}-04-01`
  const fyEnd = `${Number(fy.slice(0, 4)) + 1}-03-31`
  return [...people.entries()].flatMap(([id, p]) => {
    const sorted = [...p.entries].sort((a, b) => (order.get(String(b.cycleId)) ?? 0) - (order.get(String(a.cycleId)) ?? 0))
    const latest = sorted.find((e) => readSnapshot(e.snapshot)?.tax)
    const tax: EntryTaxSnapshot | undefined = latest ? readSnapshot(latest.snapshot)?.tax : undefined
    if (!tax || !latest) return []
    const emp = dates.get(id)
    const from = emp?.joinDate && emp.joinDate > fyStart ? emp.joinDate : fyStart
    const to = emp?.exitDate && emp.exitDate < fyEnd ? emp.exitDate : fyEnd
    const pan = readSnapshot(latest.snapshot)?.employee.pan ?? ''
    return [{ employeeCode: latest.employeeCode ?? '', name: latest.employeeName, pan, from, to, worksheet: tax.worksheet, tdsDeducted: p.entries.reduce((s, e) => s + tdsOf(e.lines ?? []), 0) }]
  })
}

/** Form 130 Part B data for one person: the latest worksheet, TDS per quarter and whether the year is complete. */
export async function form130For(ctx: DbCtx, fy: string, employeeId: Types.ObjectId) {
  const months = monthsOfTaxYear(fy)
  const cycles = await paidCycles(ctx, months)
  const entries = await ctx.db(PayrollEntry).find({ cycleId: { $in: cycles.map((c) => c._id) }, employeeId, status: 'ready' }, { lines: 1, cycleId: 1, snapshot: 1, totalEarnings: 1 }).lean()
  const monthOf = new Map(cycles.map((c) => [String(c._id), { year: c.year, month: c.month }]))
  const quarterOf = (m: { year: number; month: number }) => Math.floor(months.findIndex((x) => x.year === m.year && x.month === m.month) / 3)
  const quarters = [0, 1, 2, 3].map((q) => {
    const inQ = entries.filter((e) => quarterOf(monthOf.get(String(e.cycleId)) ?? { year: 0, month: 0 }) === q)
    return { quarter: `Q${q + 1}`, amountPaid: inQ.reduce((s, e) => s + e.totalEarnings, 0), tds: inQ.reduce((s, e) => s + tdsOf(e.lines ?? []), 0) }
  })
  const latest = [...entries].sort((a, b) => {
    const ma = monthOf.get(String(a.cycleId)); const mb = monthOf.get(String(b.cycleId))
    return (mb ? mb.year * 12 + mb.month : 0) - (ma ? ma.year * 12 + ma.month : 0)
  }).find((e) => readSnapshot(e.snapshot)?.tax)
  const marchPaid = cycles.some((c) => c.year === months[11].year && c.month === months[11].month)
  return { quarters, tax: latest ? (readSnapshot(latest.snapshot)?.tax ?? null) : null, complete: marchPaid }
}
