import type { CalculationType, ComponentType } from './components'
import { ceilToRupee, percentOf, prorate, roundToRupee, sumPaise, toPaise, toRupees, type Paise } from './money'
import { professionalTaxFor, type EsiSettings, type LwfSchedule, type PfSettings, type PtSchedule } from './statutory'

/**
 * The payroll calculator: a pure function of its inputs (no database, clock
 * or network). Generation stores these inputs as the entry's snapshot, so
 * re-running the engine over a snapshot reproduces the payslip exactly.
 * Money in and out is integer paise.
 */

const BASIC_CODE = 'BASIC'

export const SYSTEM_CODES = {
  pfEmployee: 'PF_EE',
  pfEmployer: 'PF_ER',
  esiEmployee: 'ESI_EE',
  esiEmployer: 'ESI_ER',
  professionalTax: 'PT',
  lwfEmployee: 'LWF_EE',
  lwfEmployer: 'LWF_ER',
  reimbursement: 'REIMBURSEMENT',
  tds: 'TDS',
} as const

export type LineType = 'earning' | 'deduction' | 'employer_contribution' | 'reimbursement'

export type ComponentDefinition = {
  code: string
  name: string
  componentType: ComponentType
  countsForPf: boolean
  countsForEsi: boolean
  prorateOnLop: boolean
  displayOrder: number
}

export type StructureLineInput = {
  component: ComponentDefinition
  calculationType: CalculationType
  /** Paise for `fixed`, a percentage otherwise. */
  value: number
}

export type AdjustmentInput = {
  code: string
  label: string
  lineType: 'earning' | 'deduction'
  /** Paise, always positive; `lineType` carries the direction. */
  amount: Paise
  reason: string
}

export type AttendanceInput = { workingDays: number; payableDays: number; lopDays: number }

export type EngineStatutory = {
  pf: PfSettings
  esi: EsiSettings
  /** The schedule for the employee's PT state, or null when the state has none. */
  pt: PtSchedule | null
  lwf: LwfSchedule | null
}

export type PayrollComputationInput = {
  monthlyGross: Paise
  ctcAnnual: Paise
  structure: readonly StructureLineInput[]
  attendance: AttendanceInput
  adjustments: readonly AdjustmentInput[]
  reimbursementTotal: Paise
  statutory: EngineStatutory
  /** Calendar month 1–12: LWF and PT overrides fall only in some months. */
  month: number
  netPayRounding: 'nearest_rupee' | 'none'
  pfExempt?: boolean
  esiExempt?: boolean
  ptExempt?: boolean
  /** The PT state, used only to word the "no schedule" warning. */
  ptState?: string | null
  /** Salary TDS for the month (modules/muster/tax): computed from the worksheet, or Finance's override with its reason. */
  tds?: { amount: Paise; overridden: boolean; reason?: string } | null
}

export type PayrollLine = {
  code: string
  label: string
  lineType: LineType
  amount: Paise
  isAdjustment: boolean
  reason?: string
  displayOrder: number
}

export type PayrollComputation = {
  lines: PayrollLine[]
  monthlyGross: Paise
  /** Prorated structure earnings, before one-time additions. */
  earnedGross: Paise
  totalEarnings: Paise
  totalDeductions: Paise
  totalEmployerContributions: Paise
  reimbursementAmount: Paise
  netPay: Paise
  pfWage: Paise
  esiWage: Paise
  warnings: string[]
}

type Bases = { monthlyGross: Paise; basic: Paise; monthlyCtc: Paise }

function resolveLine(line: StructureLineInput, bases: Bases): Paise {
  switch (line.calculationType) {
    case 'fixed':
      return Math.round(line.value)
    case 'percent_of_gross':
      return percentOf(bases.monthlyGross, line.value)
    case 'percent_of_basic':
      return percentOf(bases.basic, line.value)
    case 'percent_of_ctc':
      return percentOf(bases.monthlyCtc, line.value)
    case 'computed':
      return 0
  }
}

/**
 * Full-month amount (paise) per earning component code. Shared with the
 * salary editor's live preview so both use one rule.
 */
export function resolveStructure(monthlyGross: Paise, ctcAnnual: Paise, structure: readonly StructureLineInput[]): Map<string, Paise> {
  const monthlyCtc = Math.round(ctcAnnual / 12)
  const earnings = structure.filter((l) => l.component.componentType === 'earning')
  const basicLine = earnings.find((l) => l.component.code === BASIC_CODE)
  const basic = basicLine ? resolveLine(basicLine, { monthlyGross, basic: 0, monthlyCtc }) : 0
  return new Map(earnings.map((l) => [l.component.code, resolveLine(l, { monthlyGross, basic, monthlyCtc })]))
}

const rupeeText = (paise: Paise) => `₹${toRupees(Math.abs(paise)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function earningLines(input: PayrollComputationInput, warnings: string[]) {
  const { workingDays, payableDays } = input.attendance
  const full = resolveStructure(input.monthlyGross, input.ctcAnnual, input.structure)
  const total = sumPaise([...full.values()])
  if (total !== input.monthlyGross) {
    warnings.push(`Salary components do not add up to the monthly gross (off by ${rupeeText(total - input.monthlyGross)}). Review the structure before locking payroll.`)
  }
  const lines: PayrollLine[] = []
  let earnedGross = 0
  let pfWage = 0
  let esiWage = 0
  for (const line of input.structure.filter((l) => l.component.componentType === 'earning')) {
    const amount = full.get(line.component.code) ?? 0
    const earned = line.component.prorateOnLop ? prorate(amount, payableDays, workingDays) : amount
    if (earned === 0 && amount === 0) continue
    earnedGross += earned
    if (line.component.countsForPf) pfWage += earned
    if (line.component.countsForEsi) esiWage += earned
    lines.push({ code: line.component.code, label: line.component.name, lineType: 'earning', amount: earned, isAdjustment: false, displayOrder: line.component.displayOrder })
  }
  return { lines, earnedGross, pfWage, esiWage }
}

const nonZero = (line: PayrollLine): PayrollLine[] => (line.amount !== 0 ? [line] : [])

function pfLines(input: PayrollComputationInput, pfWage: Paise): PayrollLine[] {
  const { pf } = input.statutory
  if (!pf.enabled || input.pfExempt || pfWage <= 0) return []
  const { workingDays, payableDays } = input.attendance
  const ceiling = pf.prorateCeiling ? prorate(toPaise(pf.wageCeiling), payableDays, workingDays) : toPaise(pf.wageCeiling)
  const base = pf.applyCeiling ? Math.min(pfWage, ceiling) : pfWage
  return [
    ...nonZero({ code: SYSTEM_CODES.pfEmployee, label: 'Provident Fund', lineType: 'deduction', amount: roundToRupee(percentOf(base, pf.employeeRatePercent)), isAdjustment: false, displayOrder: 610 }),
    ...nonZero({ code: SYSTEM_CODES.pfEmployer, label: 'Employer PF', lineType: 'employer_contribution', amount: roundToRupee(percentOf(base, pf.employerRatePercent)), isAdjustment: false, displayOrder: 810 }),
  ]
}

/** ESI eligibility is judged on the full monthly gross: LOP never pulls someone into the scheme. */
function esiLines(input: PayrollComputationInput, esiWage: Paise): PayrollLine[] {
  const { esi } = input.statutory
  const eligible = esi.enabled && !input.esiExempt && input.monthlyGross <= toPaise(esi.grossEligibilityLimit)
  if (!eligible || esiWage <= 0) return []
  return [
    ...nonZero({ code: SYSTEM_CODES.esiEmployee, label: 'ESI Contribution', lineType: 'deduction', amount: ceilToRupee(percentOf(esiWage, esi.employeeRatePercent)), isAdjustment: false, displayOrder: 620 }),
    ...nonZero({ code: SYSTEM_CODES.esiEmployer, label: 'Employer ESI', lineType: 'employer_contribution', amount: ceilToRupee(percentOf(esiWage, esi.employerRatePercent)), isAdjustment: false, displayOrder: 820 }),
  ]
}

function lwfLines(input: PayrollComputationInput): PayrollLine[] {
  const { lwf } = input.statutory
  if (!lwf?.enabled || !lwf.remittanceMonths.includes(input.month)) return []
  return [
    ...nonZero({ code: SYSTEM_CODES.lwfEmployee, label: 'Labour Welfare Fund', lineType: 'deduction', amount: toPaise(lwf.employeeAmount), isAdjustment: false, displayOrder: 640 }),
    ...nonZero({ code: SYSTEM_CODES.lwfEmployer, label: 'Employer LWF', lineType: 'employer_contribution', amount: toPaise(lwf.employerAmount), isAdjustment: false, displayOrder: 830 }),
  ]
}

function ptLines(input: PayrollComputationInput, earnedGross: Paise, warnings: string[]): PayrollLine[] {
  if (input.ptExempt) return []
  if (!input.statutory.pt) {
    if (input.ptState) warnings.push(`No professional tax schedule is set for ${input.ptState}, so none was deducted. Add one in the statutory rates if the state levies it.`)
    return []
  }
  const amount = toPaise(professionalTaxFor(input.statutory.pt, toRupees(earnedGross), input.month))
  return nonZero({ code: SYSTEM_CODES.professionalTax, label: 'Professional Tax', lineType: 'deduction', amount, isAdjustment: false, displayOrder: 630 })
}

function tdsLines(input: PayrollComputationInput): PayrollLine[] {
  if (!input.tds) return []
  const amount = Math.max(0, roundToRupee(input.tds.amount))
  const reason = input.tds.overridden ? input.tds.reason : undefined
  return nonZero({ code: SYSTEM_CODES.tds, label: 'Income tax (TDS)', lineType: 'deduction', amount, isAdjustment: input.tds.overridden, ...(reason ? { reason } : {}), displayOrder: 650 })
}

export function computePayroll(input: PayrollComputationInput): PayrollComputation {
  const warnings: string[] = []
  const earned = earningLines(input, warnings)

  const adjustments: PayrollLine[] = input.adjustments.map((a, i) => ({
    code: a.code,
    label: a.label,
    lineType: a.lineType,
    amount: Math.abs(Math.round(a.amount)),
    isAdjustment: true,
    reason: a.reason,
    displayOrder: 500 + i,
  }))
  const adjustmentEarnings = sumPaise(adjustments.filter((l) => l.lineType === 'earning').map((l) => l.amount))

  const lines: PayrollLine[] = [
    ...earned.lines,
    ...adjustments,
    ...pfLines(input, earned.pfWage),
    ...esiLines(input, earned.esiWage),
    ...lwfLines(input),
    ...ptLines(input, earned.earnedGross, warnings),
    ...tdsLines(input),
  ]
  if (input.tds && adjustments.some((a) => a.code === SYSTEM_CODES.tds)) {
    warnings.push('TDS is computed automatically and was also added by hand as an adjustment. Remove the adjustment, or override the computed TDS instead.')
  }

  const totalEarnings = earned.earnedGross + adjustmentEarnings
  const totalDeductions = sumPaise(lines.filter((l) => l.lineType === 'deduction').map((l) => l.amount))
  const totalEmployerContributions = sumPaise(lines.filter((l) => l.lineType === 'employer_contribution').map((l) => l.amount))
  const reimbursementAmount = Math.max(0, Math.round(input.reimbursementTotal))
  const withClaims = reimbursementAmount > 0
    ? [...lines, { code: SYSTEM_CODES.reimbursement, label: 'Reimbursement', lineType: 'reimbursement' as const, amount: reimbursementAmount, isAdjustment: false, displayOrder: 700 }]
    : lines

  const rawNet = totalEarnings - totalDeductions + reimbursementAmount
  if (rawNet < 0) {
    warnings.push('Deductions exceed earnings for this month. Net pay has been floored at zero — carry the balance forward or reduce the recovery before locking payroll.')
  }
  const clamped = Math.max(rawNet, 0)
  const netPay = input.netPayRounding === 'nearest_rupee' ? roundToRupee(clamped) : clamped

  return {
    lines: [...withClaims].sort((a, b) => a.displayOrder - b.displayOrder),
    monthlyGross: input.monthlyGross,
    earnedGross: earned.earnedGross,
    totalEarnings,
    totalDeductions,
    totalEmployerContributions,
    reimbursementAmount,
    netPay,
    pfWage: earned.pfWage,
    esiWage: earned.esiWage,
    warnings,
  }
}

/** Code for an adjustment line: the label upper-cased, spaces to underscores, at most 24 characters. */
export const adjustmentCode = (label: string): string =>
  label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'ADJUSTMENT'
