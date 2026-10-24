import { sumPaise, type Paise } from './money'
import type { LineType } from './engine'

/**
 * The accounting journal for a payroll month (pure, paise). Earnings are
 * carried by the gross total; deductions become liabilities; employer
 * contributions are both an expense and a liability.
 */

export type JournalInput = {
  month: string
  entries: { grossEarnings: Paise; reimbursement: Paise; netPay: Paise; lines: { code: string; lineType: LineType; amount: Paise }[] }[]
}

export type JournalLine = { account: string; debit: Paise; credit: Paise; note: string }

export type PayrollJournal = { month: string; lines: JournalLine[]; totalDebit: Paise; totalCredit: Paise; balanced: boolean; employeeCount: number }

const DEDUCTION_PAYABLE: Record<string, string> = {
  PF_EE: 'PF Payable',
  ESI_EE: 'ESI Payable',
  PT: 'Professional Tax Payable',
  TDS: 'TDS Payable',
  LWF_EE: 'LWF Payable',
}

const EMPLOYER_ACCOUNTS: Record<string, { expense: string; payable: string }> = {
  PF_ER: { expense: 'Employer PF Contribution', payable: 'PF Payable' },
  ESI_ER: { expense: 'Employer ESI Contribution', payable: 'ESI Payable' },
  LWF_ER: { expense: 'Employer LWF Contribution', payable: 'LWF Payable' },
}

const NOTES: Record<string, string> = {
  'Salary and Wages': 'Gross earnings before deductions',
  'Staff Reimbursements': 'Approved expense claims paid with salary',
  'Employer PF Contribution': "Company's share of provident fund",
  'Employer ESI Contribution': "Company's share of ESI",
  'Employer LWF Contribution': "Company's share of labour welfare fund",
  'PF Payable': 'Employee and employer share, due to EPFO',
  'ESI Payable': 'Employee and employer share, due to ESIC',
  'LWF Payable': 'Employee and employer share, due to the welfare board',
  'Professional Tax Payable': 'Due to the state',
  'TDS Payable': 'Tax deducted at source, due to the department',
  'Other Recoveries': 'Advances, loans and other recoveries',
  'Net Salary Payable': 'Payable to employees',
  'Rounding Off': 'Net pay rounded to the rupee for each employee',
}

export function buildPayrollJournal(input: JournalInput): PayrollJournal {
  const debits = new Map<string, Paise>()
  const credits = new Map<string, Paise>()
  const add = (map: Map<string, Paise>, account: string, amount: Paise) => {
    if (amount !== 0) map.set(account, (map.get(account) ?? 0) + amount)
  }

  for (const entry of input.entries) {
    add(debits, 'Salary and Wages', entry.grossEarnings)
    add(debits, 'Staff Reimbursements', entry.reimbursement)
    add(credits, 'Net Salary Payable', entry.netPay)
    for (const line of entry.lines) {
      if (line.lineType === 'deduction') add(credits, DEDUCTION_PAYABLE[line.code] ?? 'Other Recoveries', line.amount)
      if (line.lineType === 'employer_contribution') {
        const accounts = EMPLOYER_ACCOUNTS[line.code] ?? { expense: 'Employer Contributions', payable: 'Statutory Payable' }
        add(debits, accounts.expense, line.amount)
        add(credits, accounts.payable, line.amount)
      }
    }
  }

  // Net pay is rounded per employee, so allow up to ₹1 per person as rounding.
  const gap = sumPaise([...debits.values()]) - sumPaise([...credits.values()])
  if (gap !== 0 && Math.abs(gap) <= Math.max(1, input.entries.length) * 100) add(gap > 0 ? credits : debits, 'Rounding Off', Math.abs(gap))

  const lines = [...new Set([...debits.keys(), ...credits.keys()])]
    .map((account) => ({ account, debit: debits.get(account) ?? 0, credit: credits.get(account) ?? 0, note: NOTES[account] ?? '' }))
    .filter((l) => l.debit > 0 || l.credit > 0)
    .sort((a, b) => b.debit - a.debit || b.credit - a.credit)
  const totalDebit = sumPaise(lines.map((l) => l.debit))
  const totalCredit = sumPaise(lines.map((l) => l.credit))
  return { month: input.month, lines, totalDebit, totalCredit, balanced: totalDebit === totalCredit, employeeCount: input.entries.length }
}
