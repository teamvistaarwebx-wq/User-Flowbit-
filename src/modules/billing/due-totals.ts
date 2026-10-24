import { billBalancePaise, expectedTdsPaise, type BalanceBill } from './rules'

/**
 * Money still to come in on due bills (pure), net of TDS declared and of
 * part payments received: the Console Billing totals and Home's "Overdue"
 * figure both read this, so they agree with what each bill asks for.
 */

export type DueBill = BalanceBill & Readonly<{ dueDate?: string | null }>
export type DueTotals = Readonly<{ duePaise: number; dueCount: number; overduePaise: number; overdueCount: number }>

/** `today` is the IST date 'YYYY-MM-DD'; a bill is overdue the day after its due date. */
export function dueTotals(bills: readonly DueBill[], today: string): DueTotals {
  const overdue = bills.filter((b) => b.dueDate != null && b.dueDate < today)
  const sum = (list: readonly DueBill[]) => list.reduce((total, b) => total + billBalancePaise(b), 0)
  return { duePaise: sum(bills), dueCount: bills.length, overduePaise: sum(overdue), overdueCount: overdue.length }
}

/** The TDS on a bill: the recorded amount once paid, otherwise 2% of its taxable value (what the customer will deduct). */
export const tdsOfBill = (bill: Readonly<{ status: string; taxableValuePaise: number; tds?: { amountPaise?: number | null } | null }>): number =>
  bill.status === 'due' ? expectedTdsPaise(bill.taxableValuePaise) : (bill.tds?.amountPaise ?? 0)
