import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Razorpay signature checks (HMAC-SHA256, hex). Pure, no network.
 * Subscriptions sign `payment_id|subscription_id`; orders sign
 * `order_id|payment_id`; webhooks sign the raw request body.
 */

const hmacHex = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('hex')

function safeEqualHex(expected: string, given: string): boolean {
  if (!/^[0-9a-f]+$/i.test(given) || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'))
}

export function verifyCheckoutSignature(input: { paymentId: string; subscriptionId: string; signature: string }, secret: string): boolean {
  return safeEqualHex(hmacHex(`${input.paymentId}|${input.subscriptionId}`, secret), input.signature)
}

export function verifyOrderSignature(input: { orderId: string; paymentId: string; signature: string }, secret: string): boolean {
  return safeEqualHex(hmacHex(`${input.orderId}|${input.paymentId}`, secret), input.signature)
}

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  return Boolean(secret) && safeEqualHex(hmacHex(rawBody, secret), signature)
}
