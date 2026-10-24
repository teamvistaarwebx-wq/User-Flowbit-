import 'server-only'
import type { ClientSession, Types } from 'mongoose'
import { subscriptionInvoiceTotals, supplyTypeFor } from '@/lib/billing'
import { formatDate, isoDateIST } from '@/lib/dates'
import { flowbitSupplier } from '@/lib/env'
import { stateByCode2 } from '@/lib/india-states'
import { emailLayout, sendMail } from '@/lib/mail'
import { formatINR } from '@/lib/money'
import { renderPdf } from '@/lib/pdf/base'
import { nextTaxNumber } from '@/modules/billing/numbers'
import { UserError } from '@/lib/errors'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import type { InvoiceLine } from './selection'
import { InvoicePdf, type InvoiceForPdf } from './invoice-pdf'
import type { OrgDb } from './usage'

export type BillingDetails = {
  legalName?: string | null
  gstin?: string | null
  email?: string | null
  phone?: string | null
  address?: { line1?: string | null; line2?: string | null; city?: string | null; stateCode?: string | null; pincode?: string | null } | null
}

export type PaymentInfo = { provider: 'razorpay' | 'simulated' | 'manual' | 'offline'; paymentId?: string; subscriptionId?: string; orderId?: string; paidAt: Date; utr?: string; mode?: string }

/** True when the billing details are complete enough to invoice. */
export const hasBillingDetails = (b: BillingDetails | null | undefined) =>
  Boolean(b?.legalName && b.email && b.address?.line1 && b.address.city && b.address.stateCode && b.address.pincode)

/**
 * Issues Flowbit's GST invoice for a payment (platform spec 6.12). Call it
 * inside the activation/renewal transaction so a rollback never burns a number:
 * the FB/{FY}/NNNN series is one counter per supplier GSTIN across every
 * workspace (modules/billing/series).
 */
export async function issueInvoice(
  target: OrgDb,
  input: { billing: BillingDetails | null | undefined; kind: 'subscription' | 'upgrade' | 'wallet_recharge'; lines: InvoiceLine[]; periodStart: string; periodEnd: string; payment: PaymentInfo; session?: ClientSession; sac?: string; cycle?: 'monthly' | 'yearly' },
) {
  const billing = input.billing
  if (!hasBillingDetails(billing)) throw new UserError('Add your billing details before paying.')
  const supplier = flowbitSupplier()
  const customerState = stateByCode2(billing!.address!.stateCode)
  if (!customerState) throw new UserError('Choose the billing state. Flowbit bills Indian businesses only for now.')
  const supplierState = stateByCode2(supplier.stateCode2)
  const supplyType = supplyTypeFor(supplier, customerState.code2)
  const totals = subscriptionInvoiceTotals(input.lines, supplyType)
  const issueDate = isoDateIST(input.payment.paidAt)
  const issued = await nextTaxNumber(issueDate, input.session)
  const doc = {
    number: issued.number,
    fy: issued.fy,
    seq: issued.seq,
    seriesKey: issued.seriesKey,
    kind: input.kind,
    status: 'paid' as const,
    issueDate,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    // Plan invoices keep their cycle: the first-year discount looks for an earlier paid yearly one.
    ...(input.cycle ? { cycle: input.cycle } : {}),
    supplier: {
      legalName: supplier.legalName,
      gstin: supplier.gstin ?? undefined,
      pan: supplier.pan ?? undefined,
      address: supplier.address,
      stateCode2: supplierState?.code2,
      gstStateCode: supplierState?.gstCode,
      email: supplier.supportEmail,
    },
    customer: {
      legalName: billing!.legalName!,
      gstin: billing!.gstin ?? undefined,
      email: billing!.email!,
      address: { ...billing!.address },
      stateCode2: customerState.code2,
      gstStateCode: customerState.gstCode,
    },
    placeOfSupply: { gstStateCode: customerState.gstCode, name: customerState.name },
    supplyType,
    sac: input.sac ?? supplier.sac,
    gstRate: 18,
    lines: input.lines,
    taxableValuePaise: totals.taxableValuePaise,
    cgstPaise: totals.cgstPaise,
    sgstPaise: totals.sgstPaise,
    igstPaise: totals.igstPaise,
    taxPaise: totals.taxPaise,
    roundOffPaise: totals.roundOffPaise,
    totalPaise: totals.totalPaise,
    payment: input.payment,
    isTest: input.payment.provider === 'simulated',
  }
  const created = await target.db(SubscriptionInvoice).create(doc, { session: input.session })
  return created.toObject()
}

export type IssuedInvoice = Awaited<ReturnType<typeof issueInvoice>>

/** The invoice PDF from its frozen snapshot. */
export async function invoicePdf(invoice: InvoiceForPdf): Promise<Buffer> {
  return renderPdf(InvoicePdf({ invoice }))
}

export const invoiceFileName = (number: string) => `Flowbit-${number.replace(/\//g, '-')}.pdf`

/** Emails the invoice PDF to the billing email (Outbox kind subscription_invoice). */
export async function emailInvoice(orgId: Types.ObjectId, invoice: InvoiceForPdf & { _id: unknown; customer?: { email?: string | null } | null }, to?: string | null): Promise<string | null> {
  const recipient = to ?? invoice.customer?.email
  if (!recipient) return null
  const pdf = await invoicePdf(invoice)
  const mail = emailLayout({
    title: `Flowbit invoice ${invoice.number}`,
    paragraphs: [
      `Thanks for your payment of ${formatINR(invoice.totalPaise, { decimals: 2 })} for ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}.`,
      'Your GST invoice is attached. You can download it again from Settings → Plan & billing.',
    ],
    cta: { label: 'Open billing history', href: '/app/settings/subscription' },
  })
  await sendMail({
    to: recipient,
    subject: `Flowbit invoice ${invoice.number}`,
    ...mail,
    attachments: [{ filename: invoiceFileName(invoice.number), content: pdf, mime: 'application/pdf' }],
    orgId,
    kind: 'subscription_invoice',
    entity: 'SubscriptionInvoice',
    entityId: invoice._id,
  })
  await SubscriptionInvoice.updateOne({ _id: invoice._id, orgId }, { $set: { emailedAt: new Date() } })
  return recipient
}
