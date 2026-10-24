import { createHash } from 'node:crypto'

/**
 * Replay protection for the inbound task webhook (pure):
 *  - a timestamp, when the sender gives one (`X-Flowbit-Timestamp`, unix
 *    seconds, or the `t=` of a `t=…,v1=…` signature), must be within 5 minutes;
 *  - every accepted request is remembered by its key: the record `id` from
 *    the body (kept 90 days), else an `Idempotency-Key` / `X-Flowbit-Nonce`
 *    header, else the SHA-256 of the body (kept 24 hours). A second request
 *    with a key already seen creates nothing.
 */

export const REPLAY_WINDOW_SECONDS = 300
const DAY_MS = 86_400_000
export const ID_KEEP_MS = 90 * DAY_MS
export const NONCE_KEEP_MS = DAY_MS

export type ReplayHeaders = Readonly<{ get: (name: string) => string | null }>

export type ReplayKey = Readonly<{ key: string; keepMs: number }>

/** The sender's timestamp, from its own header or a Stripe-style signature; null when none was sent. */
export function senderTimestamp(headers: ReplayHeaders): number | null {
  const direct = headers.get('x-flowbit-timestamp')
  const fromSignature = /(?:^|,)\s*t=(\d+)/.exec(headers.get('x-flowbit-signature') ?? '')?.[1]
  const raw = direct ?? fromSignature
  if (raw == null) return null
  const t = Number(raw)
  return Number.isFinite(t) ? t : NaN
}

/** A refusal when the request is outside the time window, else null. */
export function staleRefusal(headers: ReplayHeaders, nowSeconds: number = Math.floor(Date.now() / 1000)): string | null {
  const t = senderTimestamp(headers)
  if (t === null) return null
  if (Number.isNaN(t)) return 'The timestamp header is not a number of seconds.'
  return Math.abs(nowSeconds - t) > REPLAY_WINDOW_SECONDS ? 'The request is older than 5 minutes (or from the future); it was not accepted.' : null
}

/** The key this request is remembered by. */
export function replayKeyOf(raw: string, headers: ReplayHeaders, id: string | undefined): ReplayKey {
  if (id) return { key: `id:${id}`, keepMs: ID_KEEP_MS }
  const nonce = (headers.get('idempotency-key') ?? headers.get('x-flowbit-nonce') ?? '').trim().slice(0, 200)
  if (nonce) return { key: `nonce:${nonce}`, keepMs: NONCE_KEEP_MS }
  return { key: `body:${createHash('sha256').update(raw).digest('hex')}`, keepMs: NONCE_KEEP_MS }
}
