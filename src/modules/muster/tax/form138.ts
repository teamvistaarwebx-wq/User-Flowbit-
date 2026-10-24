import { rupees, type CsvCell } from '@/modules/muster/reports/csv'
import type { Regime } from './rules'
import { monthsOfTaxYear } from './worksheet'
import type { Worksheet } from './worksheet'

/**
 * Quarterly salary TDS data for the CA (pure): the deductee rows of Form 138
 * (ex-24Q) and, for Q4, the year's salary details per person. A CSV the CA
 * imports into their return utility; Flowbit does not file the return.
 */

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const
export type Quarter = (typeof QUARTERS)[number]

/** The calendar months of a quarter of the tax year. */
export function quarterMonths(fy: string, quarter: Quarter): { year: number; month: number }[] {
  const i = QUARTERS.indexOf(quarter)
  return monthsOfTaxYear(fy).slice(i * 3, i * 3 + 3)
}

/** The TDS section under the Income-tax Act, 2025 (salary): s.392. */
export const SALARY_SECTION = '392'

export type DeducteeRow = {
  employeeCode: string
  name: string
  pan: string
  regime: Regime
  /** 'YYYY-MM-DD' */
  paidOn: string
  amountPaid: number
  tds: number
}

export const DEDUCTEE_HEADER = ['Sr No', 'Employee ID', 'PAN', 'Name', 'Section', 'Date of payment', 'Amount paid (₹)', 'TDS deducted (₹)', 'TDS deposited (₹)', 'Date of deduction', 'Old regime opted (Y/N)', 'PAN missing (higher rate check)']

export function deducteeRows(rows: readonly DeducteeRow[]): CsvCell[][] {
  return [...rows]
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.name.localeCompare(b.name))
    .map((r, i) => [i + 1, r.employeeCode, r.pan || 'PANNOTAVBL', r.name, SALARY_SECTION, r.paidOn, rupees(r.amountPaid), rupees(r.tds), rupees(r.tds), r.paidOn, r.regime === 'old' ? 'Y' : 'N', r.pan ? 'N' : 'Y'])
}

export type SalaryDetailRow = { employeeCode: string; name: string; pan: string; from: string; to: string; worksheet: Worksheet; tdsDeducted: number }

export const SALARY_HEADER = ['Employee ID', 'PAN', 'Name', 'Employed from', 'Employed to', 'Regime', 'Gross salary (₹)', 'Previous employer salary (₹)', 'Standard deduction (₹)', 'HRA exemption (₹)', 'Professional tax (₹)', '80C (₹)', '80D (₹)', '80CCD(1B) (₹)', 'Home loan interest (₹)', 'Taxable income (₹)', 'Tax on income (₹)', 'Rebate (₹)', 'Surcharge (₹)', 'Cess (₹)', 'Tax for the year (₹)', 'TDS deducted here (₹)', 'TDS by previous employer (₹)']

const whole = (n: number) => rupees(Math.round(n) * 100)

export function salaryRows(rows: readonly SalaryDetailRow[]): CsvCell[][] {
  return rows.map((r) => {
    const w = r.worksheet
    return [r.employeeCode, r.pan || 'PANNOTAVBL', r.name, r.from, r.to, w.regime, whole(w.salaryThisEmployer), whole(w.previousEmployerSalary), whole(w.standardDeduction), whole(w.hraExemption), whole(w.professionalTax), whole(w.sec80c), whole(w.sec80d), whole(w.nps80ccd1b), whole(w.homeLoanInterest), whole(w.tax.taxableIncome), whole(w.tax.slabTax), whole(w.tax.rebate), whole(w.tax.surcharge), whole(w.tax.cess), whole(w.tax.totalTax), rupees(r.tdsDeducted), whole(w.previousEmployerTds)]
  })
}
