import 'server-only'
import { taxWords } from '@/lib/billing'
import { flowbitSupplier, razorpayMode } from '@/lib/env'
import type { BillingCycle } from '@/lib/plans'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { applyUpgrade, type BillingActor } from './lifecycle'
import type { PendingCheckout } from './pending'
import { changeRazorpayPlan, createPlan } from './razorpay'
import { selectionLabel } from './selection'

const isDuplicate = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

/** Best effort: point the Razorpay subscription at a plan with this price from the next cycle. */
export async function movePlan(subscriptionId: string | null | undefined, input: { cycle: BillingCycle; totalPaise: number; label: string; orgId: string }): Promise<string | null> {
  if (!subscriptionId || razorpayMode() === 'none') return null
  try {
    const planId = await createPlan({ cycle: input.cycle, totalPaise: input.totalPaise, name: `Flowbit ${input.label}`, description: `${input.label}, ${input.cycle}, ${taxWords(Boolean(flowbitSupplier().gstin))}`, orgId: input.orgId })
    await changeRazorpayPlan(subscriptionId, planId)
    return planId
  } catch (error) {
    console.error('[subscription] could not move the Razorpay plan', subscriptionId, error)
    return null
  }
}

/**
 * Applies a paid upgrade order: the checkout handler (confirmUpgrade) and the
 * `order.paid` webhook both land here, so an upgrade paid in Razorpay is
 * applied even if the browser never returns. Idempotent by payment id.
 */
export async function applyPaidUpgrade(
  actor: BillingActor,
  pending: Extract<PendingCheckout, { kind: 'upgrade' }>,
  payment: { paymentId: string; orderId: string },
  razorpaySubscriptionId: string | null | undefined,
) {
  const invoice = await applyUpgrade(actor, {
    selection: pending.selection,
    payment: { provider: 'razorpay', paymentId: payment.paymentId, orderId: payment.orderId, paidAt: new Date() },
    prorationPaise: pending.prorationPaise,
    remainingDays: pending.remainingDays,
    totalDays: pending.totalDays,
    unitPrices: pending.unitPrices,
  }).catch(async (error: unknown) => {
    // The handler and the webhook raced: the other one issued the invoice (unique payment id) and applied the plan.
    const existing = isDuplicate(error) ? await actor.db(SubscriptionInvoice).findOne({ 'payment.paymentId': payment.paymentId }).lean() : null
    if (!existing) throw error
    return existing
  })
  const label = selectionLabel(pending.selection)
  const planId = await movePlan(razorpaySubscriptionId, { cycle: pending.cycle, totalPaise: pending.periodTotalPaise, label, orgId: String(actor.orgId) })
  if (planId) await Org.updateOne({ _id: actor.orgId }, { $set: { 'subscription.razorpayPlanId': planId } })
  return { invoice, label }
}
