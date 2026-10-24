import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The public link of a Flowbit bill (/bill/<key>.<sig>), pure: the key is 18
 * random bytes stored on the bill, the signature an HMAC under APP_SECRET with
 * its own label, so a workspace document link can never open a bill.
 * Anyone with the link sees the bill and can pay it, like a payment link.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{24}$/
const SIG_LENGTH = 22

export const newBillKey = (): string => randomBytes(18).toString('base64url')

const signatureOf = (key: string, secret: string) => createHmac('sha256', secret).update(`flowbit-bill:${key}`).digest('base64url').slice(0, SIG_LENGTH)

export const signBillToken = (key: string, secret: string): string => `${key}.${signatureOf(key, secret)}`

export function readBillToken(token: string | null | undefined, secret: string): string | null {
  const [key, signature, extra] = (token ?? '').split('.')
  if (!key || !signature || extra !== undefined || !KEY_PATTERN.test(key)) return null
  const expected = Buffer.from(signatureOf(key, secret))
  const given = Buffer.from(signature)
  return given.length === expected.length && timingSafeEqual(given, expected) ? key : null
}
