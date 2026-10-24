import { isoDateIST } from '@/lib/dates'
import type { PaidLinkEvent } from './webhook-event'

/**
 * The receipt a gateway payment becomes (pure): the money lands as one
 * receipt, applied to the invoice up to what it still owes; anything more
 * (a link paid twice, or after a manual receipt) stays as advance credit.
 */

export type PayableInvoice = Readonly<{ id: string; number?: string | null; clientId: string; entityId: string; status: string; outstandingPaise: number }>

export type ReceiptPlan = Readonly<{
  clientId: string
  entityId: string
  receivedOn: string
  amountPaise: number
  mode: 'gateway'
  reference: string
  notes: string
  allocations: readonly { invoiceId: string; amountPaise: number; tdsPaise: number }[]
}>

const OPEN = ['issued', 'part_paid']

export function receiptFromPayment(invoice: PayableInvoice, payment: PaidLinkEvent): ReceiptPlan {
  const applied = OPEN.includes(invoice.status) ? Math.min(payment.amountPaise, Math.max(0, invoice.outstandingPaise)) : 0
  return {
    clientId: invoice.clientId,
    entityId: invoice.entityId,
    receivedOn: isoDateIST(payment.paidAt),
    amountPaise: payment.amountPaise,
    mode: 'gateway',
    reference: payment.paymentId,
    notes: `Paid online through Razorpay (${[payment.method, payment.detail].filter(Boolean).join(', ')}), payment link ${payment.linkId}.`,
    allocations: applied > 0 ? [{ invoiceId: invoice.id, amountPaise: applied, tdsPaise: 0 }] : [],
  }
}
