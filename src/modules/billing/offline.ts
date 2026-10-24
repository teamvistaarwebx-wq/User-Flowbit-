import 'server-only'
import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { auditAsPlatform } from '@/lib/audit'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { OfflinePayment } from '@/models/billing/OfflinePayment'
import { StaffAlert } from '@/models/console/StaffAlert'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { applyBillPayment } from './bill-payment'
import { applyOrFlag, expiredProvisional, recordOffline, type OfflineInput, type OfflineRow, type RecordResult, type VerifyDeps } from './offline-core'
import { billPaymentDeps } from './settle'
import { OFFLINE_MODE_LABEL, type OfflineMode, type OfflineStatus } from './rules'

/**
 * Offline payments, database side (rules in ./offline-core): record with 7
 * days of provisional access (Org.subscription.provisionalUntil, read by
 * `entitlements()`), verify by a second staff member (the bill then becomes
 * the tax invoice and the plan applies), reject, and expire.
 */

const isDuplicate = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export type RecordedBy = { staffId: Types.ObjectId | null; userId: Types.ObjectId | null; name: string }

export async function recordOfflinePayment(orgId: Types.ObjectId, input: Omit<OfflineInput, 'recordedByStaffId' | 'recordedByName'>, by: RecordedBy, screenshotFileId?: Types.ObjectId | null): Promise<RecordResult> {
  const now = new Date()
  const full: OfflineInput = { ...input, recordedByStaffId: by.staffId ? String(by.staffId) : null, recordedByName: by.name, screenshotFileId: screenshotFileId ? String(screenshotFileId) : null }
  try {
    const result = await recordOffline(
      {
        utrTaken: async (utr) => Boolean(await OfflinePayment.exists({ utrKey: utr })),
        customerSubmittedBefore: async (billId) => Types.ObjectId.isValid(billId) && Boolean(await OfflinePayment.exists({ orgId, invoiceId: new Types.ObjectId(billId), source: 'customer' })),
        billIsDue: async (billId) => Types.ObjectId.isValid(billId) && Boolean(await SubscriptionInvoice.exists({ _id: billId, orgId, status: 'due' })),
        create: async (row) => {
          const doc = await OfflinePayment.create({
            orgId,
            invoiceId: new Types.ObjectId(row.billId),
            utr: row.utr,
            utrKey: row.utr,
            amountPaise: row.amountPaise,
            paidOn: row.paidOn,
            mode: row.mode,
            tdsDeclared: row.tdsDeclared,
            screenshotFileId: screenshotFileId ?? undefined,
            source: by.staffId ? 'staff' : 'customer',
            recordedByStaffId: by.staffId ?? undefined,
            recordedByUserId: by.userId ?? undefined,
            recordedByName: by.name,
            provisionalUntil: row.provisionalUntil,
          })
          return String(doc._id)
        },
        grantProvisional: async (paymentId, until) => {
          await Org.updateOne({ _id: orgId }, { $set: { 'subscription.provisionalUntil': until, 'subscription.provisionalPaymentId': new Types.ObjectId(paymentId) } })
        },
        declareTds: async (billId) => {
          await SubscriptionInvoice.updateOne({ _id: billId, orgId, status: 'due' }, { $set: { 'tds.declared': true, 'tds.certificateStatus': 'awaited' } })
        },
      },
      full,
      now,
    )
    if (result.ok) {
      const bill = await SubscriptionInvoice.findById(input.billId, { number: 1 }).lean()
      const what = `${formatINR(input.amountPaise)} by ${OFFLINE_MODE_LABEL[input.mode as OfflineMode]} (UTR ${input.utr.trim()}) for bill ${bill?.number ?? ''}`
      // Staff actions write their own per-staff audit row; a customer's submission is logged here.
      if (!by.staffId) await auditAsPlatform(orgId, { name: by.name }, { action: 'billing.offline_submitted', entity: 'OfflinePayment', entityId: result.id, summary: `Offline payment submitted: ${what}${result.provisional ? `; provisional access until ${formatDate(result.provisionalUntil)}` : '; no provisional access (already given once for this bill)'}` })
      await StaffAlert.updateOne({ dedupeKey: `offline_submitted:${result.id}` }, { $setOnInsert: { orgId, staffId: null, kind: 'offline_submitted', title: `Verify ${what} against the bank statement by ${formatDate(result.provisionalUntil)}`, dedupeKey: `offline_submitted:${result.id}` } }, { upsert: true })
      revalidatePath('/app', 'layout')
    }
    return result
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, error: 'This UTR was already recorded. Each bank transfer can be recorded once.', field: 'utr' }
    throw error
  }
}

const toRow = (doc: { _id: unknown; invoiceId: unknown; status: string; recordedByStaffId?: unknown; provisionalUntil: Date; amountPaise: number; utr: string; paidOn: string; mode: string }): OfflineRow => ({
  id: String(doc._id),
  billId: String(doc.invoiceId),
  status: doc.status as OfflineStatus,
  recordedByStaffId: doc.recordedByStaffId ? String(doc.recordedByStaffId) : null,
  provisionalUntil: new Date(doc.provisionalUntil),
  amountPaise: doc.amountPaise,
  utr: doc.utr,
  paidOn: doc.paidOn,
  mode: doc.mode,
})

/** Ends provisional access when it was granted by this payment. */
async function endProvisional(row: OfflineRow) {
  const payment = await OfflinePayment.findById(row.id, { orgId: 1 }).lean()
  if (!payment) return
  await Org.updateOne({ _id: payment.orgId, 'subscription.provisionalPaymentId': new Types.ObjectId(row.id) }, { $unset: { 'subscription.provisionalUntil': 1, 'subscription.provisionalPaymentId': 1 } })
  revalidatePath('/app', 'layout')
}

/** Storage for verify / reject. `verifier` names the staff member in the row. */
export function offlineVerifyDeps(verifier: { id: Types.ObjectId; name: string }): VerifyDeps {
  return {
    load: async (id) => {
      if (!Types.ObjectId.isValid(id)) return null
      const doc = await OfflinePayment.findById(id).lean()
      return doc ? toRow(doc) : null
    },
    apply: async (row) => {
      const claimed = await OfflinePayment.findOneAndUpdate({ _id: row.id, status: { $in: ['pending', 'expired'] } }, { $set: { status: 'verified', verifiedBy: verifier.id, verifiedByName: verifier.name, verifiedAt: new Date() } }, { returnDocument: 'after' }).lean()
      if (!claimed) return 'duplicate'
      const money = { paymentId: `utr:${row.utr}`, provider: 'offline' as const, amountPaise: row.amountPaise, paidAt: new Date(`${row.paidOn}T12:00:00+05:30`), billId: row.billId, utr: row.utr, mode: row.mode, offlinePaymentId: row.id }
      const { outcome, note } = await applyOrFlag(
        () => applyBillPayment(billPaymentDeps(claimed.orgId), money),
        async (reason) => {
          console.error('[billing] verified offline payment not applied', row.id, reason)
          await StaffAlert.updateOne({ dedupeKey: `payment_flagged:offline:${row.id}` }, { $setOnInsert: { orgId: claimed.orgId, staffId: null, kind: 'payment_flagged', title: `${formatINR(row.amountPaise)} (UTR ${row.utr}): ${reason}`, dedupeKey: `payment_flagged:offline:${row.id}` } }, { upsert: true })
        },
      )
      await OfflinePayment.updateOne({ _id: row.id }, { $set: { outcome, ...(note ? { flagNote: note } : {}) } })
      // Settling clears provisional access itself; a part payment keeps it only until its 7 days end.
      return outcome
    },
    reject: async (row, _staffId, reason) => {
      // Only a payment still waiting: a concurrent verify must not be flipped to rejected (V2-REVIEW M-L2).
      const res = await OfflinePayment.updateOne({ _id: row.id, status: { $in: ['pending', 'expired'] } }, { $set: { status: 'rejected', rejectedReason: reason, verifiedBy: verifier.id, verifiedByName: verifier.name, verifiedAt: new Date() }, $unset: { utrKey: 1 } })
      if (!res.modifiedCount) return false
      const payment = await OfflinePayment.findById(row.id, { orgId: 1 }).lean()
      if (payment) await notifyPermission({ orgId: payment.orgId }, 'billing.manage', { title: `Payment UTR ${row.utr} could not be matched`, body: reason, href: '/app/settings/subscription?tab=bills', kind: 'warning', event: 'subscription.payment_rejected', includeSelf: true })
      return true
    },
    endProvisional,
  }
}

/** Daily: pending payments past 7 days lose provisional access (they can still be verified later). */
export async function expireProvisionalPayments(now: Date = new Date()): Promise<number> {
  const pending = await OfflinePayment.find({ status: 'pending', provisionalUntil: { $lte: now } }).lean()
  const due = expiredProvisional(pending.map((p) => ({ ...toRow(p), orgId: p.orgId })), now)
  for (const row of due) {
    await OfflinePayment.updateOne({ _id: row.id, status: 'pending' }, { $set: { status: 'expired' } })
    await endProvisional(row)
    await auditAsPlatform(row.orgId, { name: 'System' }, { action: 'billing.offline_expired', entity: 'OfflinePayment', entityId: row.id, summary: `Offline payment UTR ${row.utr} was not verified within 7 days; provisional access ended` })
  }
  return due.length
}
