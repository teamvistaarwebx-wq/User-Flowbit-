import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Public document link tokens (pure, node:crypto only). A token is
 * `<key>.<signature>`: the key is 18 random bytes stored on the DocLink row,
 * the signature an HMAC of the key under APP_SECRET. A page checks the
 * signature before it touches the database, then looks the key up; the row
 * decides revoked and expired.
 */

export const DOC_KINDS = ['invoice', 'quote', 'credit_note', 'receipt', 'statement'] as const
export type DocKind = (typeof DOC_KINDS)[number]

export const DOC_KIND_LABELS: Readonly<Record<DocKind, string>> = {
  invoice: 'Invoice',
  quote: 'Quote',
  credit_note: 'Credit note',
  receipt: 'Receipt',
  statement: 'Statement',
}

const KEY_BYTES = 18
const SIG_LENGTH = 22
const KEY_PATTERN = /^[A-Za-z0-9_-]{24}$/

export const newLinkKey = (): string => randomBytes(KEY_BYTES).toString('base64url')

const signatureOf = (key: string, secret: string) => createHmac('sha256', secret).update(`doclink:${key}`).digest('base64url').slice(0, SIG_LENGTH)

export const signLinkToken = (key: string, secret: string): string => `${key}.${signatureOf(key, secret)}`

/** The key inside a well-formed token signed with `secret`, else null. */
export function readLinkToken(token: string | null | undefined, secret: string): string | null {
  const [key, signature, extra] = (token ?? '').split('.')
  if (!key || !signature || extra !== undefined || !KEY_PATTERN.test(key)) return null
  const expected = Buffer.from(signatureOf(key, secret))
  const given = Buffer.from(signature)
  return given.length === expected.length && timingSafeEqual(given, expected) ? key : null
}

export type LinkState = 'active' | 'revoked' | 'expired'

export function linkState(link: { revokedAt?: Date | null; expiresAt?: Date | null }, now: Date): LinkState {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'active'
}

/** One open per link in this window is enough for the timeline; reloads inside it are not counted again. */
export const OPEN_DEBOUNCE_MS = 30 * 60_000

export const shouldRecordOpen = (lastOpenedAt: Date | null | undefined, now: Date): boolean =>
  !lastOpenedAt || now.getTime() - lastOpenedAt.getTime() >= OPEN_DEBOUNCE_MS
