import { formatINR } from '@/lib/money'

/**
 * One `payment.received` per receipt (pure): a deposit split across several
 * invoices thanks the client once, for the whole amount, naming every
 * invoice; the balance is what is still due across them.
 */

type Vars = Record<string, string | number>

export type PaidInvoice = Readonly<{ number: string; balancePaise: number; amountPaise: number; vars: Vars }>

/** "A", "A and B", "A, B and C". */
export function joinNumbers(numbers: readonly string[]): string {
  const named = numbers.filter(Boolean)
  if (named.length < 2) return named[0] ?? ''
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
}

/** The event's variables for the invoices one receipt paid (the first invoice's for everything shared, like the client). */
export function receiptPaymentVars(paid: readonly PaidInvoice[]): Vars | null {
  if (!paid.length) return null
  if (paid.length === 1) return { ...paid[0].vars, amount: formatINR(paid[0].amountPaise), amount_paise: paid[0].amountPaise }
  const amount = paid.reduce((sum, p) => sum + p.amountPaise, 0)
  const balance = paid.reduce((sum, p) => sum + p.balancePaise, 0)
  return {
    ...paid[0].vars,
    invoice_number: joinNumbers(paid.map((p) => p.number)),
    amount: formatINR(amount),
    amount_paise: amount,
    balance_due: formatINR(balance),
    balance_due_paise: balance,
  }
}
