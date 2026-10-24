import { PROVIDER_TIMEOUT_MS } from '@/lib/fetch-timeout'
import { cancelPaymentLink, createPaymentLink, RAZORPAY_API, RazorpayError, type CreateLinkInput, type FetchLike, type RazorpayCredentials, type RazorpayLink } from '@/modules/payments/razorpay-links'

/**
 * Every Razorpay call of Flowbit's own billing (console spec 11) with
 * Flowbit's RAZORPAY_* keys: payment links on due bills, autopay plans and
 * subscriptions, refunds. `fetch` is injected, so tests pass a mock and never
 * reach the network; the server builds the live client (billing/live.ts).
 */

export type AutopaySubscription = Readonly<{ id: string; shortUrl: string | null; status: string }>
export type Refund = Readonly<{ id: string; status: string; amountPaise: number }>

export type FlowbitRazorpay = Readonly<{
  createPaymentLink: (input: CreateLinkInput) => Promise<RazorpayLink>
  cancelPaymentLink: (linkId: string) => Promise<void>
  /** A plan for one debit amount (GST included) per period. */
  createPlan: (input: { period: 'monthly' | 'yearly'; amountPaise: number; name: string; notes: Record<string, string> }) => Promise<string>
  /** A subscription whose short_url is the mandate (authorisation) link the customer opens. */
  createSubscription: (input: { planId: string; totalCount: number; startAt?: Date; notes: Record<string, string> }) => Promise<AutopaySubscription>
  cancelSubscription: (id: string, atCycleEnd: boolean) => Promise<void>
  /** Refunds part or all of a captured payment, back to its original method. */
  refund: (input: { paymentId: string; amountPaise: number; notes: Record<string, string> }) => Promise<Refund>
}>

type Json = Record<string, unknown> & { error?: { description?: string } }

async function call(fetchFn: FetchLike, creds: RazorpayCredentials, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Json> {
  const res = await fetchFn(`${RAZORPAY_API}${path}`, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  const json = ((await res.json().catch(() => ({}))) ?? {}) as Json
  if (!res.ok) throw new RazorpayError(json.error?.description ?? `Razorpay answered HTTP ${res.status}`, res.status)
  return json
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')

export function flowbitRazorpay(fetchFn: FetchLike, creds: RazorpayCredentials): FlowbitRazorpay {
  return {
    createPaymentLink: (input) => createPaymentLink(fetchFn, creds, input),
    cancelPaymentLink: (linkId) => cancelPaymentLink(fetchFn, creds, linkId),
    async createPlan(input) {
      const json = await call(fetchFn, creds, 'POST', '/plans', {
        period: input.period,
        interval: 1,
        item: { name: input.name.slice(0, 100), amount: input.amountPaise, currency: 'INR' },
        notes: input.notes,
      })
      if (!str(json.id)) throw new RazorpayError('Razorpay did not return a plan.', 502)
      return str(json.id)
    },
    async createSubscription(input) {
      const json = await call(fetchFn, creds, 'POST', '/subscriptions', {
        plan_id: input.planId,
        total_count: input.totalCount,
        quantity: 1,
        // Flowbit sends its own pre-debit notice and reminders.
        customer_notify: 0,
        ...(input.startAt ? { start_at: Math.floor(input.startAt.getTime() / 1000) } : {}),
        notes: input.notes,
      })
      if (!str(json.id)) throw new RazorpayError('Razorpay did not return a subscription.', 502)
      return { id: str(json.id), shortUrl: str(json.short_url) || null, status: str(json.status) || 'created' }
    },
    async cancelSubscription(id, atCycleEnd) {
      await call(fetchFn, creds, 'POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 })
    },
    async refund(input) {
      if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) throw new RazorpayError('A refund needs at least ₹1.', 400)
      const json = await call(fetchFn, creds, 'POST', `/payments/${encodeURIComponent(input.paymentId)}/refund`, { amount: input.amountPaise, speed: 'normal', notes: input.notes })
      if (!str(json.id)) throw new RazorpayError('Razorpay did not return a refund.', 502)
      return { id: str(json.id), status: str(json.status) || 'pending', amountPaise: Number(json.amount) || input.amountPaise }
    },
  }
}
