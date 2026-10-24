import { PROVIDER_TIMEOUT_MS } from '@/lib/fetch-timeout'
/**
 * Razorpay Payment Links over fetch, with the workspace's own keys (no SDK,
 * no module state: tests pass a mock `fetch`). POST /v1/payment_links takes
 * the amount in paise and a `reference_id` unique per Razorpay account.
 */

export type RazorpayCredentials = Readonly<{ keyId: string; keySecret: string }>

export type CreateLinkInput = Readonly<{
  amountPaise: number
  /** The invoice number (a re-created link adds "-2", "-3": Razorpay refuses a reference twice). */
  referenceId: string
  description: string
  customer?: Readonly<{ name?: string; email?: string; contact?: string }>
  /** Read back by the webhook: which workspace and invoice the money is for. */
  notes: Readonly<Record<string, string>>
  /** Seconds since epoch; Razorpay wants it at least 15 minutes ahead. */
  expireBy?: number
}>

export type RazorpayLink = Readonly<{ id: string; shortUrl: string; status: string; referenceId: string; amountPaise: number }>

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export const RAZORPAY_API = 'https://api.razorpay.com/v1'

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'RazorpayError'
  }
}

const authHeader = (creds: RazorpayCredentials) => `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`

type LinkJson = { id?: string; short_url?: string; status?: string; reference_id?: string; amount?: number; error?: { description?: string } }

async function call(fetchFn: FetchLike, creds: RazorpayCredentials, method: string, path: string, body?: unknown): Promise<LinkJson> {
  const res = await fetchFn(`${RAZORPAY_API}${path}`, {
    method,
    headers: { authorization: authHeader(creds), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  const json = ((await res.json().catch(() => ({}))) ?? {}) as LinkJson
  if (!res.ok) throw new RazorpayError(json.error?.description ?? `Razorpay answered HTTP ${res.status}`, res.status)
  return json
}

const toLink = (json: LinkJson): RazorpayLink => {
  if (!json.id || !json.short_url) throw new RazorpayError('Razorpay did not return a payment link.', 502)
  return { id: json.id, shortUrl: json.short_url, status: json.status ?? 'created', referenceId: json.reference_id ?? '', amountPaise: json.amount ?? 0 }
}

/** The request body Razorpay expects (exported for the test). */
export function paymentLinkBody(input: CreateLinkInput): Record<string, unknown> {
  const customer = input.customer && Object.values(input.customer).some(Boolean) ? Object.fromEntries(Object.entries(input.customer).filter(([, v]) => Boolean(v))) : undefined
  return {
    amount: input.amountPaise,
    currency: 'INR',
    accept_partial: false,
    reference_id: input.referenceId.slice(0, 40),
    description: input.description.slice(0, 2048),
    ...(customer ? { customer } : {}),
    // Flowbit sends its own emails (and the thank-you); Razorpay stays quiet.
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: input.notes,
    ...(input.expireBy ? { expire_by: input.expireBy } : {}),
  }
}

export async function createPaymentLink(fetchFn: FetchLike, creds: RazorpayCredentials, input: CreateLinkInput): Promise<RazorpayLink> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) throw new RazorpayError('A payment link needs at least ₹1.', 400)
  return toLink(await call(fetchFn, creds, 'POST', '/payment_links', paymentLinkBody(input)))
}

export async function cancelPaymentLink(fetchFn: FetchLike, creds: RazorpayCredentials, linkId: string): Promise<void> {
  await call(fetchFn, creds, 'POST', `/payment_links/${encodeURIComponent(linkId)}/cancel`)
}
