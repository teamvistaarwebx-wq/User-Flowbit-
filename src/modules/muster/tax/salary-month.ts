import type { SalaryMonth } from './worksheet'

/**
 * A payroll month's taxable facts from its lines (pure): gross earnings, basic,
 * HRA, professional tax and employee PF, paise. TDS itself never counts.
 */

type LineLike = { code: string; lineType: string; amount: number }

const amountOf = (lines: readonly LineLike[], code: string) => lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0)

export function salaryMonthOf(lines: readonly LineLike[]): SalaryMonth {
  return {
    gross: lines.filter((l) => l.lineType === 'earning').reduce((s, l) => s + l.amount, 0),
    basic: amountOf(lines, 'BASIC'),
    hra: amountOf(lines, 'HRA'),
    professionalTax: amountOf(lines, 'PT'),
    pfEmployee: amountOf(lines, 'PF_EE'),
  }
}

export const tdsOf = (lines: readonly LineLike[]): number => amountOf(lines, 'TDS')

/** Sums months (YTD). */
export function addMonths(months: readonly SalaryMonth[]): SalaryMonth {
  return months.reduce<SalaryMonth>(
    (t, m) => ({ gross: t.gross + m.gross, basic: t.basic + m.basic, hra: t.hra + m.hra, professionalTax: t.professionalTax + m.professionalTax, pfEmployee: t.pfEmployee + m.pfEmployee }),
    { gross: 0, basic: 0, hra: 0, professionalTax: 0, pfEmployee: 0 },
  )
}
