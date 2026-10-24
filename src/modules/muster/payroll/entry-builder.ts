import type { Types } from 'mongoose'
import { buildWorksheet, type DeclaredAmounts, type SalaryMonth, type Worksheet } from '@/modules/muster/tax/worksheet'
import type { Regime, TaxRules } from '@/modules/muster/tax/rules'
import { salaryMonthOf } from '@/modules/muster/tax/salary-month'
import { adjustmentCode, computePayroll, type PayrollComputation, type PayrollComputationInput, type PayrollLine } from './engine'
import { maskAccount } from './money'
import type { EntrySnapshot } from './snapshot'
import { lwfScheduleFor, ptScheduleFor, type StatutorySettings } from './statutory'
import { engineLines, type ComponentLike, type StoredLine } from './structure-lines'

/**
 * One person's payroll entry from everything it depends on (pure). Used by
 * generation and by the seed, so both store the same snapshot shape.
 */

type Id = Types.ObjectId

export type EntryPerson = {
  _id: Id
  code: string
  fullName: string
  designation?: string | null
  joinDate: string
  exitDate?: string | null
  pan?: string | null
  uan?: string | null
  esicNumber?: string | null
  ptState?: string | null
  bank?: { bankName?: string | null; accountNumber?: string | null } | null
  statutory?: { pfCovered?: boolean | null; esiCovered?: boolean | null; ptExempt?: boolean | null } | null
}

export type EntrySummary = { workingDays: number; payableDays: number; lopDays: number; leaveDays: number; presentDays: number; assumedDays: number }

export type EntryInputs = {
  cycleId: Id
  month: number
  generatedAt: Date
  person: EntryPerson
  department: string
  structure: { _id: Id; effectiveFrom: string; monthlyGross: number; ctcAnnual: number; lines: readonly StoredLine[] }
  components: ReadonlyMap<string, ComponentLike>
  summary: EntrySummary
  adjustments: readonly { label: string; lineType: 'earning' | 'deduction'; amount: number; reason: string }[]
  reimbursement: { total: number; claimIds: string[] }
  settings: StatutorySettings
  version: { id: string; effectiveFrom: string; payrollFrom: string; note: string }
  /** Reason the pay is held, if it is. */
  holdReason?: string | null
  /** Automatic salary TDS (statutory TDS mode 'auto'); absent in manual mode. */
  tax?: EntryTax | null
}

export type EntryTax = {
  fy: string
  rules: TaxRules
  regime: Regime
  declared: DeclaredAmounts
  /** Whether `declared` holds HR-verified proofs. */
  verified: boolean
  ytd: SalaryMonth & { tds: number; months: number }
  futureMonths: number
  override?: { amount: number; reason: string } | null
}

/** What the entry's TDS came from, kept in the snapshot for the worksheet view and Form 130. */
export type EntryTaxSnapshot = { fy: string; regime: Regime; verified: boolean; computedPaise: number; overridden: boolean; reason?: string; worksheet: Worksheet }

export type BuiltEntry = {
  cycleId: Id
  employeeId: Id
  employeeName: string
  employeeCode: string
  monthlyGross: number
  workingDays: number
  payableDays: number
  lopDays: number
  leaveDays: number
  presentDays: number
  earnedGross: number
  totalEarnings: number
  totalDeductions: number
  totalEmployerContrib: number
  reimbursementAmount: number
  netPay: number
  status: 'ready' | 'on_hold'
  notes?: string
  warnings: string[]
  snapshot: EntrySnapshot
  lines: PayrollLine[]
}

function engineInput(i: EntryInputs): PayrollComputationInput {
  const p = i.person
  return {
    monthlyGross: i.structure.monthlyGross,
    ctcAnnual: i.structure.ctcAnnual,
    structure: engineLines(i.structure.lines, i.components),
    attendance: { workingDays: i.summary.workingDays, payableDays: i.summary.payableDays, lopDays: i.summary.lopDays },
    adjustments: i.adjustments.map((a) => ({ code: adjustmentCode(a.label), label: a.label, lineType: a.lineType, amount: a.amount, reason: a.reason })),
    reimbursementTotal: i.reimbursement.total,
    statutory: { pf: i.settings.pf, esi: i.settings.esi, pt: ptScheduleFor(i.settings, p.ptState), lwf: lwfScheduleFor(i.settings, p.ptState) },
    month: i.month,
    netPayRounding: 'nearest_rupee',
    pfExempt: !p.statutory?.pfCovered,
    esiExempt: !p.statutory?.esiCovered,
    ptExempt: Boolean(p.statutory?.ptExempt),
    ptState: p.ptState ?? null,
  }
}

/** A full month on the structure: attendance complete, no one-time lines (the projection for the months ahead). */
const fullMonth = (input: PayrollComputationInput): PayrollComputation =>
  computePayroll({ ...input, attendance: { workingDays: input.attendance.workingDays || 1, payableDays: input.attendance.workingDays || 1, lopDays: 0 }, adjustments: [], reimbursementTotal: 0, tds: null })

/** This month's TDS from the worksheet, or the override. */
function withTds(input: PayrollComputationInput, tax: EntryTax | null | undefined, hasPan: boolean): { input: PayrollComputationInput; tax: EntryTaxSnapshot | null } {
  if (!tax) return { input, tax: null }
  const first = computePayroll({ ...input, tds: null })
  const worksheet = buildWorksheet({ rules: tax.rules, regime: tax.regime, declared: tax.declared, ytd: tax.ytd, current: salaryMonthOf(first.lines), projected: salaryMonthOf(fullMonth(input).lines), futureMonths: tax.futureMonths, hasPan })
  const computedPaise = worksheet.monthlyTdsPaise
  const override = tax.override ?? null
  const tds = override ? { amount: override.amount, overridden: true, reason: override.reason } : { amount: computedPaise, overridden: false }
  return { input: { ...input, tds }, tax: { fy: tax.fy, regime: tax.regime, verified: tax.verified, computedPaise, overridden: Boolean(override), ...(override ? { reason: override.reason } : {}), worksheet } }
}

export function buildEntry(i: EntryInputs): BuiltEntry {
  const p = i.person
  const { input, tax } = withTds(engineInput(i), i.tax, /^[A-Z]{5}\d{4}[A-Z]$/.test((p.pan ?? '').trim().toUpperCase()))
  const r = computePayroll(input)
  const snapshot: EntrySnapshot = {
    version: 1,
    generatedAt: i.generatedAt.toISOString(),
    employee: {
      id: String(p._id), code: p.code, name: p.fullName, department: i.department, designation: p.designation ?? '', joinDate: p.joinDate, exitDate: p.exitDate ?? null,
      pan: p.pan ?? '', uan: p.uan ?? '', esicNumber: p.esicNumber ?? '', ptState: p.ptState ?? '', bankName: p.bank?.bankName ?? '', bankAccountMasked: maskAccount(p.bank?.accountNumber),
    },
    structure: { id: String(i.structure._id), effectiveFrom: i.structure.effectiveFrom },
    attendance: { ...i.summary },
    reimbursement: i.reimbursement,
    statutoryVersion: i.version,
    input,
    ...(tax ? { tax } : {}),
    result: { earnedGross: r.earnedGross, totalEarnings: r.totalEarnings, totalDeductions: r.totalDeductions, totalEmployerContributions: r.totalEmployerContributions, reimbursementAmount: r.reimbursementAmount, netPay: r.netPay, pfWage: r.pfWage, esiWage: r.esiWage, warnings: r.warnings },
  }
  return {
    cycleId: i.cycleId,
    employeeId: p._id,
    employeeName: p.fullName,
    employeeCode: p.code,
    monthlyGross: i.structure.monthlyGross,
    workingDays: i.summary.workingDays,
    payableDays: i.summary.payableDays,
    lopDays: i.summary.lopDays,
    leaveDays: i.summary.leaveDays,
    presentDays: i.summary.presentDays,
    earnedGross: r.earnedGross,
    totalEarnings: r.totalEarnings,
    totalDeductions: r.totalDeductions,
    totalEmployerContrib: r.totalEmployerContributions,
    reimbursementAmount: r.reimbursementAmount,
    netPay: r.netPay,
    status: i.holdReason ? 'on_hold' : 'ready',
    notes: i.holdReason ? `On hold: ${i.holdReason}` : undefined,
    warnings: r.warnings,
    snapshot,
    lines: r.lines,
  }
}

/** Register totals over payable (ready) entries. */
export function registerTotals(entries: readonly Pick<BuiltEntry, 'status' | 'totalEarnings' | 'totalDeductions' | 'reimbursementAmount' | 'netPay' | 'totalEmployerContrib'>[]) {
  const ready = entries.filter((e) => e.status === 'ready')
  const sum = (key: 'totalEarnings' | 'totalDeductions' | 'reimbursementAmount' | 'netPay' | 'totalEmployerContrib') => ready.reduce((s, e) => s + e[key], 0)
  return { totalGross: sum('totalEarnings'), totalDeductions: sum('totalDeductions'), totalReimbursements: sum('reimbursementAmount'), totalNet: sum('netPay'), totalEmployerCost: sum('totalEarnings') + sum('totalEmployerContrib'), employeeCount: ready.length }
}
