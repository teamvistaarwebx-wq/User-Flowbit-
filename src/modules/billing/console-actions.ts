'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import type { Selection } from '@/lib/billing'
import { consoleAction, type StaffCtx } from '@/lib/console/session'
import { DOCUMENT_TYPES, IMAGE_TYPES, saveUpload } from '@/lib/files'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { checkbox, isoDate, objectId, paise } from '@/lib/validation'
import { OfflinePayment } from '@/models/billing/OfflinePayment'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { selectionOf } from '@/modules/subscription/selection'
import { cancelDueBill, createDueBill, sendBill } from './bills'
import { issueCreditNote } from './credit-notes'
import { offlineVerifyDeps, recordOfflinePayment } from './offline'
import { rejectOffline, verifyOffline } from './offline-core'
import { CREDIT_REASONS, OFFLINE_MODES, TDS_CERT_LABEL } from './rules'

/**
 * Console billing actions (console spec 11). Every one checks the staff
 * role on the server (consoleAction), computes amounts on the server, and
 * writes a per-staff audit row (StaffAudit + the workspace's log).
 */

const reason = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300)

const refresh = (orgId?: unknown) => {
  revalidatePath('/console/billing')
  if (orgId) revalidatePath(`/console/accounts/${String(orgId)}`)
}

/** Staff have no member id; uploads they make carry none. */
const staffFileCtx = (orgId: Types.ObjectId) => ({ orgId, userId: undefined as unknown as Types.ObjectId })

export const createBill = consoleAction(
  'bill.create',
  z.object({
    orgId: objectId,
    plan: z.enum(['current', 'suite']),
    seats: z.coerce.number().int().min(1).max(100_000).optional(),
    cycle: z.enum(['monthly', 'yearly']),
    dueDays: z.coerce.number().int().min(1).max(60).default(7),
    billType: z.enum(['bill', 'proforma']).default('bill'),
    tdsDeclared: checkbox,
  }),
  async (input, p) => {
    const org = await p.raw(Org).findById(input.orgId, { subscription: 1 }).lean()
    if (!org) return fail('That workspace was not found.')
    let selection: Selection | null
    if (input.plan === 'suite') {
      if (!input.seats) return fail('Enter the number of people.', { seats: 'Required for Suite' })
      selection = { plan: 'suite', seats: input.seats }
    } else selection = selectionOf(org.subscription)
    if (!selection) return fail('This workspace has no paid plan to bill. Choose Suite and the number of people.', { plan: 'Choose Suite' })
    const bill = await createDueBill(p, { orgId: org._id, selection, cycle: input.cycle, dueDays: input.dueDays, billType: input.billType, tdsDeclared: input.tdsDeclared })
    refresh(input.orgId)
    return ok(`${input.billType === 'proforma' ? 'Proforma' : 'Bill'} ${bill.number} sent${bill.linked ? ' with a payment link' : ' (no payment link: Razorpay is not set up)'}.`)
  },
)

export const resendBill = consoleAction('bill.create', z.object({ billId: objectId }), async (input, p) => {
  const bill = await p.raw(SubscriptionInvoice).findOne({ _id: input.billId, status: 'due' }, { orgId: 1, number: 1 }).lean()
  if (!bill) return fail('Only a due bill can be sent again.')
  await sendBill(bill._id, { resend: String(Date.now()) })
  await p.audit({ orgId: bill.orgId, action: 'billing.bill_resent', entity: 'SubscriptionInvoice', entityId: bill._id, summary: `Bill ${bill.number} sent again` })
  refresh(bill.orgId)
  return ok(`Bill ${bill.number} sent again.`)
})

export const cancelBill = consoleAction('invoice.cancel', z.object({ billId: objectId, reason }), async (input, p) => {
  const number = await cancelDueBill(p, new Types.ObjectId(input.billId), input.reason)
  refresh()
  return ok(`Bill ${number} cancelled.`)
})

export const recordOfflineByStaff = consoleAction(
  'payment.record',
  z.object({ billId: objectId, utr: z.string().trim().min(6).max(40), amount: paise, paidOn: isoDate, mode: z.enum(OFFLINE_MODES), tdsDeclared: checkbox, screenshot: z.instanceof(File).optional() }),
  async (input, p) => {
    const bill = await p.raw(SubscriptionInvoice).findOne({ _id: input.billId, status: 'due' }, { orgId: 1 }).lean()
    if (!bill) return fail('That bill is not due any more.')
    const file = await saveUpload(staffFileCtx(bill.orgId), input.screenshot, { kind: 'payment_proof', entity: 'SubscriptionInvoice', entityId: bill._id, accept: [...IMAGE_TYPES, 'application/pdf'] })
    const result = await recordOfflinePayment(bill.orgId, { billId: input.billId, utr: input.utr, amountPaise: input.amount, paidOn: input.paidOn, mode: input.mode, tdsDeclared: input.tdsDeclared }, { staffId: p.staff.id, userId: null, name: p.staff.name }, file?._id)
    if (!result.ok) return fail(result.error, result.field ? { [result.field === 'amount' ? 'amount' : result.field]: result.error } : undefined)
    await p.audit({ orgId: bill.orgId, action: 'billing.offline_recorded', entity: 'OfflinePayment', entityId: result.id, summary: `Recorded ${formatINR(input.amount)} UTR ${input.utr}; awaiting a second person's verification` })
    refresh(bill.orgId)
    return ok(`Recorded. Provisional access until ${formatDate(result.provisionalUntil)}; another Accounts member must verify it.`)
  },
)

/** The workspace and figures of an offline payment, so its audit rows reach the workspace and the account timeline. */
const offlinePaymentOf = (p: StaffCtx, id: string) => p.raw(OfflinePayment).findById(id, { orgId: 1, amountPaise: 1, utr: 1 }).lean()

export const verifyOfflineByStaff = consoleAction('payment.verify', z.object({ paymentId: objectId }), async (input, p) => {
  const result = await verifyOffline(offlineVerifyDeps({ id: p.staff.id, name: p.staff.name }), input.paymentId, String(p.staff.id))
  if (!result.ok) return fail(result.error)
  const payment = await offlinePaymentOf(p, input.paymentId)
  await p.audit({ orgId: payment?.orgId, action: 'billing.offline_verified', entity: 'OfflinePayment', entityId: input.paymentId, summary: `Verified offline payment ${payment ? `${formatINR(payment.amountPaise)} UTR ${payment.utr}` : input.paymentId} against the bank statement: ${result.outcome}` })
  refresh(payment?.orgId)
  const words = { paid: 'Verified: the bill is paid, the tax invoice is issued and the workspace is unlocked.', part: 'Verified as part payment; the bill stays due for the rest.', duplicate: 'Already verified.', flagged: 'Verified, but the bill was not due: see the alert and refund or credit it.' }
  return ok(words[result.outcome])
})

export const rejectOfflineByStaff = consoleAction('payment.verify', z.object({ paymentId: objectId, reason }), async (input, p) => {
  const result = await rejectOffline(offlineVerifyDeps({ id: p.staff.id, name: p.staff.name }), input.paymentId, String(p.staff.id), input.reason)
  if (!result.ok) return fail(result.error)
  const payment = await offlinePaymentOf(p, input.paymentId)
  await p.audit({ orgId: payment?.orgId, action: 'billing.offline_rejected', entity: 'OfflinePayment', entityId: input.paymentId, summary: `Rejected offline payment ${payment ? `${formatINR(payment.amountPaise)} UTR ${payment.utr}` : input.paymentId}`, meta: { reason: input.reason } })
  refresh(payment?.orgId)
  return ok('Rejected; provisional access ended and the customer was told.')
})

export const issueCreditNoteByStaff = consoleAction(
  'credit_note.issue',
  z.object({ invoiceId: objectId, amount: paise, reason: z.enum(CREDIT_REASONS), note: z.string().trim().max(300).optional(), refund: checkbox }),
  async (input, p) => {
    const result = await issueCreditNote(p, { invoiceId: new Types.ObjectId(input.invoiceId), amountPaise: input.amount, reason: input.reason, note: input.note, refund: input.refund })
    refresh()
    if (result.refund === 'failed') return ok(`Credit note ${result.number} issued, but the refund failed: ${result.refundError}. Retry it in Razorpay.`)
    return ok(`Credit note ${result.number} issued${result.refund !== 'none' ? `; refund ${result.refund}` : ''}.`)
  },
)

const CERT_STATUSES = Object.keys(TDS_CERT_LABEL) as [keyof typeof TDS_CERT_LABEL, ...(keyof typeof TDS_CERT_LABEL)[]]

export const updateTds = consoleAction(
  'tds.manage',
  z.object({ invoiceId: objectId, certificateStatus: z.enum(CERT_STATUSES), quarter: z.string().trim().max(20).optional(), note: z.string().trim().max(300).optional(), certificate: z.instanceof(File).optional() }),
  async (input, p) => {
    const invoice = await p.raw(SubscriptionInvoice).findById(input.invoiceId, { orgId: 1, number: 1, 'tds.declared': 1 }).lean()
    if (!invoice?.tds?.declared) return fail('This invoice has no TDS declared.')
    const file = await saveUpload(staffFileCtx(invoice.orgId), input.certificate, { kind: 'tds_certificate', entity: 'SubscriptionInvoice', entityId: invoice._id, accept: DOCUMENT_TYPES })
    if (input.certificateStatus !== 'awaited' && input.certificateStatus !== 'received' && !file && !(await p.raw(SubscriptionInvoice).exists({ _id: invoice._id, 'tds.certificateFileId': { $exists: true } }))) {
      return fail('Upload the TDS certificate before marking it reconciled.', { certificate: 'Upload Form 16A' })
    }
    await p.raw(SubscriptionInvoice).updateOne(
      { _id: invoice._id },
      { $set: { 'tds.certificateStatus': input.certificateStatus, 'tds.quarter': input.quarter, 'tds.note': input.note, 'tds.updatedAt': new Date(), 'tds.updatedBy': p.staff.id, ...(file ? { 'tds.certificateFileId': file._id } : {}) } },
    )
    await p.audit({ orgId: invoice.orgId, action: 'billing.tds_updated', entity: 'SubscriptionInvoice', entityId: invoice._id, summary: `TDS on ${invoice.number}: ${TDS_CERT_LABEL[input.certificateStatus]}${input.quarter ? ` (${input.quarter})` : ''}`, meta: { note: input.note } })
    refresh(invoice.orgId)
    return ok('TDS status saved.')
  },
)
