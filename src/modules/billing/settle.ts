import 'server-only'
import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { addPeriod, chargesGst, type Selection } from '@/lib/billing'
import { auditAsPlatform } from '@/lib/audit'
import { listValueOf } from '@/lib/first-year-discount'
import { withTransaction } from '@/lib/db'
import { formatDate, isoDateIST, istInstant, todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { lockedPrices } from '@/lib/plan-config'
import type { BillingCycle } from '@/lib/plans'
import { StaffAlert } from '@/models/console/StaffAlert'
import { Org } from '@/models/Org'
import { BillingEvent } from '@/models/subscription/BillingEvent'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { invoiceFileName, invoicePdf } from '@/modules/subscription/invoices'
import { addedProducts, selectionLabel, shapeOf, type StoredProducts } from '@/modules/subscription/selection'
import type { BillMoney, BillPaymentDeps, PayableBill } from './bill-payment'
import { billPdfUrl, sendBillingMessage } from './notify'
import { nextTaxNumber } from './numbers'
import type { Settlement } from './rules'
import { billBalancePaise, overpaidBy, taxInvoiceInstant } from './rules'
import { liveFlowbitRazorpay } from './live'
import { relinkBalance, type RelinkBill } from './relink'

/**
 * The database side of `applyBillPayment`: a settled bill becomes the GST
 * tax invoice (tax number, payment date) and the plan it bills is applied to
 * the workspace in the same transaction, so `entitlements()` unlocks it at
 * once; then the receipt goes out by email and WhatsApp.
 */

const asId = (id: string) => new Types.ObjectId(id)

async function loadBill(billId: string): Promise<PayableBill | null> {
  if (!Types.ObjectId.isValid(billId)) return null
  const bill = await SubscriptionInvoice.findById(billId, { status: 1, totalPaise: 1, receivedPaise: 1, tds: 1 }).lean()
  if (!bill) return null
  return { id: String(bill._id), status: bill.status as PayableBill['status'], totalPaise: bill.totalPaise, receivedPaise: bill.receivedPaise ?? 0, tdsDeclared: Boolean(bill.tds?.declared) }
}

async function alreadyApplied(paymentId: string): Promise<boolean> {
  return Boolean((await SubscriptionInvoice.exists({ 'receipts.paymentId': paymentId })) ?? (await SubscriptionInvoice.exists({ 'payment.paymentId': paymentId })))
}

const receiptOf = (money: BillMoney) => ({ paymentId: money.paymentId, provider: money.provider, amountPaise: money.amountPaise, at: money.paidAt, utr: money.utr })

async function alertAccounts(orgId: Types.ObjectId | null, kind: 'payment_flagged' | 'payment_part', title: string, key: string) {
  if (!orgId) {
    console.error('[billing] payment for no workspace:', title)
    return
  }
  await StaffAlert.updateOne({ dedupeKey: `${kind}:${key}` }, { $setOnInsert: { orgId, staffId: null, kind, title, dedupeKey: `${kind}:${key}` } }, { upsert: true })
}

/** The plan a paid bill buys, as Org fields (the same shape a checkout stores). */
function planSet(org: { enabledProducts?: string[] | null; subscription?: { products?: unknown; accountType?: string | null } | null }, selection: Selection, cycle: BillingCycle, taxablePaise: number, start: Date, unitPrices: unknown) {
  const shape = shapeOf(selection)
  const list = org.enabledProducts ?? []
  const enabled = list.length ? [...new Set([...list, ...addedProducts((org.subscription?.products ?? null) as StoredProducts | null, shape.products)])] : undefined
  const keepType = ['internal', 'test', 'comped'].includes(org.subscription?.accountType ?? '')
  return {
    'subscription.status': 'active',
    'subscription.plan': shape.plan,
    'subscription.products': shape.products,
    'subscription.quantities': shape.quantities,
    'subscription.seats': shape.seats,
    'subscription.cycle': cycle,
    'subscription.amountPaise': taxablePaise,
    'subscription.unitPrices': lockedPrices(unitPrices),
    'subscription.currentPeriodStart': start,
    'subscription.currentPeriodEnd': addPeriod(start, cycle),
    'subscription.cancelAtPeriodEnd': false,
    ...(keepType ? {} : { 'subscription.accountType': 'paid' }),
    ...(enabled ? { enabledProducts: enabled } : {}),
  }
}

async function settle(bill: PayableBill, money: BillMoney, settlement: Settlement): Promise<string> {
  const issueDate = isoDateIST(taxInvoiceInstant(money, new Date()))
  const result = await withTransaction(async (session) => {
    const doc = await SubscriptionInvoice.findOne({ _id: asId(bill.id), status: 'due' }).session(session).lean()
    if (!doc) throw new UserError('This bill is no longer due.')
    const org = await Org.findById(doc.orgId).session(session).lean()
    if (!org) throw new UserError('The workspace of this bill is gone.')
    const n = await nextTaxNumber(issueDate, session)
    const cycle = (doc.cycle ?? 'monthly') as BillingCycle
    await Org.updateOne(
      { _id: org._id },
      {
        // The plan keeps its list (renewal) amount; a first-year discount applies to this bill only.
        $set: planSet(org, doc.selection as Selection, cycle, doc.lines?.length ? listValueOf(doc.lines) : doc.taxableValuePaise, istInstant(doc.periodStart), doc.unitPrices),
        $unset: { 'subscription.pastDueSince': 1, 'subscription.endedAt': 1, 'subscription.canceledAt': 1, 'subscription.pendingChange': 1, 'subscription.provisionalUntil': 1, 'subscription.provisionalPaymentId': 1 },
      },
      { session },
    )
    await SubscriptionInvoice.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: 'paid',
          number: n.number,
          fy: n.fy,
          seq: n.seq,
          seriesKey: n.seriesKey,
          issueDate,
          receivedPaise: (doc.receivedPaise ?? 0) + money.amountPaise,
          payment: { provider: money.provider, paymentId: money.paymentId, paidAt: money.paidAt, utr: money.utr, mode: money.mode, ...(money.offlinePaymentId ? { offlinePaymentId: asId(money.offlinePaymentId) } : {}) },
          'paymentLink.status': money.provider === 'razorpay' ? 'paid' : (doc.paymentLink?.status ?? undefined),
          ...(settlement.status === 'paid_with_tds' ? { 'tds.amountPaise': settlement.tdsPaise, 'tds.certificateStatus': doc.tds?.certificateStatus ?? 'awaited' } : {}),
        },
        $push: { receipts: receiptOf(money) },
      },
      { session },
    )
    await BillingEvent.create([{ provider: 'razorpay', eventId: `bill-paid:${money.paymentId}`, type: 'bill.paid', orgId: org._id, payload: { billId: bill.id, amountPaise: money.amountPaise, provider: money.provider }, receivedAt: new Date(), processedAt: new Date() }], { session })
    return { orgId: org._id, number: n.number, billNumber: doc.number, selection: doc.selection as Selection, cycle, excess: overpaidBy(doc.totalPaise, doc.receivedPaise ?? 0, money.amountPaise) }
  })
  await auditAsPlatform(result.orgId, { name: 'System' }, {
    action: 'billing.bill_paid',
    entity: 'SubscriptionInvoice',
    entityId: bill.id,
    summary: `Bill ${result.billNumber} paid (${money.provider === 'razorpay' ? 'Razorpay' : `${money.mode ?? 'bank'} UTR ${money.utr}`}): tax invoice ${result.number}, ${selectionLabel(result.selection)} ${result.cycle} active${settlement.status === 'paid_with_tds' ? `, TDS ${formatINR(settlement.tdsPaise)}` : ''}`,
    meta: { paymentId: money.paymentId, amountPaise: money.amountPaise },
  })
  if (result.excess > 0) await alertAccounts(result.orgId, 'payment_flagged', `Bill ${result.billNumber} was overpaid by ${formatINR(result.excess)} (${money.paymentId}). Refund or credit it.`, `overpaid:${money.paymentId}`)
  await afterSettle(result.orgId, bill.id).catch((error) => console.error('[billing] receipt not sent', result.number, error))
  revalidatePath('/app', 'layout')
  return result.number
}

/** The tax invoice by email (PDF) and WhatsApp, and the bell for billing managers. */
async function afterSettle(orgId: Types.ObjectId, billId: string) {
  const invoice = await SubscriptionInvoice.findById(billId).lean()
  if (!invoice) return
  const amount = formatINR(invoice.receivedPaise ?? invoice.totalPaise, { decimals: 2 })
  await sendBillingMessage({
    orgId,
    event: 'subscription.payment_received',
    dedupeKey: `bill:${billId}:paid`,
    subject: `Payment received: Flowbit invoice ${invoice.number}`,
    title: `Thanks, we received ${amount}`,
    paragraphs: [`Your ${chargesGst(invoice.supplyType) ? 'GST tax invoice' : 'invoice'} ${invoice.number} for ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)} is attached.`, 'Your plan is active. Invoices are always in Settings → Plan & billing.'],
    cta: { label: 'Open billing', href: '/app/settings/subscription?tab=bills' },
    attachments: [{ filename: invoiceFileName(invoice.number), content: await invoicePdf(invoice), mime: 'application/pdf' }],
    entity: 'SubscriptionInvoice',
    entityId: invoice._id,
    whatsapp: invoice.publicKey ? { key: 'payment_received', values: { amount, number: invoice.number }, extras: { headerUrl: billPdfUrl(invoice.publicKey), fileName: invoiceFileName(invoice.number) } } : undefined,
  })
  await SubscriptionInvoice.updateOne({ _id: invoice._id }, { $set: { emailedAt: new Date() } })
  await notifyPermission({ orgId }, 'billing.manage', { title: `Payment received: invoice ${invoice.number}`, href: '/app/settings/subscription?tab=bills', kind: 'success', event: 'subscription.payment_received', dedupeKey: `bill-paid:${billId}`, includeSelf: true })
}

/** Days a bill's payment link stays payable after the due date (as when the bill was created). */
const LINK_GRACE_DAYS = 30

/** The bill's Razorpay link now asks for the balance, not the full amount (V2-REVIEW M-M3). */
async function relinkAfterPart(bill: RelinkBill, orgId: Types.ObjectId): Promise<void> {
  const client = liveFlowbitRazorpay()
  if (!client || !bill.link?.id) return
  const outcome = await relinkBalance(
    {
      createLink: (input) => client.createPaymentLink(input),
      cancelLink: (id) => client.cancelPaymentLink(id),
      save: async (billId, link, count) => {
        await SubscriptionInvoice.updateOne({ _id: asId(billId), status: 'due' }, { $set: { paymentLink: { id: link.id, shortUrl: link.shortUrl, status: link.status, amountPaise: link.amountPaise, createdAt: new Date() }, paymentLinkCount: count } })
      },
      expireBy: (dueDate) => Math.floor(istInstant(dueDate, '23:59').getTime() / 1000) + LINK_GRACE_DAYS * 86_400,
    },
    bill,
  )
  if (outcome === 'relinked') await alertAccounts(orgId, 'payment_part', `Bill ${bill.number}: the payment link now asks for the balance, ${formatINR(billBalancePaise(bill), { decimals: 2 })}.`, `relink:${bill.id}:${bill.linkCount + 1}`)
}

/** The storage behind `applyBillPayment`. `orgHint` names the workspace for alerts when the bill cannot be found. */
export function billPaymentDeps(orgHint: Types.ObjectId | null = null): BillPaymentDeps {
  return {
    alreadyApplied,
    loadBill,
    async recordPart(bill, money) {
      const doc = await SubscriptionInvoice.findOneAndUpdate({ _id: asId(bill.id), status: 'due' }, { $inc: { receivedPaise: money.amountPaise }, $push: { receipts: receiptOf(money) } }, { returnDocument: 'after' }).lean()
      if (!doc) return
      await alertAccounts(doc.orgId, 'payment_part', `Part payment of ${formatINR(money.amountPaise)} on bill ${doc.number}: ${formatINR(billBalancePaise(doc))} still due`, money.paymentId)
      if (!doc.paymentLink?.id || !doc.dueDate) return
      const relink: RelinkBill = {
        id: String(doc._id),
        orgId: String(doc.orgId),
        number: doc.number,
        dueDate: doc.dueDate,
        totalPaise: doc.totalPaise,
        taxableValuePaise: doc.taxableValuePaise,
        receivedPaise: doc.receivedPaise,
        tds: doc.tds,
        link: { id: doc.paymentLink.id, status: doc.paymentLink.status, amountPaise: doc.paymentLink.amountPaise },
        linkCount: doc.paymentLinkCount ?? 1,
        customer: { name: doc.customer?.legalName ?? undefined, email: doc.customer?.email ?? undefined },
      }
      await relinkAfterPart(relink, doc.orgId)
    },
    settle,
    async flag(money, reason) {
      const bill = Types.ObjectId.isValid(money.billId) ? await SubscriptionInvoice.findById(money.billId, { orgId: 1, number: 1 }).lean() : null
      await alertAccounts(bill?.orgId ?? orgHint, 'payment_flagged', `${formatINR(money.amountPaise)} received (${money.paymentId}) on ${todayIST()}: ${reason}${bill ? ` Bill ${bill.number}.` : ''} Refund or credit it.`, money.paymentId)
    },
  }
}
