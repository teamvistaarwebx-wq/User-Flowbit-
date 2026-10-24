import 'server-only'
import { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { DocEvent } from '@/models/folio/DocEvent'
import { Invoice } from '@/models/folio/Invoice'
import { FolioReceipt } from '@/models/folio/Receipt'
import { PaymentEvent } from '@/models/payments/PaymentEvent'
import { PaymentGateway } from '@/models/payments/PaymentGateway'
import { PaymentLink } from '@/models/payments/PaymentLink'
import { notifyPermission } from '@/lib/notify'
import { emitPaymentReceived } from '@/modules/automations/folio-events'
import { outstandingFor } from '@/modules/folio/settlement'
import { recordReceipt } from '@/modules/folio/receipts/service'
import { verifyWebhookSignature } from '@/modules/subscription/signatures'
import { gatewayForHook } from './gateway'
import { paidDocEventWrite } from './doc-event'
import { cancelStaleLinks } from './link-service'
import { unappliedAlert } from './link-rules'
import { processPaidLink, type Claim, type PaidDeps, type PaidOutcome } from './process-paid'
import { parsePaymentLinkPaid, type PaidLinkEvent } from './webhook-event'

/**
 * A workspace's Razorpay webhook (/api/webhooks/razorpay/<hookKey>): the URL
 * names the workspace, the signature proves Razorpay sent it with that
 * workspace's secret. Only `payment_link.paid` does anything: a receipt,
 * allocated to the invoice, the link marked paid, then `payment.received`.
 */

/** A claim stuck in "processing" this long was cut off; the next delivery may take it over. */
const STALE_MS = 5 * 60_000

const isDuplicate = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export type WebhookReply = { status: number; body: Record<string, unknown> }

function depsFor(orgId: Types.ObjectId, raw: string): PaidDeps {
  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId)
  return {
    claim: async (e): Promise<Claim> => {
      try {
        await PaymentEvent.create({ orgId, paymentId: e.paymentId, event: 'payment_link.paid', providerLinkId: e.linkId, amountPaise: e.amountPaise, status: 'processing' })
        return 'new'
      } catch (error) {
        if (!isDuplicate(error)) throw error
      }
      const retried = await PaymentEvent.findOneAndUpdate(
        { provider: 'razorpay', paymentId: e.paymentId, orgId, $or: [{ status: 'failed' }, { status: 'processing', updatedAt: { $lt: new Date(Date.now() - STALE_MS) } }] },
        { $set: { status: 'processing' }, $inc: { attempts: 1 } },
      ).lean()
      if (retried) return 'retry'
      const row = await PaymentEvent.findOne({ provider: 'razorpay', orgId, paymentId: e.paymentId }, { status: 1 }).lean()
      return row?.status === 'processing' ? 'busy' : 'done'
    },
    invoiceFor: async (e) => {
      const link = await db(PaymentLink).findOne({ providerLinkId: e.linkId }, { invoiceId: 1 }).lean()
      const invoiceId = link?.invoiceId ?? (Types.ObjectId.isValid(e.notes.invoiceId ?? '') ? new Types.ObjectId(e.notes.invoiceId) : null)
      if (!invoiceId) return null
      const invoice = await db(Invoice).findById(invoiceId, { number: 1, clientId: 1, entityId: 1, status: 1 }).lean()
      if (!invoice) return null
      const o = await outstandingFor({ orgId, db }, invoice._id)
      return { id: String(invoice._id), number: invoice.number ?? null, clientId: String(invoice.clientId), entityId: String(invoice.entityId), status: invoice.status, outstandingPaise: o.outstanding }
    },
    recordReceipt: async (plan) => {
      // Idempotent on its own: a receipt already recorded for this payment (an earlier attempt that died after it) is reused.
      const existing = await db(FolioReceipt).findOne({ mode: 'gateway', reference: plan.reference }, { _id: 1 }).lean()
      if (existing) return { receiptId: String(existing._id) }
      const created = await recordReceipt({ orgId, db }, { ...plan, allocations: [...plan.allocations] })
      return { receiptId: created.id }
    },
    markLinkPaid: async (e) => {
      await db(PaymentLink).updateOne({ providerLinkId: e.linkId }, { $set: { status: 'paid', paidAt: e.paidAt, paymentId: e.paymentId } })
    },
    finish: async (e, outcome) => {
      await PaymentEvent.updateOne(
        { provider: 'razorpay', orgId, paymentId: e.paymentId },
        { $set: { status: outcome.status, note: outcome.note, ...(outcome.receiptId ? { receiptId: new Types.ObjectId(outcome.receiptId) } : {}) } },
      )
      await PaymentGateway.updateOne({ orgId, provider: 'razorpay' }, { $set: { lastEventAt: new Date() } })
      if (outcome.status === 'failed') console.error('[payments] payment_link.paid failed', e.paymentId, outcome.note, raw.length)
    },
    emitPaid: async (invoice, receiptId, e) => {
      // An upsert on the payment id: a retried delivery finds the entry instead of adding a second one (V2-REVIEW P4).
      const write = paidDocEventWrite(orgId, new Types.ObjectId(invoice.id), e)
      await DocEvent.updateOne(write.filter, write.update, write.options)
      const receipt = await db(FolioReceipt).findById(receiptId, { number: 1, receivedOn: 1, allocations: 1 }).lean()
      if (!receipt) return
      await emitPaymentReceived(orgId, {
        receiptId,
        receiptNumber: receipt.number,
        clientId: invoice.clientId,
        receivedOn: receipt.receivedOn,
        allocations: receipt.allocations.map((a) => ({ invoiceId: a.invoiceId, amountPaise: a.amountPaise ?? 0 })),
      })
      // Other links of the invoice (an older amount, or a now-settled invoice) must not take the money twice.
      await cancelStaleLinks({ orgId, db }, [invoice.id])
    },
    alertUnapplied: async (invoice, e, unapplied) => {
      const alert = unappliedAlert({ invoiceNumber: invoice.number ?? null, invoiceStatus: invoice.status, amountPaise: e.amountPaise, unappliedPaise: unapplied })
      await notifyPermission({ orgId }, 'receipts.write', { ...alert, href: `/app/folio/invoices/${invoice.id}`, kind: 'warning', product: 'folio', event: 'folio.payment_unapplied', dedupeKey: `payment-unapplied:${e.paymentId}` })
    },
  }
}

const REPLY: Readonly<Record<PaidOutcome, WebhookReply>> = {
  recorded: { status: 200, body: { ok: true } },
  duplicate: { status: 200, body: { ok: true, duplicate: true } },
  ignored: { status: 200, body: { ok: true, ignored: true } },
  busy: { status: 409, body: { error: 'already processing; retry' } },
  failed: { status: 500, body: { error: 'processing failed; retry' } },
}

export async function handleWorkspaceWebhook(hookKey: string, raw: string, signature: string): Promise<WebhookReply> {
  const gateway = await gatewayForHook(hookKey)
  // Unknown URL and bad signature answer alike, so the endpoint reveals nothing.
  if (!gateway || !verifyWebhookSignature(raw, signature, gateway.webhookSecret)) return { status: 400, body: { error: 'bad signature' } }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return { status: 400, body: { error: 'bad json' } }
  }
  const event: PaidLinkEvent | null = parsePaymentLinkPaid(body)
  if (!event) return { status: 200, body: { ok: true, ignored: true } }
  if (event.notes.orgId && event.notes.orgId !== String(gateway.orgId)) return { status: 200, body: { ok: true, ignored: true } }
  return REPLY[await processPaidLink(depsFor(gateway.orgId, raw), event)]
}
