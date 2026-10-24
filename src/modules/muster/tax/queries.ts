import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { TaxDeclaration } from '@/models/muster/TaxDeclaration'
import { TaxYearSettings } from '@/models/muster/TaxYearSettings'
import { TdsOverride } from '@/models/muster/TdsOverride'
import { consoleSettings } from '@/modules/console/settings-query'
import type { EntryTax } from '@/modules/muster/payroll/entry-builder'
import { PAID_STATUSES } from '@/modules/muster/payroll/stages'
import { DEFAULT_TAX_RULES, type Regime, type TaxRules } from './rules'
import { addMonths, salaryMonthOf, tdsOf } from './salary-month'
import { EMPTY_DECLARATION, futureMonthsInYear, monthsOfTaxYear, taxYearOf, type DeclaredAmounts } from './worksheet'

type DbCtx = Pick<Ctx, 'db'>

/** The Console's TDS rules; the built-in ones if the settings cannot be read (payroll never stops on it). */
export async function taxRules(): Promise<TaxRules> {
  try {
    return (await consoleSettings()).tax
  } catch (error) {
    console.error('[tax] Console settings unreadable; using the built-in TDS rules', error)
    return DEFAULT_TAX_RULES
  }
}

type StoredAmounts = unknown
const recordOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** A stored declaration's amounts with every field filled. */
export function amountsOf(stored: StoredAmounts): DeclaredAmounts {
  const s = recordOf(stored)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  const prev = recordOf(s.previousEmployer)
  return {
    sec80c: n(s.sec80c), sec80dSelf: n(s.sec80dSelf), selfSenior: Boolean(s.selfSenior), sec80dParents: n(s.sec80dParents), parentsSenior: Boolean(s.parentsSenior),
    rentMonthly: n(s.rentMonthly), metro: Boolean(s.metro), landlordPan: typeof s.landlordPan === 'string' ? s.landlordPan : '', homeLoanInterest: n(s.homeLoanInterest), nps80ccd1b: n(s.nps80ccd1b),
    previousEmployer: { taxableSalary: n(prev.taxableSalary), tds: n(prev.tds), professionalTax: n(prev.professionalTax) },
  }
}

export type DeclarationRecord = Awaited<ReturnType<typeof declarationsFor>> extends Map<string, infer D> ? D : never

export async function declarationsFor(ctx: DbCtx, fy: string, employeeIds: readonly Types.ObjectId[]) {
  const rows = await ctx.db(TaxDeclaration).find({ fy, employeeId: { $in: employeeIds } }).lean()
  return new Map(rows.map((d) => [String(d.employeeId), d]))
}

/** The amounts TDS uses: verified proofs once HR has verified them, the declaration before that. */
export function effectiveDeclaration(d: { declared?: StoredAmounts; verified?: StoredAmounts; proofStatus?: string | null; regime?: string | null } | null | undefined): { regime: Regime; declared: DeclaredAmounts; verified: boolean } {
  if (!d) return { regime: 'new', declared: EMPTY_DECLARATION, verified: false }
  const verified = d.proofStatus === 'verified' && Boolean(d.verified)
  return { regime: d.regime === 'old' ? 'old' : 'new', declared: amountsOf(verified ? d.verified : d.declared), verified }
}

export async function taxYearSettings(ctx: DbCtx, fy: string) {
  return ctx.db(TaxYearSettings).findOne({ fy }).lean()
}

type Ytd = EntryTax['ytd']

/** Salary paid and TDS cut by this employer earlier in the tax year, per person (paid entries only). */
export async function ytdFor(ctx: DbCtx, year: number, month: number, employeeIds: readonly Types.ObjectId[]): Promise<Map<string, Ytd>> {
  const fy = taxYearOf(year, month)
  const before = monthsOfTaxYear(fy).filter((m) => m.year * 12 + m.month < year * 12 + month)
  const result = new Map<string, Ytd>()
  if (!before.length) return result
  const cycles = await ctx.db(PayrollCycle).find({ $or: before.map((m) => ({ year: m.year, month: m.month })), status: { $in: PAID_STATUSES } }, { _id: 1 }).lean()
  if (!cycles.length) return result
  const entries = await ctx.db(PayrollEntry).find({ cycleId: { $in: cycles.map((c) => c._id) }, employeeId: { $in: employeeIds }, status: 'ready' }, { employeeId: 1, lines: 1 }).lean()
  const byPerson = new Map<string, typeof entries>()
  for (const e of entries) byPerson.set(String(e.employeeId), [...(byPerson.get(String(e.employeeId)) ?? []), e])
  for (const [id, rows] of byPerson) {
    const month = addMonths(rows.map((e) => salaryMonthOf(e.lines ?? [])))
    result.set(id, { ...month, tds: rows.reduce((s, e) => s + tdsOf(e.lines ?? []), 0), months: rows.length })
  }
  return result
}

const ZERO_YTD: Ytd = { gross: 0, basic: 0, hra: 0, professionalTax: 0, pfEmployee: 0, tds: 0, months: 0 }

/** The automatic-TDS context of each person for a payroll month. */
export async function taxContexts(ctx: DbCtx, cycle: { _id: Types.ObjectId; year: number; month: number }, people: readonly { _id: Types.ObjectId; exitDate?: string | null }[]): Promise<Map<string, EntryTax>> {
  const fy = taxYearOf(cycle.year, cycle.month)
  const ids = people.map((p) => p._id)
  const [rules, declarations, ytd, overrides] = await Promise.all([
    taxRules(),
    declarationsFor(ctx, fy, ids),
    ytdFor(ctx, cycle.year, cycle.month, ids),
    ctx.db(TdsOverride).find({ cycleId: cycle._id, voidedAt: null }).sort({ createdAt: 1 }).lean(),
  ])
  const overrideOf = new Map(overrides.map((o) => [String(o.employeeId), { amount: o.amount, reason: o.reason }]))
  return new Map(
    people.map((p) => {
      const id = String(p._id)
      const eff = effectiveDeclaration(declarations.get(id))
      const tax: EntryTax = { fy, rules, ...eff, ytd: ytd.get(id) ?? ZERO_YTD, futureMonths: futureMonthsInYear(cycle.year, cycle.month, p.exitDate), override: overrideOf.get(id) ?? null }
      return [id, tax]
    }),
  )
}
