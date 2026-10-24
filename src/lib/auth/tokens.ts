import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { serverEnv } from '@/lib/env'

/** 32 random bytes, URL-safe. Sent to the user; only its hash is stored. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** HMAC signature with APP_SECRET, for short-lived values like the OAuth state cookie. */
export const sign = (value: string) => createHmac('sha256', serverEnv().APP_SECRET).update(value).digest('base64url')

export function signed(value: string): string {
  return `${value}.${sign(value)}`
}

export function unsign(signedValue: string | undefined | null): string | null {
  if (!signedValue) return null
  const dot = signedValue.lastIndexOf('.')
  if (dot < 1) return null
  const value = signedValue.slice(0, dot)
  const given = Buffer.from(signedValue.slice(dot + 1))
  const expected = Buffer.from(sign(value))
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null
}
