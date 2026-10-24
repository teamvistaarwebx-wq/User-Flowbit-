import 'server-only'
import type { Types } from 'mongoose'
import { quoteSelection, subscriptionInvoiceTotals, supplyTypeFor } from '@/lib/billing'
import { flowbitSupplier } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { lockedPrices } from '@/lib/plan-config'
import type { BillingCycle } from '@/lib/plans'
import { Org } from '@/models/Org'
import { invoiceLines, selectionLabel, selectionOf } from '@/modules/subscription/selection'
import { autopayCovers, nextAutopay, type AutopayStatus } from './autopay-state'
import { liveFlowbitRazorpay } from './live'

/**
 * Autopay (console spec 11): Razorpay Subscriptions with UPI Autopay or an
 * e-mandate, set up from a link after a plan is active (a paid due bill or
 * an offline payment). The first debit is at the next renewal; Flowbit sends
 * the pre-debit notice 24 hours ahead (./dunning). Webhook events move the
 * state machine in ./autopay-state.
 */

type OrgForAutopay = { _id: Types.ObjectId; subscription?: { autopay?: { status?: string | null; subscriptionId?: string | null } | null } | null }

/** Applies one Razorpay subscription event to the autopay state, when it is this workspace's autopay subscription. */
export async function applyAutopayEvent(org: OrgForAutopay, event: string, sub: { id: string; chargeAt?: Date; planId?: string }): Promise<AutopayStatus | null> {
  const current = org.subscription?.autopay
  if (!current?.subscriptionId || current.subscriptionId !== sub.id) return null
  const step = nextAutopay(current.status as AutopayStatus | null, event)
  if (!step) return null
  const now = new Date()
  await Org.updateOne(
    { _id: org._id, 'subscription.autopay.subscriptionId': sub.id },
    {
      $set: {
        'subscription.autopay.status': step.status,
        'subscription.autopay.updatedAt': now,
        ...(sub.chargeAt ? { 'subscription.autopay.nextChargeAt': sub.chargeAt } : {}),
        ...(step.effect === 'renew' ? { 'subscription.autopay.lastChargedAt': now } : {}),
        ...(step.effect === 'grace' ? { 'subscription.autopay.failedAt': now } : {}),
        // Approved: the renewal path of the webhook now recognises the subscription.
        ...(step.status === 'authenticated' ? { 'subscription.razorpaySubscriptionId': sub.id, ...(sub.planId ? { 'subscription.razorpayPlanId': sub.planId } : {}) } : {}),
      },
    },
  )
  return step.status
}

/** GST-inclusive amount of one debit for the current plan (server-computed from the price table). */
export function debitAmountPaise(selection: NonNullable<ReturnType<typeof selectionOf>>, cycle: BillingCycle, customerState: string | null | undefined, unitPrices?: unknown): number {
  const quote = quoteSelection(selection, cycle, { prices: lockedPrices(unitPrices) })
  const lines = invoiceLines(quote, { start: '2026-01-01', end: '2026-01-31' })
  return subscriptionInvoiceTotals(lines, supplyTypeFor(flowbitSupplier(), customerState)).totalPaise
}

/** Creates the Razorpay subscription and returns the mandate link the customer opens to approve autopay. */
export async function setupAutopay(orgId: Types.ObjectId): Promise<{ shortUrl: string }> {
  const org = await Org.findById(orgId).lean()
  const sub = org?.subscription
  const selection = selectionOf(sub)
  if (!org || !sub || !selection || sub.status !== 'active' || !sub.currentPeriodEnd) throw new UserError('Autopay starts from an active paid plan. Pay the current bill first.')
  if (sub.razorpaySubscriptionId && !sub.autopay) throw new UserError('This plan already renews automatically through Razorpay.')
  const existing = sub.autopay
  if (existing?.shortUrl && existing.status === 'created') return { shortUrl: existing.shortUrl }
  if (autopayCovers(existing?.status as AutopayStatus | null)) throw new UserError('Autopay is already on.')
  const client = liveFlowbitRazorpay()
  if (!client) throw new UserError('Online payments are not set up yet. Pay by bank transfer and share the UTR instead.')
  const cycle = (sub.cycle ?? 'monthly') as BillingCycle
  const amountPaise = debitAmountPaise(selection, cycle, sub.billing?.address?.stateCode, sub.unitPrices)
  const startAt = new Date(sub.currentPeriodEnd)
  if (startAt.getTime() - Date.now() < 30 * 60_000) throw new UserError('Your plan renews too soon to set up autopay first. Pay this renewal, then turn autopay on.')
  const notes = { orgId: String(org._id), kind: 'flowbit_autopay' }
  const planId = await client.createPlan({ period: cycle, amountPaise, name: `Flowbit ${selectionLabel(selection)}`, notes })
  const created = await client.createSubscription({ planId, totalCount: cycle === 'monthly' ? 120 : 10, startAt, notes })
  if (!created.shortUrl) throw new UserError('Razorpay did not return an approval link. Try again in a minute.')
  await Org.updateOne({ _id: org._id }, { $set: { 'subscription.autopay': { status: 'created', subscriptionId: created.id, planId, shortUrl: created.shortUrl, amountPaise, nextChargeAt: startAt, updatedAt: new Date() } } })
  return { shortUrl: created.shortUrl }
}

/** Stops the mandate at once; the paid period runs to its end, then renewal reminders take over. */
export async function cancelAutopay(orgId: Types.ObjectId): Promise<void> {
  const org = await Org.findById(orgId, { subscription: 1 }).lean()
  const autopay = org?.subscription?.autopay
  if (!autopay?.subscriptionId || !['created', 'authenticated', 'active', 'pending'].includes(autopay.status ?? '')) throw new UserError('Autopay is not on.')
  const client = liveFlowbitRazorpay()
  if (client) await client.cancelSubscription(autopay.subscriptionId, false)
  await Org.updateOne(
    { _id: orgId },
    { $set: { 'subscription.autopay.status': 'cancelled', 'subscription.autopay.updatedAt': new Date() }, ...(org?.subscription?.razorpaySubscriptionId === autopay.subscriptionId ? { $unset: { 'subscription.razorpaySubscriptionId': 1, 'subscription.razorpayPlanId': 1 } } : {}) },
  )
}
