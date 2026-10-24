import type { PayableInvoice, ReceiptPlan } from './allocation'
import { receiptFromPayment } from './allocation'
import { unappliedPaise } from './link-rules'
import type { PaidLinkEvent } from './webhook-event'

/**
 * Applying one `payment_link.paid` (pure orchestration, storage injected so
 * the idempotency is testable): claim the payment id, record the receipt,
 * allocate it, mark the link paid, then fire `payment.received` (and alert
 * finance when the money could not go to the invoice). A repeat
 * delivery of a finished payment does nothing; a failed one runs again.
 */

export type Claim = 'new' | 'retry' | 'done' | 'busy'

export type PaidDeps = Readonly<{
  /** Inserts the PaymentEvent (unique payment id) or reports where an earlier delivery got to. */
  claim: (event: PaidLinkEvent) => Promise<Claim>
  /** The invoice the link was made for, or null (deleted, another workspace). */
  invoiceFor: (event: PaidLinkEvent) => Promise<PayableInvoice | null>
  recordReceipt: (plan: ReceiptPlan) => Promise<{ receiptId: string }>
  markLinkPaid: (event: PaidLinkEvent) => Promise<void>
  finish: (event: PaidLinkEvent, outcome: { status: 'done' | 'ignored' | 'failed'; receiptId?: string; note?: string }) => Promise<void>
  emitPaid: (invoice: PayableInvoice, receiptId: string, event: PaidLinkEvent) => Promise<void>
  /** Tells finance that part or all of the payment could not go to its invoice (void, already settled, overpaid). */
  alertUnapplied: (invoice: PayableInvoice, event: PaidLinkEvent, unappliedPaise: number) => Promise<void>
}>

export type PaidOutcome = 'recorded' | 'duplicate' | 'busy' | 'ignored' | 'failed'

export async function processPaidLink(deps: PaidDeps, event: PaidLinkEvent): Promise<PaidOutcome> {
  const claim = await deps.claim(event)
  if (claim === 'done') return 'duplicate'
  if (claim === 'busy') return 'busy'
  const invoice = await deps.invoiceFor(event)
  if (!invoice) {
    await deps.finish(event, { status: 'ignored', note: 'No invoice of this workspace matches the payment link.' })
    return 'ignored'
  }
  try {
    const plan = receiptFromPayment(invoice, event)
    const { receiptId } = await deps.recordReceipt(plan)
    await deps.markLinkPaid(event)
    await deps.finish(event, { status: 'done', receiptId })
    await deps.emitPaid(invoice, receiptId, event)
    const unapplied = unappliedPaise(plan)
    if (unapplied > 0) await deps.alertUnapplied(invoice, event, unapplied).catch((error: unknown) => console.error('[payments] unapplied payment alert failed', event.paymentId, error))
    return 'recorded'
  } catch (error) {
    await deps.finish(event, { status: 'failed', note: error instanceof Error ? error.message : String(error) })
    return 'failed'
  }
}
