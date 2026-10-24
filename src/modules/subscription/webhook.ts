import 'server-only'
import { revalidatePath } from 'next/cache'
import type { Types } from 'mongoose'
import { auditAsPlatform } from '@/lib/audit'
import { formatDate } from '@/lib/dates'
import { notify, notifyPermission } from '@/lib/notify'
import type { SystemDb } from '@/lib/platform'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { activateSubscription, renewSubscription, type BillingActor } from './lifecycle'
import { readPendingCheckout } from './pending'
import { cancelRazorpaySubscription } from './razorpay'
import { applyPaidUpgrade } from './upgrade'
import { applyAutopayEvent } from '@/modules/billing/autopay'
import { applyBillPayment, billMoneyFromLink } from '@/modules/billing/bill-payment'
import { billPaymentDeps } from '@/modules/billing/settle'
import { parsePaymentLinkPaid } from '@/modules/payments/webhook-event'
import { rechargeMoneyFromLink } from '@/modules/wallet/recharge-core'
import { applyRechargePayment } from '@/modules/wallet/recharge'
import { Types as MongoTypes } from 'mongoose'

type Entity = { id?: string; current_start?: number; current_end?: number; charge_at?: number; amount?: number; order_id?: string; plan_id?: string }
export type RazorpayEvent = { event: string; payload?: { subscription?: { entity?: Entity }; payment?: { entity?: Entity }; order?: { entity?: Entity } } }

const fromUnix = (s?: number) => (s ? new Date(s * 1000) : undefined)

function systemActor(orgId: Types.ObjectId, db: SystemDb): BillingActor {
  return { orgId, db: db.forOrg(orgId).db, userId: null, audit: (entry) => auditAsPlatform(orgId, { name: 'System' }, entry) }
}

async function notifyEveryone(orgId: Types.ObjectId, title: string, event: string) {
  const members = await Member.find({ orgId, status: 'active' }, { userId: 1 }).lean()
  await notify({ orgId }, { userIds: members.map((m) => m.userId), title, href: '/app/settings/subscription', kind: 'warning', event })
}

/**
 * Applies one verified Razorpay webhook event (platform spec 6.10). The caller
 * has already stored the BillingEvent (duplicates never reach here).
 * Returns the org id it touched, or null when no workspace matched.
 */
/**
 * `order.paid` for a mid-period upgrade order: applies the upgrade server-side
 * when the Checkout handler never ran (tab closed, network lost). A no-op when
 * the handler already applied it (pendingCheckout is gone by then).
 */
async function applyUpgradeOrder(db: SystemDb, orderId: string, paymentId: string | undefined): Promise<Types.ObjectId | null> {
  const org = await db.raw(Org).findOne({ 'subscription.pendingCheckout.orderId': orderId }).lean()
  if (!org) return null
  const pending = readPendingCheckout(org.subscription?.pendingCheckout)
  if (pending?.kind !== 'upgrade' || pending.orderId !== orderId || !paymentId) return org._id
  await applyPaidUpgrade(systemActor(org._id, db), pending, { paymentId, orderId }, org.subscription?.razorpaySubscriptionId)
  revalidatePath('/app', 'layout')
  return org._id
}

/** `payment_link.paid` on a Flowbit due bill (console spec 11): the bill becomes the tax invoice; idempotent per payment id. */
async function applyBillLink(body: unknown): Promise<Types.ObjectId | null> {
  const event = parsePaymentLinkPaid(body)
  const recharge = event ? rechargeMoneyFromLink(event) : null
  if (recharge) {
    // A WhatsApp wallet recharge (modules/wallet): credit + GST invoice, idempotent per payment id.
    await applyRechargePayment(recharge)
    return new MongoTypes.ObjectId(recharge.orgId)
  }
  const money = event ? billMoneyFromLink(event) : null
  if (!event || !money) return null
  const orgHint = MongoTypes.ObjectId.isValid(event.notes.orgId ?? '') ? new MongoTypes.ObjectId(event.notes.orgId) : null
  await applyBillPayment(billPaymentDeps(orgHint), money)
  return orgHint
}

export async function processRazorpayEvent(db: SystemDb, body: RazorpayEvent): Promise<Types.ObjectId | null> {
  const sub = body.payload?.subscription?.entity
  const payment = body.payload?.payment?.entity
  if (body.event === 'payment_link.paid') return applyBillLink(body)
  if (body.event === 'order.paid') {
    const orderId = body.payload?.order?.entity?.id ?? payment?.order_id
    return orderId ? applyUpgradeOrder(db, orderId, payment?.id) : null
  }
  if (!sub?.id) return null
  const org = await db.raw(Org).findOne({ $or: [{ 'subscription.razorpaySubscriptionId': sub.id }, { 'subscription.pendingCheckout.razorpaySubscriptionId': sub.id }, { 'subscription.autopay.subscriptionId': sub.id }] }).lean()
  if (!org) return null
  await applyAutopayEvent(org, body.event, { id: sub.id, chargeAt: fromUnix(sub.charge_at), planId: sub.plan_id })
  const actor = systemActor(org._id, db)
  const pending = readPendingCheckout(org.subscription?.pendingCheckout)
  const now = new Date()
  const set = (fields: Record<string, unknown>) => db.raw(Org).updateOne({ _id: org._id }, { $set: fields })

  switch (body.event) {
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.charged': {
      // A first-year discount is paid up front with the authorisation (an add-on); the plan's own charges start a year later.
      if (body.event === 'subscription.authenticated' && !(pending?.kind === 'subscription' && pending.discountPercent)) break
      if (pending?.kind === 'subscription' && pending.razorpaySubscriptionId === sub.id) {
        if (!payment?.id) break
        await activateSubscription(actor, {
          selection: pending.selection,
          cycle: pending.cycle,
          payment: { provider: 'razorpay', paymentId: payment.id, subscriptionId: sub.id, paidAt: now },
          razorpay: { subscriptionId: sub.id, planId: pending.razorpayPlanId },
          startAt: pending.startAt,
          unitPrices: pending.unitPrices,
          discountPercent: pending.discountPercent,
        })
      } else if (body.event === 'subscription.charged' && payment?.id) {
        await renewSubscription(actor, { payment: { provider: 'razorpay', paymentId: payment.id, subscriptionId: sub.id, paidAt: now }, periodStart: fromUnix(sub.current_start), periodEnd: fromUnix(sub.current_end) })
      }
      break
    }
    case 'subscription.pending': {
      await set({ 'subscription.status': 'past_due', 'subscription.pastDueSince': org.subscription?.pastDueSince ?? now })
      await actor.audit({ action: 'subscription.payment_failed', entity: 'Subscription', entityId: org._id, summary: 'Renewal payment failed; Razorpay will retry' })
      await notifyPermission({ orgId: org._id }, 'billing.manage', { title: 'Payment for Flowbit failed', body: 'Razorpay will retry. Update your payment method to keep editing.', href: '/app/settings/subscription', kind: 'warning', event: 'subscription.payment_failed' })
      break
    }
    case 'subscription.halted': {
      // Failed autopay keeps its 7 days of grace from the first failure (console spec 11); read-only after that.
      await set({ 'subscription.status': 'past_due', 'subscription.pastDueSince': org.subscription?.pastDueSince ?? now })
      await cancelRazorpaySubscription(sub.id, false).catch((error) => console.error('[webhook] cancel after halt failed', error))
      await actor.audit({ action: 'subscription.halted', entity: 'Subscription', entityId: org._id, summary: 'Razorpay stopped retrying; the workspace turns read-only when the 7-day grace ends' })
      await notifyEveryone(org._id, `Payments stopped: pay within 7 days to keep ${org.name} editable`, 'subscription.halted')
      break
    }
    case 'subscription.cancelled': {
      await set({ 'subscription.status': 'canceled', 'subscription.cancelAtPeriodEnd': true, 'subscription.canceledAt': org.subscription?.canceledAt ?? now })
      const end = org.subscription?.currentPeriodEnd
      await actor.audit({ action: 'subscription.canceled', entity: 'Subscription', entityId: org._id, summary: `Razorpay subscription cancelled${end ? `; access until ${formatDate(new Date(end))}` : ''}` })
      break
    }
    case 'subscription.completed': {
      await set({ 'subscription.status': 'expired', 'subscription.endedAt': now })
      await actor.audit({ action: 'subscription.expired', entity: 'Subscription', entityId: org._id, summary: 'Every billing cycle of the Razorpay subscription was used' })
      break
    }
    case 'payment.failed': {
      const period = org.subscription?.currentPeriodEnd ? new Date(org.subscription.currentPeriodEnd).toISOString().slice(0, 10) : 'none'
      await notifyPermission({ orgId: org._id }, 'billing.manage', { title: 'Payment for Flowbit failed', href: '/app/settings/subscription', kind: 'warning', event: 'subscription.payment_failed', dedupeKey: `payment-failed:${period}` })
      break
    }
    default:
      return org._id
  }
  revalidatePath('/app', 'layout')
  return org._id
}
