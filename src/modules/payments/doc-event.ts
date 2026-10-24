import type { Types } from 'mongoose'
import type { PaidLinkEvent } from './webhook-event'

/**
 * The "Paid online" entry on an invoice's timeline, written as an upsert
 * keyed on the payment id (V2-REVIEW P4): when a later step fails and
 * Razorpay delivers the payment again, the entry is found, not added twice.
 * Pure: modules/payments/webhook runs it against DocEvent (unique index on
 * orgId + paymentId).
 */
export function paidDocEventWrite(orgId: Types.ObjectId, invoiceId: Types.ObjectId, event: Pick<PaidLinkEvent, 'paymentId' | 'paidAt' | 'amountPaise'>) {
  return {
    filter: { orgId, kind: 'invoice' as const, docId: invoiceId, type: 'paid' as const, paymentId: event.paymentId },
    update: { $setOnInsert: { at: event.paidAt, amountPaise: event.amountPaise } },
    options: { upsert: true },
  }
}
