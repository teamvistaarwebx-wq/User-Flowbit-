import 'server-only'
import type { Types } from 'mongoose'
import type { StaffCtx } from '@/lib/console/session'
import { withTransaction } from '@/lib/db'
import { isoDateIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { chargesGst } from '@/lib/billing'
import { GST_PERCENT } from '@/lib/plans'
import { FlowbitCreditNote } from '@/models/billing/FlowbitCreditNote'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { liveFlowbitRazorpay } from './live'
import { nextCreditNoteNumber } from './numbers'
import { CREDIT_REASON_LABEL, creditNoteRefusal, refundRefusal, type CreditReason } from './rules'

/**
 * Credit notes on Flowbit's tax invoices (the Folio credit-note pattern:
 * numbered, never edited, reduce what the invoice settles) and refunds,
 * which go only to the original Razorpay payment (console spec 11).
 */

/** GST-inclusive amount → taxable value and tax, split like the invoice it credits (no tax on a 'no_gst' invoice, D8). */
export function creditSplit(totalPaise: number, supplyType: string) {
  if (!chargesGst(supplyType)) return { taxableValuePaise: totalPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }
  const taxable = Math.round((totalPaise * 100) / (100 + GST_PERCENT))
  const tax = totalPaise - taxable
  if (supplyType !== 'intra_state') return { taxableValuePaise: taxable, cgstPaise: 0, sgstPaise: 0, igstPaise: tax }
  const half = Math.floor(tax / 2)
  return { taxableValuePaise: taxable, cgstPaise: half, sgstPaise: tax - half, igstPaise: 0 }
}

export type CreditInput = { invoiceId: Types.ObjectId; amountPaise: number; reason: CreditReason; note?: string; refund: boolean }

export async function issueCreditNote(p: StaffCtx, input: CreditInput): Promise<{ number: string; refund: 'none' | 'processed' | 'pending' | 'failed'; refundError?: string }> {
  const invoice = await p.raw(SubscriptionInvoice).findById(input.invoiceId).lean()
  if (!invoice) throw new NotFoundError('That invoice')
  const credited = invoice.creditedPaise ?? 0
  const refusal = creditNoteRefusal({ kind: invoice.kind, invoiceStatus: invoice.status, totalPaise: invoice.totalPaise, creditedPaise: credited, amountPaise: input.amountPaise })
  if (refusal) throw new UserError(refusal)
  if (input.refund) {
    const paid = invoice.receivedPaise || invoice.totalPaise
    const no = refundRefusal({ provider: invoice.payment?.provider, paymentId: invoice.payment?.paymentId, cycle: invoice.cycle ?? null, reason: input.reason, amountPaise: input.amountPaise, paidPaise: paid, refundedPaise: invoice.refundedPaise ?? 0 })
    if (no) throw new UserError(no)
  }
  const issueDate = isoDateIST()
  const note = await withTransaction(async (session) => {
    const n = await nextCreditNoteNumber(issueDate, session)
    const updated = await SubscriptionInvoice.updateOne({ _id: invoice._id, creditedPaise: invoice.creditedPaise ?? { $in: [null, 0] } }, { $inc: { creditedPaise: input.amountPaise } }, { session })
    if (updated.modifiedCount !== 1) throw new UserError('Someone else credited this invoice just now. Reload and try again.')
    const created = await p.forOrg(invoice.orgId).db(FlowbitCreditNote).create(
      {
        invoiceId: invoice._id,
        invoiceNumber: invoice.number,
        number: n.number,
        seriesKey: n.seriesKey,
        fy: n.fy,
        issueDate,
        reason: input.reason,
        note: input.note,
        supplyType: invoice.supplyType,
        ...creditSplit(input.amountPaise, invoice.supplyType),
        totalPaise: input.amountPaise,
        refund: { status: 'none' },
        createdByStaff: p.staff.id,
        createdByName: p.staff.name,
      },
      { session },
    )
    return created.toObject()
  })
  let refund: 'none' | 'processed' | 'pending' | 'failed' = 'none'
  let refundError: string | undefined
  if (input.refund) {
    const client = liveFlowbitRazorpay()
    try {
      if (!client) throw new Error('Razorpay keys are not configured on this server.')
      const r = await client.refund({ paymentId: invoice.payment!.paymentId!, amountPaise: input.amountPaise, notes: { creditNote: note.number, invoice: invoice.number } })
      refund = r.status === 'processed' ? 'processed' : 'pending'
      await FlowbitCreditNote.updateOne({ _id: note._id }, { $set: { refund: { status: refund, razorpayRefundId: r.id, amountPaise: r.amountPaise, at: new Date() } } })
      await SubscriptionInvoice.updateOne({ _id: invoice._id }, { $inc: { refundedPaise: r.amountPaise } })
    } catch (error) {
      refund = 'failed'
      refundError = error instanceof Error ? error.message : 'Refund failed'
      await FlowbitCreditNote.updateOne({ _id: note._id }, { $set: { refund: { status: 'failed', error: refundError, at: new Date() } } })
    }
  }
  await p.audit({
    orgId: invoice.orgId,
    action: 'billing.credit_note_issued',
    entity: 'FlowbitCreditNote',
    entityId: note._id,
    summary: `Credit note ${note.number} on invoice ${invoice.number}: ${formatINR(input.amountPaise, { decimals: 2 })} (${CREDIT_REASON_LABEL[input.reason]})${input.refund ? `; refund ${refund}` : ''}`,
    meta: { reason: input.reason, note: input.note, refund, refundError },
  })
  return { number: note.number, refund, refundError }
}
