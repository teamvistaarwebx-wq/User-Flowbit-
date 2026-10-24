import { computeRegimeTax, type TaxBreakdown } from './compute'
import type { Regime, TaxRules } from './rules'

/**
 * The yearly salary TDS worksheet (pure). Projects the year's salary from what
 * was paid so far (YTD), this month, and the structure for the months left;
 * takes the employee's declarations (old regime only), computes the year's tax
 * and spreads what is still unpaid over the months left, this one included
 * (s.392(1): the average rate on the estimated income of the year).
 *
 * Salary figures are paise (payroll's unit); tax arithmetic is whole rupees.
 */

/** What the employee declared or HR verified, rupees a year (rent is a month). */
export type DeclaredAmounts = {
  sec80c: number
  sec80dSelf: number
  selfSenior: boolean
  sec80dParents: number
  parentsSenior: boolean
  rentMonthly: number
  metro: boolean
  landlordPan: string
  homeLoanInterest: number
  nps80ccd1b: number
  /** Salary from an earlier employer this year (mid-year joiner). */
  previousEmployer: { taxableSalary: number; tds: number; professionalTax: number }
}

export const EMPTY_DECLARATION: DeclaredAmounts = {
  sec80c: 0, sec80dSelf: 0, selfSenior: false, sec80dParents: 0, parentsSenior: false, rentMonthly: 0, metro: false, landlordPan: '', homeLoanInterest: 0, nps80ccd1b: 0,
  previousEmployer: { taxableSalary: 0, tds: 0, professionalTax: 0 },
}

/** One month's taxable salary facts, paise. */
export type SalaryMonth = { gross: number; basic: number; hra: number; professionalTax: number; pfEmployee: number }

export const ZERO_MONTH: SalaryMonth = { gross: 0, basic: 0, hra: 0, professionalTax: 0, pfEmployee: 0 }

export type WorksheetInput = {
  rules: TaxRules
  regime: Regime
  declared: DeclaredAmounts
  /** Paid earlier this tax year by this employer (paise), and TDS already cut. */
  ytd: SalaryMonth & { tds: number; months: number }
  /** This month as computed. */
  current: SalaryMonth
  /** A full month on the current structure, for each month after this one. */
  projected: SalaryMonth
  /** Months after this one still in the tax year and in employment. */
  futureMonths: number
  /** False when the employee has no valid PAN: TDS is then at least NO_PAN_RATE of taxable income. Absent = has one. */
  hasPan?: boolean
}

/** Without a PAN, salary TDS is at the average rate or 20%, whichever is higher (s.206AA of the 1961 Act, carried into the 2025 Act). */
export const NO_PAN_RATE = 0.2

export type Worksheet = {
  regime: Regime
  /** Rupees for the year. */
  salaryThisEmployer: number
  previousEmployerSalary: number
  grossSalary: number
  hraExemption: number
  standardDeduction: number
  professionalTax: number
  sec80c: number
  sec80d: number
  nps80ccd1b: number
  homeLoanInterest: number
  totalDeductions: number
  tax: TaxBreakdown
  tdsSoFar: number
  previousEmployerTds: number
  remainingTax: number
  monthsLeft: number
  /** This month's TDS, paise (whole rupees). */
  monthlyTdsPaise: number
  /** The other regime's yearly tax, for the comparison line. */
  otherRegime: { regime: Regime; totalTax: number }
  notes: string[]
}

const r = (paise: number) => Math.round(paise / 100)

/** The yearly amount to deduct: the tax, raised to NO_PAN_RATE of taxable income when there is tax and no PAN. */
function noPanLiability(totalTax: number, taxable: number, hasPan: boolean | undefined, notes: string[]): number {
  if (hasPan !== false || totalTax <= 0) return totalTax
  const floor = Math.round(taxable * NO_PAN_RATE)
  if (floor <= totalTax) return totalTax
  notes.push(`No PAN on record, so TDS is at ${NO_PAN_RATE * 100}% of taxable income (₹${floor.toLocaleString('en-IN')} for the year) instead of the slab tax. Add the PAN to bring it back to the slab rate.`)
  return floor
}
const clamp = (value: number, cap: number) => Math.max(0, Math.min(Math.round(value), cap))

function yearOf(input: WorksheetInput, key: keyof SalaryMonth): number {
  return r(input.ytd[key] + input.current[key] + input.projected[key] * input.futureMonths)
}

/** HRA exemption: the least of HRA received, rent above 10% of basic, and 50% (metro) or 40% of basic. */
function hraExemption(input: WorksheetInput, months: number, notes: string[]): number {
  const { declared, rules } = input
  const hra = yearOf(input, 'hra')
  const rent = declared.rentMonthly * months
  if (!hra || !rent) return 0
  if (rent > rules.hra.landlordPanAboveRent && !/^[A-Z]{5}\d{4}[A-Z]$/.test(declared.landlordPan.trim().toUpperCase())) {
    notes.push(`Rent above ₹${rules.hra.landlordPanAboveRent.toLocaleString('en-IN')} a year needs the landlord's PAN, so the HRA exemption is not applied yet.`)
    return 0
  }
  const basic = yearOf(input, 'basic')
  const share = ((declared.metro ? rules.hra.metroPercent : rules.hra.nonMetroPercent) * basic) / 100
  return clamp(Math.min(hra, rent - (rules.hra.rentPercentOfBasic * basic) / 100, share), Infinity)
}

type Deductions = Pick<Worksheet, 'hraExemption' | 'standardDeduction' | 'professionalTax' | 'sec80c' | 'sec80d' | 'nps80ccd1b' | 'homeLoanInterest'>

function deductionsFor(input: WorksheetInput, regime: Regime, notes: string[]): Deductions {
  const { rules, declared } = input
  const standardDeduction = rules.regimes[regime].standardDeduction
  if (regime === 'new') return { standardDeduction, hraExemption: 0, professionalTax: 0, sec80c: 0, sec80d: 0, nps80ccd1b: 0, homeLoanInterest: 0 }
  const { caps } = rules
  const months = input.ytd.months + 1 + input.futureMonths
  const pf = yearOf(input, 'pfEmployee')
  return {
    standardDeduction,
    hraExemption: hraExemption(input, months, notes),
    professionalTax: clamp(yearOf(input, 'professionalTax') + declared.previousEmployer.professionalTax, caps.professionalTax),
    sec80c: clamp(declared.sec80c + pf, caps.sec80c),
    sec80d: clamp(declared.sec80dSelf, declared.selfSenior ? caps.sec80dSelfSenior : caps.sec80dSelf) + clamp(declared.sec80dParents, declared.parentsSenior ? caps.sec80dParentsSenior : caps.sec80dParents),
    nps80ccd1b: clamp(declared.nps80ccd1b, caps.nps80ccd1b),
    homeLoanInterest: clamp(declared.homeLoanInterest, caps.homeLoanInterest),
  }
}

const sumDeductions = (d: Deductions) => d.hraExemption + d.standardDeduction + d.professionalTax + d.sec80c + d.sec80d + d.nps80ccd1b + d.homeLoanInterest

function taxableFor(input: WorksheetInput, regime: Regime, notes: string[]) {
  const salaryThisEmployer = yearOf(input, 'gross')
  const previousEmployerSalary = Math.max(0, Math.round(input.declared.previousEmployer.taxableSalary))
  const grossSalary = salaryThisEmployer + previousEmployerSalary
  const deductions = deductionsFor(input, regime, notes)
  const totalDeductions = sumDeductions(deductions)
  return { salaryThisEmployer, previousEmployerSalary, grossSalary, deductions, totalDeductions, taxable: Math.max(0, grossSalary - totalDeductions) }
}

export function buildWorksheet(input: WorksheetInput): Worksheet {
  const notes: string[] = []
  const mine = taxableFor(input, input.regime, notes)
  const tax = computeRegimeTax(mine.taxable, input.rules, input.regime)
  const other: Regime = input.regime === 'new' ? 'old' : 'new'
  const otherTax = computeRegimeTax(taxableFor(input, other, []).taxable, input.rules, other).totalTax
  const tdsSoFar = r(input.ytd.tds)
  const previousEmployerTds = Math.max(0, Math.round(input.declared.previousEmployer.tds))
  const liability = noPanLiability(tax.totalTax, mine.taxable, input.hasPan, notes)
  const remainingTax = Math.max(0, liability - tdsSoFar - previousEmployerTds)
  const monthsLeft = input.futureMonths + 1
  if (liability < tdsSoFar + previousEmployerTds) notes.push('More tax has been deducted this year than the projected liability. Nothing more is deducted; the employee claims the excess in their return.')
  return {
    regime: input.regime,
    salaryThisEmployer: mine.salaryThisEmployer,
    previousEmployerSalary: mine.previousEmployerSalary,
    grossSalary: mine.grossSalary,
    ...mine.deductions,
    totalDeductions: mine.totalDeductions,
    tax,
    tdsSoFar,
    previousEmployerTds,
    remainingTax,
    monthsLeft,
    monthlyTdsPaise: Math.round(remainingTax / monthsLeft) * 100,
    otherRegime: { regime: other, totalTax: otherTax },
    notes,
  }
}

/** Months after `month` (1–12) up to March, cut short by an exit date ('YYYY-MM-DD') inside the tax year. */
export function futureMonthsInYear(year: number, month: number, exitDate?: string | null): number {
  const fyEndYear = month >= 4 ? year + 1 : year
  const toIndex = (y: number, m: number) => y * 12 + (m - 1)
  const end = toIndex(fyEndYear, 3)
  const exit = exitDate && /^\d{4}-\d{2}/.test(exitDate) ? toIndex(Number(exitDate.slice(0, 4)), Number(exitDate.slice(5, 7))) : Infinity
  return Math.max(0, Math.min(end, exit) - toIndex(year, month))
}

/** '2026-27' for a payroll month. */
export const taxYearOf = (year: number, month: number): string => {
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** The calendar months of a tax year, April first: [{ year, month }]. */
export function monthsOfTaxYear(fy: string): { year: number; month: number }[] {
  const start = Number(fy.slice(0, 4))
  return Array.from({ length: 12 }, (_, i) => ({ year: i < 9 ? start : start + 1, month: ((i + 3) % 12) + 1 }))
}
