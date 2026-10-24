import { prefixFrom } from '@/lib/sequence'

/** Document numbers for payroll (pure, usable from the seed). */

/** Payslip and letter number prefix from the workspace name ("Vistaar WebX" → "VW"). */
export const orgPrefix = (org: { name: string }): string => prefixFrom(org.name) || 'HR'

/** "VW/202610/VW-0007" */
export const payslipNumberOf = (prefix: string, year: number, month: number, code: string): string => `${prefix}/${year}${String(month).padStart(2, '0')}/${code}`

export const payslipFileName = (year: number, month: number, code: string): string => `Payslip_${year}${String(month).padStart(2, '0')}_${code}.pdf`

/** "VW/HR/2026/0007" */
export const letterReference = (prefix: string, year: string, n: number): string => `${prefix}/HR/${year}/${String(n).padStart(4, '0')}`
