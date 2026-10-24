import 'server-only'
import type { Types } from 'mongoose'
import { chargesGst, type Selection } from '@/lib/billing'
import type { StaffCtx } from '@/lib/console/session'
import { withTransaction } from '@/lib/db'
import { formatDate, isoDateIST, istInstant } from '@/lib/dates'
import { entitlements } from '@/lib/entitlements'
import { flowbitSupplier } from '@/lib/env'
import { NotFoundError, UserError } from '@/lib/errors'
import { stateByCode2 } from '@/lib/india-states'
import { formatINR } from '@/lib/money'
import type { BillingCycle } from '@/lib/plans'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { hasBillingDetails, invoiceFileName, invoicePdf } from '@/modules/subscription/invoices'
import { selectionLabel } from '@/modules/subscription/selection'
import { billPeriodStart, draftBill, dueDateFrom } from './bill-draft'
import { BILL_LINK_KIND } from './bill-payment'
import { newBillKey } from './bill-token'
import { liveFlowbitRazorpay } from './live'
import { billButtonSuffix, billPdfUrl, billPublicUrl, sendBillingMessage } from './notify'
import { nextBillNumber } from './numbers'
import { billBalancePaise, isDunningExcluded, isSecondDueBill } from './rules'
import { renewsAutomatically } from './autopay-state'
import { planConfig } from '@/modules/console/settings-query'
import { firstYearDiscountFor } from './first-year'

/**
 * Due bills (console spec 11): Sales or Accounts bill a workspace for a plan
 * before it pays. The bill has its own number, a due date and a Razorpay
 * payment link (Flowbit's keys); it goes out by email with the PDF and the
 * public link, and by WhatsApp to opted-in owners and admins. Payment turns
 * it into the GST tax invoice (./settle).
 */

export type CreateBillInput = { orgId: Types.ObjectId; selection: Selection; cycle: BillingCycle; dueDays: number; billType: 'bill' | 'proforma'; tdsDeclared: boolean }

const LINK_GRACE_DAYS = 30
const SECOND_DUE_BILL = 'This workspace already has a due bill. Cancel it first, or wait for it to be paid.'

export async function createDueBill(p: StaffCtx, input: CreateBillInput): Promise<{ id: string; number: string; linked: boolean }> {
  const org = await p.raw(Org).findById(input.orgId).lean()
  if (!org || org.deletedAt) throw new NotFoundError('That workspace')
  const ent = entitlements(org)
  if (!ent.billed || isDunningExcluded(ent.accountType)) throw new UserError('Internal, Test and Comped accounts are not billed.')
  const billing = org.subscription?.billing
  if (!hasBillingDetails(billing)) throw new UserError('This workspace has no billing details yet. The owner adds them in Settings → Plan & billing (name, email, address, state).')
  const customerState = stateByCode2(billing!.address!.stateCode)
  if (!customerState) throw new UserError('The billing state is missing; it decides CGST/SGST or IGST.')
  if (renewsAutomatically(org.subscription)) throw new UserError('Autopay renews this workspace. Cancel autopay first, or the customer pays the same period twice.')
  if (await p.forOrg(org._id).db(SubscriptionInvoice).exists({ status: 'due' })) throw new UserError(SECOND_DUE_BILL)

  const now = new Date()
  const supplier = flowbitSupplier()
  const supplierState = stateByCode2(supplier.stateCode2)
  const sub = org.subscription
  const start = billPeriodStart({ now, currentPeriodEnd: sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null, active: sub?.status === 'active' && sub.plan !== 'trial' })
  const config = await planConfig()
  const unitPrices = config.prices
  const discountPercent = await firstYearDiscountFor(org._id, input.cycle, config.yearlyDiscountPercent)
  const draft = draftBill({ selection: input.selection, cycle: input.cycle, start, supplierState: supplier.stateCode2, supplierGstin: supplier.gstin, customerState: customerState.code2, tdsDeclared: input.tdsDeclared, prices: unitPrices, discountPercent })
  const issueDate = isoDateIST(now)
  const dueDate = dueDateFrom(issueDate, input.dueDays)
  const publicKey = newBillKey()

  const bill = await withTransaction(async (session) => {
    const n = await nextBillNumber(issueDate, session)
    const created = await p.forOrg(org._id).db(SubscriptionInvoice).create(
        {
          number: n.number,
          billNumber: n.number,
          fy: n.fy,
          seq: n.seq,
          seriesKey: n.seriesKey,
          kind: 'subscription',
          status: 'due',
          billType: input.billType,
          issueDate,
          dueDate,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          selection: input.selection,
          cycle: input.cycle,
          unitPrices,
          supplier: { legalName: supplier.legalName, gstin: supplier.gstin ?? undefined, pan: supplier.pan ?? undefined, address: supplier.address, stateCode2: supplierState?.code2, gstStateCode: supplierState?.gstCode, email: supplier.supportEmail },
          customer: { legalName: billing!.legalName!, gstin: billing!.gstin ?? undefined, email: billing!.email!, address: { ...billing!.address }, stateCode2: customerState.code2, gstStateCode: customerState.gstCode },
          placeOfSupply: { gstStateCode: customerState.gstCode, name: customerState.name },
          supplyType: draft.supplyType,
          sac: supplier.sac,
          gstRate: 18,
          lines: draft.lines,
          taxableValuePaise: draft.totals.taxableValuePaise,
          cgstPaise: draft.totals.cgstPaise,
          sgstPaise: draft.totals.sgstPaise,
          igstPaise: draft.totals.igstPaise,
          taxPaise: draft.totals.taxPaise,
          roundOffPaise: draft.totals.roundOffPaise,
          totalPaise: draft.totals.totalPaise,
          tds: { declared: input.tdsDeclared, amountPaise: draft.tdsPaise, ...(input.tdsDeclared ? { certificateStatus: 'awaited' } : {}) },
          publicKey,
          createdByStaff: p.staff.id,
        },
      { session },
    )
    return created.toObject()
  }).catch((error: unknown) => {
    // Two submits at once: the partial unique index lets only one due bill exist (V2-REVIEW M-L5).
    if (isSecondDueBill(error)) throw new UserError(SECOND_DUE_BILL)
    throw error
  })

  const linked = await attachPaymentLink(p, bill._id, { orgId: org._id, number: bill.number, amountPaise: draft.payableNowPaise, dueDate, customer: { name: billing!.legalName ?? undefined, email: billing!.email ?? undefined, contact: billing!.phone ?? undefined } })
  await p.audit({
    orgId: org._id,
    action: 'billing.bill_created',
    entity: 'SubscriptionInvoice',
    entityId: bill._id,
    summary: `${input.billType === 'proforma' ? 'Proforma' : 'Bill'} ${bill.number} for ${selectionLabel(input.selection)}, ${input.cycle}: ${formatINR(bill.totalPaise, { decimals: 2 })} due ${formatDate(dueDate)}${input.tdsDeclared ? ' (TDS declared)' : ''}`,
    meta: { totalPaise: bill.totalPaise, payableNowPaise: draft.payableNowPaise, linked },
  })
  await sendBill(bill._id)
  return { id: String(bill._id), number: bill.number, linked }
}

/** Creates the Razorpay payment link (server-computed amount). False when Razorpay is not configured or refused; the bill still stands. */
async function attachPaymentLink(p: StaffCtx, billId: Types.ObjectId, input: { orgId: Types.ObjectId; number: string; amountPaise: number; dueDate: string; customer: { name?: string; email?: string; contact?: string } }): Promise<boolean> {
  const client = liveFlowbitRazorpay()
  if (!client) return false
  try {
    const expireBy = Math.floor(istInstant(input.dueDate, '23:59').getTime() / 1000) + LINK_GRACE_DAYS * 86_400
    const link = await client.createPaymentLink({ amountPaise: input.amountPaise, referenceId: input.number, description: `Flowbit bill ${input.number}`, customer: input.customer, notes: { kind: BILL_LINK_KIND, billId: String(billId), orgId: String(input.orgId) }, expireBy })
    await p.forOrg(input.orgId).db(SubscriptionInvoice).updateOne({ _id: billId }, { $set: { paymentLink: { id: link.id, shortUrl: link.shortUrl, status: link.status, amountPaise: input.amountPaise, createdAt: new Date() } } })
    return true
  } catch (error) {
    console.error('[billing] payment link failed', input.number, error)
    return false
  }
}

/** Emails the bill (PDF + public link + Pay button) and sends it on WhatsApp. `resend` makes a new dedupe key. */
export async function sendBill(billId: Types.ObjectId, opts: { resend?: string } = {}): Promise<void> {
  const bill = await SubscriptionInvoice.findOne({ _id: billId, status: 'due' }).lean()
  if (!bill?.publicKey) return
  const pdf = await invoicePdf(bill)
  const amount = formatINR(billBalancePaise(bill), { decimals: 2 })
  const label = bill.billType === 'proforma' ? 'proforma invoice' : 'bill'
  await sendBillingMessage({
    orgId: bill.orgId,
    event: 'subscription.bill_due',
    dedupeKey: `bill:${String(bill._id)}:sent${opts.resend ? `:${opts.resend}` : ''}`,
    subject: `Flowbit ${label} ${bill.number}: ${amount} due ${formatDate(bill.dueDate!)}`,
    title: `Your Flowbit ${label} ${bill.number}`,
    paragraphs: [
      `${amount} is due on ${formatDate(bill.dueDate!)} for ${formatDate(bill.periodStart)} to ${formatDate(bill.periodEnd)}.`,
      bill.tds?.declared ? `You told us you deduct TDS, so the payment link asks for ${amount} (the total less 2%). Please send the TDS certificate once it is filed.` : 'Pay online with UPI, card or net banking, or by bank transfer and share the UTR from Settings → Plan & billing.',
      chargesGst(bill.supplyType) ? 'The GST tax invoice is issued as soon as the payment arrives. The bill is attached.' : 'The invoice is issued as soon as the payment arrives (no GST: Flowbit is not GST-registered yet). The bill is attached.',
    ],
    cta: { label: 'View and pay', href: billPublicUrl(bill.publicKey) },
    attachments: [{ filename: invoiceFileName(bill.number), content: pdf, mime: 'application/pdf' }],
    entity: 'SubscriptionInvoice',
    entityId: bill._id,
    // First send: the bill with its PDF; "send again": the shorter payment-link template.
    whatsapp: opts.resend
      ? { key: 'payment_link', values: { number: bill.number, amount }, extras: { buttonValue: billButtonSuffix(bill.publicKey) } }
      : { key: 'bill_with_pdf', values: { number: bill.number, amount, dueDate: formatDate(bill.dueDate!) }, extras: { headerUrl: billPdfUrl(bill.publicKey), fileName: invoiceFileName(bill.number), buttonValue: billButtonSuffix(bill.publicKey) } },
  })
}

/** Cancels a due bill (and its payment link). Paid invoices are cancelled with the existing invoice action. */
export async function cancelDueBill(p: StaffCtx, billId: Types.ObjectId, reason: string): Promise<string> {
  const bill = await p.raw(SubscriptionInvoice).findOneAndUpdate({ _id: billId, status: 'due' }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, cancelledBy: p.staff.id, 'paymentLink.status': 'cancelled' } }, { returnDocument: 'after' }).lean()
  if (!bill) throw new UserError('Only a due bill can be cancelled here.')
  const client = liveFlowbitRazorpay()
  if (client && bill.paymentLink?.id) await client.cancelPaymentLink(bill.paymentLink.id).catch((error) => console.error('[billing] link cancel failed', bill.number, error))
  await p.audit({ orgId: bill.orgId, action: 'billing.bill_cancelled', entity: 'SubscriptionInvoice', entityId: bill._id, summary: `Bill ${bill.number} cancelled`, meta: { reason } })
  return bill.number
}
