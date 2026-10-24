import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { buildEntry, type EntryTaxSnapshot } from '@/modules/muster/payroll/entry-builder'
import { componentMap, statutoryFor, structuresOn } from '@/modules/muster/payroll/queries'
import { readSnapshot } from '@/modules/muster/payroll/snapshot'
import { DEFAULT_STATUTORY } from '@/modules/muster/payroll/statutory'
import { taxContexts } from './queries'
import { monthsOfTaxYear, taxYearOf } from './worksheet'

/**
 * The worksheet to show for one person and tax year: the one behind their
 * latest payroll month, or (before any payroll in the year) a preview on
 * today's structure and declaration, so a changed declaration shows its
 * effect straight away.
 */

export type WorksheetView = { source: 'payroll' | 'preview'; monthLabel: string; tax: EntryTaxSnapshot } | null

type Person = { _id: Types.ObjectId; code: string; fullName: string; joinDate: string; exitDate?: string | null; ptState?: string | null; statutory?: { pfCovered?: boolean | null; esiCovered?: boolean | null; ptExempt?: boolean | null } | null }

const PREVIEW_DAYS = 26

/** The month the preview stands in: this month inside the year, else the year's first month. */
function previewMonth(fy: string): { year: number; month: number } {
  const today = todayIST()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  return taxYearOf(year, month) === fy ? { year, month } : monthsOfTaxYear(fy)[0]
}

async function latestPayrollTax(ctx: Pick<Ctx, 'db'>, employeeId: Types.ObjectId, fy: string) {
  const months = monthsOfTaxYear(fy)
  const cycles = await ctx.db(PayrollCycle).find({ $or: months.map((m) => ({ year: m.year, month: m.month })) }, { year: 1, month: 1 }).sort({ year: -1, month: -1 }).lean()
  for (const cycle of cycles) {
    const entry = await ctx.db(PayrollEntry).findOne({ cycleId: cycle._id, employeeId }, { snapshot: 1 }).lean()
    const tax = readSnapshot(entry?.snapshot)?.tax
    if (tax) return { cycle, tax }
  }
  return null
}

async function preview(ctx: Pick<Ctx, 'db'>, person: Person, fy: string): Promise<WorksheetView> {
  const { year, month } = previewMonth(fy)
  const day = `${year}-${String(month).padStart(2, '0')}-28`
  const [structures, components, statutory, contexts] = await Promise.all([
    structuresOn(ctx, [person._id], day),
    componentMap(ctx),
    statutoryFor(ctx, year, month),
    taxContexts(ctx, { _id: new Types.ObjectId(), year, month }, [person]),
  ])
  const structure = structures.get(String(person._id))
  const tax = contexts.get(String(person._id))
  if (!structure || !tax) return null
  const built = buildEntry({
    cycleId: new Types.ObjectId(), month, generatedAt: new Date(), person, department: '', structure, components,
    summary: { workingDays: PREVIEW_DAYS, payableDays: PREVIEW_DAYS, lopDays: 0, leaveDays: 0, presentDays: PREVIEW_DAYS, assumedDays: 0 },
    adjustments: [], reimbursement: { total: 0, claimIds: [] },
    settings: statutory.settings ?? DEFAULT_STATUTORY,
    version: { id: '', effectiveFrom: '', payrollFrom: '', note: '' },
    tax: { ...tax, override: null },
  })
  return built.snapshot.tax ? { source: 'preview', monthLabel: `${year}-${String(month).padStart(2, '0')}`, tax: built.snapshot.tax } : null
}

export async function worksheetView(ctx: Pick<Ctx, 'db'>, person: Person, fy: string): Promise<WorksheetView> {
  const latest = await latestPayrollTax(ctx, person._id, fy)
  if (latest) return { source: 'payroll', monthLabel: `${latest.cycle.year}-${String(latest.cycle.month).padStart(2, '0')}`, tax: latest.tax }
  return preview(ctx, person, fy)
}
