import 'server-only'
import { serverEnv } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import type { BillingCycle } from '@/lib/plans'
import type { CheckoutOptions } from './checkout-types'

/**
 * Razorpay REST calls over fetch (no SDK). Field names follow Razorpay's
 * Subscriptions and Orders APIs; verify them against the current docs before
 * going live with real keys.
 */

const BASE = 'https://api.razorpay.com/v1'

async function call<T>(path: string, init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown }): Promise<T> {
  const env = serverEnv()
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method: init.method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } }
  if (!res.ok) {
    console.error('[razorpay]', init.method, path, res.status, json?.error)
    throw new UserError(`Razorpay refused the request: ${json?.error?.description ?? `HTTP ${res.status}`}. Try again or contact support.`)
  }
  return json
}

export async function createPlan(input: { cycle: BillingCycle; totalPaise: number; name: string; description: string; orgId: string }): Promise<string> {
  const plan = await call<{ id: string }>('/plans', {
    method: 'POST',
    body: {
      period: input.cycle,
      interval: 1,
      item: { name: input.name, amount: input.totalPaise, currency: 'INR', description: input.description },
      notes: { orgId: input.orgId },
    },
  })
  return plan.id
}

/**
 * `upfront` (the first-year discount): Razorpay charges this amount with the
 * authorisation payment as an add-on, and `startAt` (a year on) is when the
 * plan's own full-price charges begin.
 */
export async function createSubscription(input: { planId: string; cycle: BillingCycle; orgId: string; startAt?: Date; upfront?: { name: string; totalPaise: number } }): Promise<string> {
  const sub = await call<{ id: string }>('/subscriptions', {
    method: 'POST',
    body: {
      plan_id: input.planId,
      total_count: input.cycle === 'monthly' ? 120 : 10,
      quantity: 1,
      customer_notify: 1,
      ...(input.startAt ? { start_at: Math.floor(input.startAt.getTime() / 1000) } : {}),
      ...(input.upfront ? { addons: [{ item: { name: input.upfront.name, amount: input.upfront.totalPaise, currency: 'INR' } }] } : {}),
      notes: { orgId: input.orgId },
    },
  })
  return sub.id
}

export async function cancelRazorpaySubscription(id: string, atCycleEnd: boolean): Promise<void> {
  await call(`/subscriptions/${id}/cancel`, { method: 'POST', body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } })
}

/** Moves the subscription to another plan from the next cycle. */
export async function changeRazorpayPlan(id: string, planId: string): Promise<void> {
  await call(`/subscriptions/${id}`, { method: 'PATCH', body: { plan_id: planId, schedule_change_at: 'cycle_end', customer_notify: 1 } })
}

export async function createOrder(input: { amountPaise: number; receipt: string; orgId: string }): Promise<string> {
  const order = await call<{ id: string }>('/orders', {
    method: 'POST',
    body: { amount: input.amountPaise, currency: 'INR', receipt: input.receipt.slice(0, 40), notes: { orgId: input.orgId, kind: 'upgrade' } },
  })
  return order.id
}

/** Options for Razorpay Checkout on the client (never includes the secret). */
export function checkoutOptions(input: { subscriptionId?: string; orderId?: string; amountPaise?: number; description: string; prefill: { name?: string; email?: string; contact?: string } }): CheckoutOptions {
  return {
    key: serverEnv().RAZORPAY_KEY_ID,
    ...(input.subscriptionId ? { subscription_id: input.subscriptionId } : {}),
    ...(input.orderId ? { order_id: input.orderId, amount: input.amountPaise, currency: 'INR' } : {}),
    name: 'Flowbit',
    description: input.description,
    prefill: input.prefill,
    theme: { color: '#BB62A5' },
  }
}
