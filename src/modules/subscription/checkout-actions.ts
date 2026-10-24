'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { addPeriod, quoteSelection, quoteTaxLines, taxWords } from '@/lib/billing'
import { audit } from '@/lib/audit'
import { flowbitSupplier, serverEnv } from '@/lib/env'
import { email, gstin, gstinStateIssue, optionalText, pincode, requiredText, stateCode } from '@/lib/validation'
import { recordUsage } from '@/lib/usage'
import { cancelRazorpaySubscription, checkoutOptions, createPlan, createSubscription } from './razorpay'
import { Org } from '@/models/Org'
import { firstYearDiscountFor } from '@/modules/billing/first-year'
import type { CheckoutStart } from './checkout-types'
import { actorOf, assertBillingDetails, assertChoiceFits, assertTestMode, freshSubscription, paymentMode, simulatedPaymentId, totalsFor } from './guards'
import { activateSubscription } from './lifecycle'
import { readPendingCheckout } from './pending'
import { planChoiceSchema, selectionLabel } from './selection'
import { verifyCheckoutSignature } from './signatures'

const OPTS = { perm: 'billing.manage', allowReadOnly: true, allowBlocked: true } as const
const CAN_START = new Set(['trialing', 'expired', 'past_due', 'canceled'])

const billingSchema = z
  .object({
    legalName: requiredText('Name on the invoice', 120).min(2, 'Use at least 2 characters'),
    email,
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').optional(),
    gstin: gstin.optional(),
    address: z.object({
      line1: requiredText('Address', 120),
      line2: optionalText(120),
      city: requiredText('City', 60),
      stateCode,
      pincode,
    }),
  })
  .superRefine((value, ctx) => {
    const issue = gstinStateIssue(value.gstin, value.address.stateCode)
    if (issue) ctx.addIssue({ code: 'custom', path: ['gstin'], message: issue })
  })

/** Invoice addressee for Flowbit's GST invoices (applies to future invoices only). */
export const saveBillingDetails = action(
  billingSchema,
  async (input, ctx) => {
    const before = ctx.org.subscription?.billing ?? null
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'subscription.billing': input } })
    await audit(ctx, { action: 'subscription.billing_details_updated', entity: 'Subscription', entityId: ctx.orgId, summary: `Billing details saved for ${input.legalName}`, changes: { before, after: input } })
    revalidatePath('/app/settings/subscription')
    return ok('Billing details saved.')
  },
  OPTS,
)

/** Starts a Razorpay subscription checkout; the browser then opens Razorpay Checkout. */
export const startCheckout = action(
  planChoiceSchema,
  async (choice, ctx) => {
    recordUsage({ kind: 'upgrade_clicked', orgId: ctx.orgId, userId: ctx.userId, meta: { cycle: choice.cycle } })
    if (paymentMode() === 'off') return fail("Online payments aren't set up on this server yet. Contact support to choose a plan.")
    if (paymentMode() === 'simulated') return fail('Payments are in test mode here. Use Simulate payment.')
    const { sub, status } = await freshSubscription(ctx)
    if (!CAN_START.has(status)) return fail('You already have an active plan. Use Change plan instead.')
    await assertChoiceFits(ctx, choice)
    assertBillingDetails(sub.billing)
    const unitPrices = ctx.planConfig.prices
    const discountPercent = await firstYearDiscountFor(ctx.orgId, choice.cycle, ctx.planConfig.yearlyDiscountPercent)
    const quote = quoteSelection(choice.selection, choice.cycle, { prices: unitPrices, discountPercent })
    // The Razorpay plan charges the list price on every renewal; the first-year discount is one up-front charge.
    const renewalTotals = totalsFor(quote.lines, sub.billing)
    const firstTotals = totalsFor(quoteTaxLines(quote), sub.billing)
    const label = selectionLabel(choice.selection)
    if (status === 'past_due' && sub.razorpaySubscriptionId) await cancelRazorpaySubscription(sub.razorpaySubscriptionId, false)
    const startAt = status === 'canceled' && sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined
    const planId = await createPlan({ cycle: choice.cycle, totalPaise: renewalTotals.totalPaise, name: `Flowbit ${label}`, description: `${label}, ${choice.cycle}, ${taxWords(Boolean(flowbitSupplier().gstin))}`, orgId: String(ctx.orgId) })
    const upfront = quote.discountPaise ? { name: `Flowbit ${label}, first year (${quote.discountPercent}% off), ${taxWords(Boolean(flowbitSupplier().gstin))}`, totalPaise: firstTotals.totalPaise } : undefined
    const renewalsFrom = upfront ? addPeriod(startAt ?? new Date(), choice.cycle) : startAt
    const subscriptionId = await createSubscription({ planId, cycle: choice.cycle, orgId: String(ctx.orgId), startAt: renewalsFrom, upfront })
    const pending = { kind: 'subscription', razorpaySubscriptionId: subscriptionId, razorpayPlanId: planId, selection: choice.selection, cycle: choice.cycle, amountPaise: quote.periodAmountPaise, totalPaise: firstTotals.totalPaise, startAt, unitPrices, discountPercent: quote.discountPercent, createdAt: new Date() }
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'subscription.pendingCheckout': pending } })
    const billing = sub.billing
    const options = checkoutOptions({ subscriptionId, description: label, prefill: { name: billing?.legalName ?? undefined, email: billing?.email ?? undefined, contact: billing?.phone ?? undefined } })
    return ok<CheckoutStart>(undefined, { mode: 'razorpay', options })
  },
  OPTS,
)

const confirmSchema = z.object({ razorpay_payment_id: z.string().min(1), razorpay_subscription_id: z.string().min(1), razorpay_signature: z.string().min(1) })

/** Razorpay Checkout handler: verifies the signature and activates the plan. */
export const confirmCheckout = action(
  confirmSchema,
  async (input, ctx) => {
    const { sub } = await freshSubscription(ctx)
    const pending = readPendingCheckout(sub.pendingCheckout)
    const valid =
      pending?.kind === 'subscription' &&
      pending.razorpaySubscriptionId === input.razorpay_subscription_id &&
      verifyCheckoutSignature({ paymentId: input.razorpay_payment_id, subscriptionId: input.razorpay_subscription_id, signature: input.razorpay_signature }, serverEnv().RAZORPAY_KEY_SECRET)
    if (!valid || pending?.kind !== 'subscription') {
      console.error('[subscription] checkout signature mismatch', { orgId: String(ctx.orgId), subscriptionId: input.razorpay_subscription_id })
      return fail("We couldn't verify that payment. If money left your account, Razorpay will refund it; contact support.")
    }
    const invoice = await activateSubscription(actorOf(ctx), {
      selection: pending.selection,
      cycle: pending.cycle,
      payment: { provider: 'razorpay', paymentId: input.razorpay_payment_id, subscriptionId: input.razorpay_subscription_id, paidAt: new Date() },
      razorpay: { subscriptionId: pending.razorpaySubscriptionId, planId: pending.razorpayPlanId },
      startAt: pending.startAt,
      unitPrices: pending.unitPrices,
      discountPercent: pending.discountPercent,
    })
    return ok(`You're on ${selectionLabel(pending.selection)}. Invoice ${invoice.number} is in your billing history.`)
  },
  OPTS,
)

/** Test mode (no Razorpay keys, local only): activates the plan as if paid. */
export const simulatePayment = action(
  planChoiceSchema,
  async (choice, ctx) => {
    recordUsage({ kind: 'upgrade_clicked', orgId: ctx.orgId, userId: ctx.userId, meta: { cycle: choice.cycle } })
    assertTestMode()
    const { sub, status } = await freshSubscription(ctx)
    if (!CAN_START.has(status)) return fail('You already have an active plan. Use Change plan instead.')
    await assertChoiceFits(ctx, choice)
    assertBillingDetails(sub.billing)
    const startAt = status === 'canceled' && sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined
    const invoice = await activateSubscription(actorOf(ctx), {
      selection: choice.selection,
      cycle: choice.cycle,
      payment: { provider: 'simulated', paymentId: simulatedPaymentId(), paidAt: new Date() },
      startAt,
      unitPrices: ctx.planConfig.prices,
      discountPercent: await firstYearDiscountFor(ctx.orgId, choice.cycle, ctx.planConfig.yearlyDiscountPercent),
    })
    return ok<CheckoutStart>(`You're on ${selectionLabel(choice.selection)}. Invoice ${invoice.number} is in your billing history.`, { mode: 'done' })
  },
  OPTS,
)
