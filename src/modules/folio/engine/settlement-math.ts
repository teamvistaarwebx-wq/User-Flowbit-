import { sumPaise, type Paise } from './money'

/**
 * Pure settlement rules (from BillingOS `lib/receipts/settle.ts`). The
 * invoice's paid/TDS/credited/balance and post-issue status are always
 * recomputed from source rows, never incremented.
 */

export type InvoiceStatus = 'draft' | 'issued' | 'part_paid' | 'paid' | 'void'

export type SettlementInput = { status: InvoiceStatus; total: Paise; paid: Paise; tds: Paise; credited: Paise; writtenOff: Paise }

/** Status and balance from what has settled. Draft and void are untouched with a zero balance. */
export function deriveSettlement(input: SettlementInput): { status: InvoiceStatus; balance: Paise } {
  if (input.status === 'draft' || input.status === 'void') return { status: input.status, balance: 0 }
  const settled = input.paid + input.tds + input.credited
  const status: InvoiceStatus = settled >= input.total ? 'paid' : settled > 0 ? 'part_paid' : 'issued'
  return { status, balance: Math.max(0, input.total - settled - input.writtenOff) }
}

/** What is still open for allocation or credit, from fresh source rows. */
export const outstandingOf = (total: Paise, settled: Paise, writtenOff: Paise): Paise => total - settled - writtenOff

/** A milestone follows its invoice: paid once the invoice is paid, invoiced otherwise. */
export const milestoneStatusFor = (invoiceStatus: InvoiceStatus): 'invoiced' | 'paid' => (invoiceStatus === 'paid' ? 'paid' : 'invoiced')

export type ReceiptLike = { amount: Paise; allocated: Paise }

/** Money received but not applied to any invoice (only the positive remainders). */
export const unappliedCredit = (receipts: readonly ReceiptLike[]): Paise => sumPaise(receipts.map((r) => Math.max(0, r.amount - r.allocated)))

/** The client's net receivable: open balances minus unapplied credit. */
export const netReceivable = (balances: readonly Paise[], receipts: readonly ReceiptLike[]): Paise => sumPaise(balances) - unappliedCredit(receipts)

/** Ledger closing: Σ debit − Σ credit (positive = owed to us). */
export const ledgerClosing = (rows: readonly { debit: Paise; credit: Paise }[]): Paise => sumPaise(rows.map((r) => r.debit - r.credit))
