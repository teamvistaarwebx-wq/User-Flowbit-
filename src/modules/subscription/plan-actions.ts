'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { prorate, quoteSelection } from '@/lib/billing'
import { formatDate, isoDateIST } from '@/lib/dates'
import { flowbitSupplier, razorpayMode, serverEnv } from '@/lib/env'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { objectId } from '@/lib/validation'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import type { CheckoutStart } from './checkout-types'
import { actorOf, assertChoiceFits, assertTestMode, freshSubscription, simulatedPaymentId, totalsFor } from './guards'
import { emailInvoice } from './invoices'
import { applyUpgrade, renewSubscription } from './lifecycle'
import { readPendingCheckout } from './pending'
import { cancelRazorpaySubscription, changeRazorpayPlan, checkoutOptions, createOrder } from './razorpay'
import { planChoiceSchema, sameSelection, selectionLabel, selectionOf, shapeOf } from './selection'
import { verifyOrderSignature } from './signatures'
import { applyPaidUpgrade, movePlan } from './upgrade'

const OPTS = { perm: 'billing.manage', allowReadOnly: true, allowBlocked: true } as const

/**
 * Changes an active plan (platform spec 6.11): increases apply now with a
 * prorated charge; decreases and cycle changes wait for the next renewal.
 */
export const changePlan = action(
  planChoiceSchema,
  async (choice, ctx) => {
    const { sub, status } = await freshSubscription(ctx)
    if (status !== 'active' || !sub.currentPeriodStart || !sub.currentPeriodEnd) return fail('Plan changes need an active plan. Choose a plan instead.')
    if (sub.manual) return fail('Flowbit set this plan for you. Contact support to change it.')
    const current = selectionOf(sub)
    if (sameSelection(current, choice.selection) && choice.cycle === sub.cycle) return fail("That's your current plan.")
    await assertChoiceFits(ctx, choice)
    const unitPrices = ctx.planConfig.prices
    const quote = quoteSelection(choice.selection, choice.cycle, { prices: unitPrices })
    const label = selectionLabel(choice.selection)
    const periodTotal = totalsFor(quote.lines, sub.billing).totalPaise
    const proration = prorate({ oldAmountPaise: sub.amountPaise ?? 0, newAmountPaise: quote.periodAmountPaise, periodStart: new Date(sub.currentPeriodStart), periodEnd: new Date(sub.currentPeriodEnd) })
    const increase = choice.cycle === sub.cycle && proration.amountPaise > 0

    if (!increase) {
      const shape = shapeOf(choice.selection)
      const effectiveAt = new Date(sub.currentPeriodEnd)
      await Org.updateOne({ _id: ctx.orgId }, { $set: { 'subscription.pendingChange': { ...shape, cycle: choice.cycle, amountPaise: quote.periodAmountPaise, unitPrices, effectiveAt, requestedBy: ctx.memberId } } })
      const planId = await movePlan(sub.razorpaySubscriptionId, { cycle: choice.cycle, totalPaise: periodTotal, label, orgId: String(ctx.orgId) })
      const per = choice.cycle === 'yearly' ? 'a year' : 'a month'
      const summary = `From ${formatDate(effectiveAt)} you'll be on ${label}, ${formatINR(quote.periodAmountPaise)}${flowbitSupplier().gstin ? ' + GST' : ''} ${per}.`
      await audit(ctx, { action: 'subscription.change_scheduled', entity: 'Subscription', entityId: ctx.orgId, summary, meta: { after: { selection: choice.selection, cycle: choice.cycle }, razorpayPlanId: planId } })
      revalidatePath('/app/settings/subscription')
      return ok<CheckoutStart>(summary, { mode: 'done' })
    }

    const totals = totalsFor([{ amountPaise: proration.amountPaise }], sub.billing)
    if (razorpayMode() === 'none') {
      assertTestMode()
      const invoice = await applyUpgrade(actorOf(ctx), { selection: choice.selection, payment: { provider: 'simulated', paymentId: simulatedPaymentId(), paidAt: new Date() }, prorationPaise: proration.amountPaise, remainingDays: proration.remainingDays, totalDays: proration.totalDays, unitPrices })
      return ok<CheckoutStart>(`Upgraded to ${label}. Invoice ${invoice.number} covers the remaining ${proration.remainingDays} days.`, { mode: 'done' })
    }
    const orderId = await createOrder({ amountPaise: totals.totalPaise, receipt: `upg_${String(ctx.orgId).slice(-8)}_${Date.now()}`, orgId: String(ctx.orgId) })
    const pending = { kind: 'upgrade', orderId, selection: choice.selection, cycle: choice.cycle, prorationPaise: proration.amountPaise, remainingDays: proration.remainingDays, totalDays: proration.totalDays, periodTotalPaise: periodTotal, unitPrices, createdAt: new Date() }
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'subscription.pendingCheckout': pending } })
    const billing = sub.billing
    const options = checkoutOptions({ orderId, amountPaise: totals.totalPaise, description: `Upgrade to ${label}`, prefill: { name: billing?.legalName ?? undefined, email: billing?.email ?? undefined, contact: billing?.phone ?? undefined } })
    return ok<CheckoutStart>(undefined, { mode: 'razorpay', options })
  },
  OPTS,
)

const orderConfirmSchema = z.object({ razorpay_order_id: z.string().min(1), razorpay_payment_id: z.string().min(1), razorpay_signature: z.string().min(1) })

/** Razorpay Checkout handler for an upgrade order. */
export const confirmUpgrade = action(
  orderConfirmSchema,
  async (input, ctx) => {
    const { sub } = await freshSubscription(ctx)
    const signed = verifyOrderSignature({ orderId: input.razorpay_order_id, paymentId: input.razorpay_payment_id, signature: input.razorpay_signature }, serverEnv().RAZORPAY_KEY_SECRET)
    const pending = readPendingCheckout(sub.pendingCheckout)
    if (signed && pending?.kind !== 'upgrade') {
      // The order.paid webhook may have applied the upgrade before the handler returned.
      const paid = await ctx.db(SubscriptionInvoice).findOne({ 'payment.paymentId': input.razorpay_payment_id }, { number: 1 }).lean()
      if (paid) return ok(`Upgraded. Invoice ${paid.number} is in your billing history.`)
    }
    if (!signed || pending?.kind !== 'upgrade' || pending.orderId !== input.razorpay_order_id) {
      console.error('[subscription] upgrade signature mismatch', { orgId: String(ctx.orgId), orderId: input.razorpay_order_id })
      return fail("We couldn't verify that payment. If money left your account, Razorpay will refund it; contact support.")
    }
    const { invoice, label } = await applyPaidUpgrade(actorOf(ctx), pending, { paymentId: input.razorpay_payment_id, orderId: input.razorpay_order_id }, sub.razorpaySubscriptionId)
    return ok(`Upgraded to ${label}. Invoice ${invoice.number} covers the remaining ${pending.remainingDays} days.`)
  },
  OPTS,
)

/** Drops a scheduled downgrade or cycle change. */
export const cancelPendingChange = action(
  z.object({}),
  async (_input, ctx) => {
    const { sub } = await freshSubscription(ctx)
    if (!sub.pendingChange) return fail('There is no scheduled change.')
    await Org.updateOne({ _id: ctx.orgId }, { $unset: { 'subscription.pendingChange': 1 } })
    if (sub.razorpaySubscriptionId && sub.razorpayPlanId && razorpayMode() !== 'none') {
      await changeRazorpayPlan(sub.razorpaySubscriptionId, sub.razorpayPlanId).catch((error) => console.error('[subscription] could not restore the Razorpay plan', error))
    }
    await audit(ctx, { action: 'subscription.change_cancelled', entity: 'Subscription', entityId: ctx.orgId, summary: 'Scheduled plan change cancelled' })
    revalidatePath('/app/settings/subscription')
    return ok('Scheduled change cancelled.')
  },
  OPTS,
)

/** Owner only: stops renewal; full access continues until the period ends. */
export const cancelSubscription = action(
  z.object({ confirm: z.string() }),
  async ({ confirm }, ctx) => {
    if (!ctx.isOwner) return fail('Only the workspace owner can cancel the subscription.')
    if (confirm.trim().toUpperCase() !== 'CANCEL') return fail('Type CANCEL to confirm.', { confirm: 'Type CANCEL' })
    const { sub, status } = await freshSubscription(ctx)
    if (status !== 'active' || !sub.currentPeriodEnd) return fail('There is no active plan to cancel.')
    if (sub.manual) return fail('Flowbit set this plan for you. Contact support to change it.')
    if (sub.razorpaySubscriptionId && razorpayMode() !== 'none') await cancelRazorpaySubscription(sub.razorpaySubscriptionId, true)
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'subscription.status': 'canceled', 'subscription.cancelAtPeriodEnd': true, 'subscription.canceledAt': new Date() }, $unset: { 'subscription.pendingChange': 1 } })
    const until = formatDate(isoDateIST(new Date(new Date(sub.currentPeriodEnd).getTime() - 1)))
    await audit(ctx, { action: 'subscription.canceled', entity: 'Subscription', entityId: ctx.orgId, summary: `Subscription cancelled; full access until ${until}` })
    await notifyPermission(ctx, 'billing.manage', { title: `Subscription cancelled: full access until ${until}`, href: '/app/settings/subscription', kind: 'warning', event: 'subscription.canceled' })
    revalidatePath('/app', 'layout')
    return ok(`Subscription cancelled. Full access until ${until}.`)
  },
  OPTS,
)

/** Test mode: runs the renewal path now (also settles a past-due plan). */
export const simulateRenewal = action(
  z.object({}),
  async (_input, ctx) => {
    assertTestMode()
    const { sub, status } = await freshSubscription(ctx)
    if ((status !== 'active' && status !== 'past_due') || sub.cancelAtPeriodEnd) return fail('Only an active plan renews.')
    const invoice = await renewSubscription(actorOf(ctx), { payment: { provider: 'simulated', paymentId: simulatedPaymentId(), paidAt: new Date() } })
    return ok(`Renewed. Invoice ${invoice.number} is in your billing history.`)
  },
  OPTS,
)

/** Re-sends an invoice PDF to the current billing email. */
export const emailInvoiceAgain = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const invoice = await ctx.db(SubscriptionInvoice).findById(id).lean()
    if (!invoice) throw new NotFoundError('That invoice')
    const to = await emailInvoice(ctx.orgId, invoice, ctx.org.subscription?.billing?.email)
    if (!to) return fail('Add a billing email first.')
    await audit(ctx, { action: 'subscription.invoice_emailed', entity: 'SubscriptionInvoice', entityId: invoice._id, summary: `Invoice ${invoice.number} emailed to ${to}` })
    return ok(`Invoice ${invoice.number} sent to ${to}.`)
  },
  OPTS,
)
