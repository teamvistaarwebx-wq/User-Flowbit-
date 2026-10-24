import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signatures for the messaging layer (pure, node:crypto only):
 *   - Resend webhooks are signed the Svix way: HMAC-SHA256 over
 *     `${svix-id}.${svix-timestamp}.${body}` with the base64 key after
 *     `whsec_`, sent as space-separated `v1,<base64>` entries.
 *   - Unsubscribe links carry `<payload>.<hmac>` signed with APP_SECRET.
 */

/** Svix refuses deliveries older or newer than five minutes (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export type WebhookHeaders = Readonly<{ id: string | null; timestamp: string | null; signature: string | null }>

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The base64 signature Svix would send for this delivery. */
export function svixSignature(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
}

/** True when the delivery is signed with `secret` and its timestamp is within the tolerance of `now`. */
export function verifyResendWebhook(body: string, headers: WebhookHeaders, secret: string, now: Date = new Date()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false
  const sentAt = Number(headers.timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(now.getTime() / 1000 - sentAt) > WEBHOOK_TOLERANCE_SECONDS) return false
  const expected = svixSignature(secret, headers.id, headers.timestamp, body)
  return headers.signature
    .split(' ')
    .map((entry) => entry.split(','))
    .some(([version, signature]) => version === 'v1' && Boolean(signature) && safeEqual(signature, expected))
}

/** What an unsubscribe link stands for: one address, one workspace's non-essential mail. */
export type UnsubscribeClaim = Readonly<{ orgId: string; email: string }>

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`unsubscribe:${payload}`).digest('base64url')

/** `<base64url(orgId|email)>.<hmac>`: no expiry, so old emails keep working. */
export function unsubscribeToken(claim: UnsubscribeClaim, secret: string): string {
  const payload = Buffer.from(`${claim.orgId}|${claim.email.toLowerCase()}`).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** The claim inside a token, or null when it is malformed or not signed with `secret`. */
export function readUnsubscribeToken(token: string, secret: string): UnsubscribeClaim | null {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined || !safeEqual(signature, sign(payload, secret))) return null
  const [orgId, email] = Buffer.from(payload, 'base64url').toString('utf8').split('|')
  if (!/^[a-f0-9]{24}$/.test(orgId ?? '') || !email?.includes('@')) return null
  return { orgId, email }
}
