import { SIGNATURE_HEADER, signHeader } from './sign'
import { isRetryable, nextAttemptAfter } from './retry'
import type { Poster } from './http'

/** One delivery attempt: sign, POST, and decide delivered / retry / failed. Pure over an injected poster. */

export type Envelope = Readonly<{ id: string; event: string; created_at: string; workspace: string; data: Record<string, unknown>; test?: boolean }>

export type AttemptOutcome = Readonly<{ status: 'delivered' | 'queued' | 'failed'; attempts: number; nextAttemptAt: Date | null; code: number | null; error: string | null }>

export async function attemptDelivery(envelope: Envelope, previousAttempts: number, endpoint: { url: string; secret: string }, post: Poster, now: Date = new Date()): Promise<AttemptOutcome> {
  const body = JSON.stringify(envelope)
  const attempts = previousAttempts + 1
  const res = await post(endpoint.url, body, {
    [SIGNATURE_HEADER]: signHeader(endpoint.secret, body, Math.floor(now.getTime() / 1000)),
    'X-Flowbit-Event': envelope.event,
    'X-Flowbit-Delivery': envelope.id,
  })
  if (res.status != null && res.status >= 200 && res.status < 300) return { status: 'delivered', attempts, nextAttemptAt: null, code: res.status, error: null }
  const error = res.error ?? `HTTP ${res.status}`
  const next = isRetryable(res.status) ? nextAttemptAfter(attempts, now) : null
  return { status: next ? 'queued' : 'failed', attempts, nextAttemptAt: next, code: res.status, error }
}
