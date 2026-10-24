import 'server-only'
import { randomBytes } from 'node:crypto'
import { subscriptionInvoiceTotals, supplyTypeFor, type SelectionLine } from '@/lib/billing'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { flowbitSupplier, isRazorpayConfigured, simulatedPaymentsAllowed } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { effectiveStatus } from '@/lib/plans'
import { Org } from '@/models/Org'
import { hasBillingDetails, type BillingDetails } from './invoices'
import type { BillingActor } from './lifecycle'
import { usageProblems, type PlanChoice } from './selection'
import { usageOf } from './usage'

/** The signed-in member as the actor of a billing change. */
export const actorOf = (ctx: Ctx): BillingActor => ({ orgId: ctx.orgId, db: ctx.db, userId: ctx.userId, audit: (entry) => audit(ctx, entry) })

/** The workspace's subscription, fresh from the database (not the request-cached ctx.org). */
export async function freshSubscription(ctx: Ctx) {
  const org = await Org.findById(ctx.orgId, { subscription: 1 }).lean()
  const sub = org?.subscription
  if (!sub) throw new UserError('This workspace has no subscription record. Contact support.')
  return { sub, status: effectiveStatus(sub).status }
}

/** Refuses quantities below today's usage, naming each field. */
export async function assertChoiceFits(ctx: Ctx, choice: PlanChoice): Promise<void> {
  const problems = usageProblems(choice.selection, await usageOf(ctx))
  const first = Object.values(problems)[0]
  if (first) throw new UserError(first, problems)
}

export function assertBillingDetails(billing: BillingDetails | null | undefined): void {
  if (!hasBillingDetails(billing)) throw new UserError('Add your billing details first. They go on your GST invoice.', { billing: 'Billing details are required' })
}

/**
 * How this server takes payments: Razorpay when keys are set, simulated in
 * local development without keys, and not at all anywhere else (production,
 * Vercel, a public APP_URL) without keys.
 */
export function paymentMode(): 'razorpay' | 'simulated' | 'off' {
  if (isRazorpayConfigured()) return 'razorpay'
  return simulatedPaymentsAllowed() ? 'simulated' : 'off'
}

/** Simulated payments: only without Razorpay keys and never in production. */
export function assertTestMode(): void {
  if (paymentMode() !== 'simulated') throw new UserError('Simulated payments only work in local development.')
}

export const simulatedPaymentId = () => `sim_${Array.from(randomBytes(12), (b) => (b % 36).toString(36)).join('')}`

/** GST totals for lines, using the billing state as the place of supply. */
export function totalsFor(lines: Pick<SelectionLine, 'amountPaise'>[], billing: BillingDetails | null | undefined) {
  return subscriptionInvoiceTotals(lines, supplyTypeFor(flowbitSupplier(), billing?.address?.stateCode))
}
