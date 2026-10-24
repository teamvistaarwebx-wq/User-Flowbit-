import { timingSafeEqual } from 'node:crypto'

/**
 * Checks `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) in
 * constant time. Always false while CRON_SECRET is unset.
 */
export function isCronAuthorised(header: string | null, secret: string): boolean {
  if (!secret) return false
  const given = Buffer.from((header ?? '').replace(/^Bearer\s+/i, '').trim())
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
