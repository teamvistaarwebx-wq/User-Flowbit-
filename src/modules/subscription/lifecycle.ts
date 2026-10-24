import 'server-only'
import { revalidatePath } from 'next/cache'
import type { ClientSession, Types } from 'mongoose'
import { addPeriod, capacity, quoteSelection, type Selection } from '@/lib/billing'
import type { AuditEntry } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { formatDate, isoDateIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { lockedPrices, type PlanPrices } from '@/lib/plan-config'
import type { BillingCycle } from '@/lib/plans'
import { Org } from '@/models/Org'
import { BillingEvent } from '@/models/subscription/BillingEvent'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { emailInvoice, issueInvoice, type PaymentInfo } from './invoices'
import { addedProducts, invoiceLines, selectionLabel, selectionOf, shapeOf, type StoredProducts, type SubscriptionShape } from './selection'
import { usageOf, type OrgDb } from './usage'

/** Who triggers a billing change: a member (ctx) or the system (webhook). */
export type BillingActor = OrgDb & { userId?: Types.ObjectId | null; audit: (entry: AuditEntry) => Promise<void> }

const lastDayOf = (endExclusive: Date) => isoDateIST(new Date(endExclusive.getTime() - 1))

async function loadOrg(orgId: Types.ObjectId, session?: ClientSession) {
  const org = await Org.findById(orgId).session(session ?? null).lean()
  if (!org) throw new NotFoundError('That workspace')
  return org
}
type OrgDoc = Awaited<ReturnType<typeof loadOrg>>

/** enabledProducts after a plan change: newly bought products switch on; an empty list (= all) stays empty. */
function enabledAfter(org: OrgDoc, next: StoredProducts): string[] | undefined {
  const list = org.enabledProducts ?? []
  if (!list.length) return undefined
  const before = (org.subscription?.products ?? null) as StoredProducts | null
  return [...new Set([...list, ...addedProducts(before, next)])]
}

function shapeSet(shape: SubscriptionShape, cycle: BillingCycle, amountPaise: number, unitPrices: PlanPrices) {
  return {
    'subscription.unitPrices': unitPrices,
    'subscription.status': 'active',
    'subscription.plan': shape.plan,
    'subscription.products': shape.products,
    'subscription.quantities': shape.quantities,
    'subscription.seats': shape.seats,
    'subscription.cycle': cycle,
    'subscription.amountPaise': amountPaise,
  }
}

async function recordEvent(provider: 'razorpay' | 'simulated', eventId: string, type: string, orgId: Types.ObjectId, payload: unknown, session: ClientSession) {
  await BillingEvent.create([{ provider, eventId, type, orgId, payload, receivedAt: new Date(), processedAt: new Date() }], { session })
}

async function afterPayment(actor: BillingActor, invoice: Awaited<ReturnType<typeof issueInvoice>>, title: string, event: string) {
  try {
    await emailInvoice(actor.orgId, invoice)
  } catch (error) {
    console.error('[subscription] invoice email failed', invoice.number, error)
  }
  await notifyPermission({ orgId: actor.orgId, userId: actor.userId }, 'billing.manage', { title, href: '/app/settings/subscription', kind: 'success', event, includeSelf: true })
  revalidatePath('/app', 'layout')
}

const findPaid = (actor: OrgDb, paymentId?: string) =>
  paymentId ? actor.db(SubscriptionInvoice).findOne({ 'payment.paymentId': paymentId }).lean() : Promise.resolve(null)

/**
 * Turns a paid checkout into an active plan in one transaction (platform spec
 * 6.8): plan fields, period, newly bought products switched on, Flowbit invoice
 * issued. Idempotent per payment id (the handler and the webhook can both arrive).
 */
export async function activateSubscription(
  actor: BillingActor,
  input: { selection: Selection; cycle: BillingCycle; payment: PaymentInfo; razorpay?: { subscriptionId: string; planId?: string }; startAt?: Date; unitPrices?: unknown; discountPercent?: number },
) {
  const existing = await findPaid(actor, input.payment.paymentId)
  if (existing) return existing
  // The prices (and first-year discount) the checkout was quoted at; a checkout from before editable prices has none (the lib/plans prices).
  const prices = lockedPrices(input.unitPrices)
  const quote = quoteSelection(input.selection, input.cycle, { prices, discountPercent: input.discountPercent })
  const shape = shapeOf(input.selection)
  const invoice = await withTransaction(async (session) => {
    const org = await loadOrg(actor.orgId, session)
    const start = input.startAt && input.startAt > input.payment.paidAt ? input.startAt : input.payment.paidAt
    const end = addPeriod(start, input.cycle)
    const enabledProducts = enabledAfter(org, shape.products)
    const unset: Record<string, 1> = { 'subscription.pendingCheckout': 1, 'subscription.pastDueSince': 1, 'subscription.endedAt': 1, 'subscription.canceledAt': 1, 'subscription.pendingChange': 1, 'subscription.manual': 1 }
    if (!input.razorpay) Object.assign(unset, { 'subscription.razorpaySubscriptionId': 1, 'subscription.razorpayPlanId': 1 })
    await Org.updateOne(
      { _id: actor.orgId },
      {
        $set: {
          ...shapeSet(shape, input.cycle, quote.periodAmountPaise, prices),
          'subscription.currentPeriodStart': start,
          'subscription.currentPeriodEnd': end,
          'subscription.cancelAtPeriodEnd': false,
          ...(input.razorpay ? { 'subscription.razorpaySubscriptionId': input.razorpay.subscriptionId, 'subscription.razorpayPlanId': input.razorpay.planId } : {}),
          ...(enabledProducts ? { enabledProducts } : {}),
        },
        $unset: unset,
      },
      { session },
    )
    const issued = await issueInvoice(actor, {
      billing: org.subscription?.billing,
      kind: 'subscription',
      lines: invoiceLines(quote, { start: isoDateIST(start), end: lastDayOf(end) }),
      periodStart: isoDateIST(start),
      periodEnd: lastDayOf(end),
      payment: input.payment,
      session,
      cycle: input.cycle,
    })
    const provider = input.payment.provider === 'razorpay' ? 'razorpay' : 'simulated'
    await recordEvent(provider, `activate:${input.payment.paymentId ?? issued.number}`, 'subscription.activated', actor.orgId, { selection: input.selection, cycle: input.cycle }, session)
    return issued
  })
  const label = selectionLabel(input.selection)
  await actor.audit({
    action: 'subscription.activated',
    entity: 'Subscription',
    entityId: actor.orgId,
    summary: `${label}, ${input.cycle} activated: ${formatINR(invoice.totalPaise)} paid`,
    meta: { invoiceNumber: invoice.number, paymentId: input.payment.paymentId, simulated: input.payment.provider === 'simulated' },
  })
  await afterPayment(actor, invoice, `Subscription active: ${label}`, 'subscription.activated')
  return invoice
}

/**
 * A renewal charge (Razorpay `subscription.charged`, or "Simulate renewal"):
 * rolls the period, applies a due scheduled change when usage fits, issues the
 * invoice. Idempotent per payment id.
 */
export async function renewSubscription(actor: BillingActor, input: { payment: PaymentInfo; periodStart?: Date; periodEnd?: Date }) {
  const existing = await findPaid(actor, input.payment.paymentId)
  if (existing) return existing
  const org = await loadOrg(actor.orgId)
  const sub = org.subscription
  const current = selectionOf(sub)
  if (!sub || !current) throw new NotFoundError('An active plan')
  const now = input.payment.paidAt
  let selection = current
  let cycle = (sub.cycle ?? 'monthly') as BillingCycle
  let changeNote: 'applied' | 'refused' | null = null
  if (sub.pendingChange && new Date(sub.pendingChange.effectiveAt) <= now) {
    const next = selectionOf(sub.pendingChange)
    const nextShape = next ? shapeOf(next) : null
    const fits = nextShape ? capacity({ status: 'active', ...nextShape }, await usageOf(actor)).every((r) => r.ok) : false
    if (next && fits) {
      selection = next
      cycle = (sub.pendingChange.cycle ?? cycle) as BillingCycle
      changeNote = 'applied'
    } else changeNote = 'refused'
  }
  // A renewal keeps the subscriber's locked prices; an applied scheduled change uses the prices it was quoted at.
  const prices = lockedPrices(changeNote === 'applied' ? sub.pendingChange?.unitPrices : sub.unitPrices)
  const quote = quoteSelection(selection, cycle, { prices })
  const shape = shapeOf(selection)
  const start = input.periodStart ?? (sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now)
  const end = input.periodEnd ?? addPeriod(start, cycle)
  const invoice = await withTransaction(async (session) => {
    const enabledProducts = enabledAfter(org, shape.products)
    await Org.updateOne(
      { _id: actor.orgId },
      {
        $set: { ...shapeSet(shape, cycle, quote.periodAmountPaise, prices), 'subscription.currentPeriodStart': start, 'subscription.currentPeriodEnd': end, ...(enabledProducts ? { enabledProducts } : {}) },
        $unset: { 'subscription.pastDueSince': 1, 'subscription.endedAt': 1, ...(changeNote ? { 'subscription.pendingChange': 1 } : {}) },
      },
      { session },
    )
    const issued = await issueInvoice(actor, {
      billing: org.subscription?.billing,
      kind: 'subscription',
      lines: invoiceLines(quote, { start: isoDateIST(start), end: lastDayOf(end) }),
      periodStart: isoDateIST(start),
      periodEnd: lastDayOf(end),
      payment: input.payment,
      session,
      cycle,
    })
    const provider = input.payment.provider === 'razorpay' ? 'razorpay' : 'simulated'
    await recordEvent(provider, `renew:${input.payment.paymentId ?? issued.number}`, 'subscription.charged', actor.orgId, { periodStart: start, periodEnd: end }, session)
    return issued
  })
  await actor.audit({
    action: 'subscription.renewed',
    entity: 'Subscription',
    entityId: actor.orgId,
    summary: `Renewed ${selectionLabel(selection)} until ${formatDate(lastDayOf(end))}: invoice ${invoice.number}`,
    meta: { invoiceNumber: invoice.number, paymentId: input.payment.paymentId, simulated: input.payment.provider === 'simulated', scheduledChange: changeNote },
  })
  if (changeNote === 'refused') {
    await notifyPermission({ orgId: actor.orgId }, 'billing.manage', {
      title: 'Scheduled plan change not applied',
      body: 'More people use the workspace than the new plan allows, so your current plan renewed instead.',
      href: '/app/settings/subscription',
      kind: 'warning',
      event: 'subscription.change_applied',
    })
  }
  await afterPayment(actor, invoice, `Renewed: invoice ${invoice.number}`, 'subscription.renewed')
  return invoice
}

/**
 * A mid-period increase (platform spec 6.11): the new plan applies now, the
 * prorated difference is invoiced as kind 'upgrade'. Renewals charge the new amount.
 */
export async function applyUpgrade(
  actor: BillingActor,
  input: { selection: Selection; payment: PaymentInfo; prorationPaise: number; remainingDays: number; totalDays: number; unitPrices?: unknown },
) {
  const existing = await findPaid(actor, input.payment.paymentId)
  if (existing) return existing
  const org = await loadOrg(actor.orgId)
  const before = selectionOf(org.subscription)
  const cycle = (org.subscription?.cycle ?? 'monthly') as BillingCycle
  const prices = lockedPrices(input.unitPrices)
  const quote = quoteSelection(input.selection, cycle, { prices })
  const shape = shapeOf(input.selection)
  const today = isoDateIST(input.payment.paidAt)
  const periodEnd = org.subscription?.currentPeriodEnd ? lastDayOf(new Date(org.subscription.currentPeriodEnd)) : today
  const description = `Upgrade: ${before ? selectionLabel(before) : 'plan'} → ${selectionLabel(input.selection)}, ${formatDate(today)} to ${formatDate(periodEnd)} (${input.remainingDays} of ${input.totalDays} days)`
  const invoice = await withTransaction(async (session) => {
    const enabledProducts = enabledAfter(org, shape.products)
    await Org.updateOne(
      { _id: actor.orgId },
      { $set: { ...shapeSet(shape, cycle, quote.periodAmountPaise, prices), ...(enabledProducts ? { enabledProducts } : {}) }, $unset: { 'subscription.pendingCheckout': 1, 'subscription.pendingChange': 1 } },
      { session },
    )
    const issued = await issueInvoice(actor, {
      billing: org.subscription?.billing,
      kind: 'upgrade',
      lines: [{ description, productKey: 'upgrade', quantity: 1, unitPaise: input.prorationPaise, amountPaise: input.prorationPaise }],
      periodStart: today,
      periodEnd,
      payment: input.payment,
      session,
    })
    const provider = input.payment.provider === 'razorpay' ? 'razorpay' : 'simulated'
    await recordEvent(provider, `upgrade:${input.payment.paymentId ?? issued.number}`, 'subscription.upgraded', actor.orgId, { selection: input.selection }, session)
    return issued
  })
  await actor.audit({
    action: 'subscription.upgraded',
    entity: 'Subscription',
    entityId: actor.orgId,
    summary: `${description}: ${formatINR(invoice.totalPaise)} paid`,
    meta: { invoiceNumber: invoice.number, paymentId: input.payment.paymentId, simulated: input.payment.provider === 'simulated' },
  })
  await afterPayment(actor, invoice, `Upgraded to ${selectionLabel(input.selection)}`, 'subscription.upgraded')
  return invoice
}
