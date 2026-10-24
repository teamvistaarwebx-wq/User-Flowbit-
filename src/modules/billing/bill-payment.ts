import { settlementOf, type Settlement } from './rules'

/**
 * Applying money to a due bill (pure orchestration; storage injected, so the
 * idempotency and the TDS rule are tested without a database). Used by the
 * payment-link webhook and by a verified offline payment:
 *   - the same payment twice does nothing (Razorpay retries, double clicks);
 *   - a payment for a bill already paid or cancelled is flagged for Accounts
 *     (money arrived that nothing is owed for: refund or credit it);
 *   - money that settles the bill (in full, or ≥ 98% with TDS declared) turns
 *     it into the GST tax invoice and unlocks the workspace;
 *   - less is recorded as part payment and the bill stays due.
 */

export type BillMoney = Readonly<{
  /** Razorpay payment id, or `utr:<UTR>` for offline money. */
  paymentId: string
  provider: 'razorpay' | 'offline'
  amountPaise: number
  paidAt: Date
  billId: string
  utr?: string
  mode?: string
  offlinePaymentId?: string
}>

export type PayableBill = Readonly<{
  id: string
  status: 'due' | 'paid' | 'cancelled'
  totalPaise: number
  receivedPaise: number
  tdsDeclared: boolean
}>

export type BillPaymentDeps = Readonly<{
  /** True when this payment id was already applied to some bill. */
  alreadyApplied: (paymentId: string) => Promise<boolean>
  loadBill: (billId: string) => Promise<PayableBill | null>
  /** Records part of the money; the bill stays due. */
  recordPart: (bill: PayableBill, money: BillMoney) => Promise<void>
  /** Issues the tax invoice and applies the plan; returns the invoice number. */
  settle: (bill: PayableBill, money: BillMoney, settlement: Settlement) => Promise<string>
  /** Money nobody owes now: an alert for Accounts. */
  flag: (money: BillMoney, reason: string) => Promise<void>
}>

export type BillPaymentOutcome = 'paid' | 'part' | 'duplicate' | 'flagged'

export async function applyBillPayment(deps: BillPaymentDeps, money: BillMoney): Promise<BillPaymentOutcome> {
  if (await deps.alreadyApplied(money.paymentId)) return 'duplicate'
  const bill = await deps.loadBill(money.billId)
  if (!bill) {
    await deps.flag(money, 'No Flowbit bill matches this payment.')
    return 'flagged'
  }
  if (bill.status !== 'due') {
    await deps.flag(money, bill.status === 'paid' ? 'The bill was already paid: this looks like a second payment.' : 'The bill was cancelled before this payment arrived.')
    return 'flagged'
  }
  const settlement = settlementOf({ totalPaise: bill.totalPaise, receivedPaise: bill.receivedPaise + money.amountPaise, tdsDeclared: bill.tdsDeclared })
  if (settlement.status === 'short') {
    await deps.recordPart(bill, money)
    return 'part'
  }
  await deps.settle(bill, money, settlement)
  return 'paid'
}

/** Notes Flowbit puts on its own bills' payment links; the webhook reads them back. */
export const BILL_LINK_KIND = 'flowbit_bill'

/** A paid payment link of a Flowbit bill as money for `applyBillPayment`; null for other links (a workspace's own). */
export function billMoneyFromLink(event: { paymentId: string; amountPaise: number; paidAt: Date; method: string; notes: Readonly<Record<string, string>> }): BillMoney | null {
  if (event.notes.kind !== BILL_LINK_KIND || !event.notes.billId) return null
  return { paymentId: event.paymentId, provider: 'razorpay', amountPaise: event.amountPaise, paidAt: event.paidAt, billId: event.notes.billId, mode: event.method }
}
