import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Webhook signatures, Stripe-style: `X-Flowbit-Signature: t=<unix>,v1=<hex>`
 * where v1 = HMAC-SHA256(secret, `${t}.${body}`). The receiver recomputes it
 * and refuses timestamps older than 5 minutes (replays). Pure.
 */

export const SIGNATURE_HEADER = 'X-Flowbit-Signature'
export const TOLERANCE_SECONDS = 300

export const signatureOf = (secret: string, body: string, t: number) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')

export const signHeader = (secret: string, body: string, t: number = Math.floor(Date.now() / 1000)) => `t=${t},v1=${signatureOf(secret, body, t)}`

/** True when `header` signs `body` with `secret` within the tolerance. */
export function verifySignature(secret: string, body: string, header: string | null | undefined, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries((header ?? '').split(',').map((p) => p.trim().split('=') as [string, string]))
  const t = Number(parts.t)
  const given = parts.v1 ?? ''
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/.test(given) || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false
  const expected = Buffer.from(signatureOf(secret, body, t))
  const actual = Buffer.from(given)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
