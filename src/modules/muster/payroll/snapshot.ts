import type { PayrollComputation, PayrollComputationInput } from './engine'
import type { EntryTaxSnapshot } from './entry-builder'

/**
 * Everything a payroll entry was computed from. Re-running `computePayroll`
 * over `input` reproduces the entry; the payslip and statutory reports read
 * employee facts from here, not from today's record.
 */
export type EntrySnapshot = {
  version: 1
  generatedAt: string
  employee: {
    id: string
    code: string
    name: string
    department: string
    designation: string
    joinDate: string
    exitDate: string | null
    pan: string
    uan: string
    esicNumber: string
    ptState: string
    bankName: string
    bankAccountMasked: string
  }
  structure: { id: string; effectiveFrom: string }
  attendance: { workingDays: number; payableDays: number; lopDays: number; leaveDays: number; presentDays: number; assumedDays: number }
  reimbursement: { total: number; claimIds: string[] }
  statutoryVersion: { id: string; effectiveFrom: string; payrollFrom: string; note: string }
  input: PayrollComputationInput
  /** Automatic TDS: the worksheet behind this month's figure (absent in manual mode). */
  tax?: EntryTaxSnapshot
  result: Pick<PayrollComputation, 'earnedGross' | 'totalEarnings' | 'totalDeductions' | 'totalEmployerContributions' | 'reimbursementAmount' | 'netPay' | 'pfWage' | 'esiWage' | 'warnings'>
}

/** Reads a stored snapshot defensively (older or hand-edited rows). */
export const readSnapshot = (value: unknown): EntrySnapshot | null =>
  value && typeof value === 'object' && (value as { version?: number }).version === 1 ? (value as EntrySnapshot) : null
