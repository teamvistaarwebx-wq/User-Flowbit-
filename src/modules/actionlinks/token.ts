import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ACTION_LINK_DAYS, isActionChoice, needsSignIn, type ActionChoice } from './kinds'

/**
 * Signed one-time action links (pure, node:crypto only), the same scheme as
 * public document links: `<key>.<signature>`, an 18-byte random key and an
 * HMAC of it under APP_SECRET. The database keeps only a SHA-256 of the key,
 * so a read of the collection cannot rebuild a working link. The signature is
 * checked (timing-safe) before any lookup, so links cannot be probed.
 */

const KEY_BYTES = 18
const SIG_LENGTH = 22
const KEY_PATTERN = /^[A-Za-z0-9_-]{24}$/

export const newActionKey = (): string => randomBytes(KEY_BYTES).toString('base64url')

const signatureOf = (key: string, secret: string) => createHmac('sha256', secret).update(`actionlink:${key}`).digest('base64url').slice(0, SIG_LENGTH)

export const signActionToken = (key: string, secret: string): string => `${key}.${signatureOf(key, secret)}`

/** The key inside a well-formed token signed with `secret`, else null. */
export function readActionToken(token: string | null | undefined, secret: string): string | null {
  const [key, signature, extra] = (token ?? '').trim().split('.')
  if (!key || !signature || extra !== undefined || !KEY_PATTERN.test(key)) return null
  const expected = Buffer.from(signatureOf(key, secret))
  const given = Buffer.from(signature)
  return given.length === expected.length && timingSafeEqual(given, expected) ? key : null
}

/** What the database stores in place of the key. */
export const hashActionKey = (key: string): string => createHash('sha256').update(key).digest('hex')

/** Links work for 7 days; a decision taken later belongs in the app. */
export const ACTION_LINK_TTL_MS = ACTION_LINK_DAYS * 24 * 3_600_000
/** A claim older than this was cut off mid-run (a crash): the link may be used again. */
export const CLAIM_STALE_MS = 2 * 60_000

export type ActionTokenState = Readonly<{
  orgId: string
  expiresAt: Date
  usedAt?: Date | null
  claimedAt?: Date | null
  userId: string
  phone?: string | null
  choices: readonly string[]
  /** The kind of request; money and bank kinds need a signed-in viewer (kinds.ts SIGN_IN_KINDS). */
  kind?: string
}>

/** Who is using the link: a signed-in user, or a WhatsApp number writing to a workspace's own number. */
export type Viewer = Readonly<{ userId?: string | null; phone?: string | null; orgId?: string | null }>

export type LinkProblem = 'expired' | 'used' | 'busy' | 'wrong_user' | 'sign_in' | 'wrong_choice'

/**
 * Why this link cannot be used now by this viewer for this choice, or null.
 * A signed-in viewer must be the person it was sent to; a WhatsApp reply must
 * come from the number it was sent to. Money and bank kinds need that person
 * signed in: holding the link is not enough.
 */
export function linkProblem(row: ActionTokenState, viewer: Viewer, choice: string, now: Date): LinkProblem | null {
  if (row.usedAt) return 'used'
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (row.claimedAt && now.getTime() - row.claimedAt.getTime() < CLAIM_STALE_MS) return 'busy'
  if (viewer.userId && viewer.userId !== row.userId) return 'wrong_user'
  if (viewer.orgId && viewer.orgId !== row.orgId) return 'wrong_user'
  if (row.phone && viewer.phone !== undefined && viewer.phone !== row.phone) return 'wrong_user'
  if (needsSignIn(row.kind) && !viewer.userId) return 'sign_in'
  if (!row.choices.includes(choice)) return 'wrong_choice'
  return null
}

export const LINK_PROBLEM_TEXT: Readonly<Record<LinkProblem | 'invalid', string>> = {
  invalid: 'This link is not valid. Open the request in Flowbit instead.',
  expired: 'This link has expired. Open the request in Flowbit to decide it.',
  used: 'This link has already been used. Open Flowbit to see what was decided.',
  busy: 'This link is being used right now. Wait a moment and refresh.',
  wrong_user: 'This link was sent to someone else, so it cannot be used from here.',
  sign_in: 'Decisions about money and bank accounts need you signed in to Flowbit. Sign in as the person this was sent to, then open the link again.',
  wrong_choice: 'That option is not available for this request.',
}

// ---------------------------------------------------------------------------
// WhatsApp quick-reply payloads
// ---------------------------------------------------------------------------

/**
 * What a quick-reply button carries back to the webhook (Interakt
 * `buttonPayload`): an action link and the choice ('fb1:approve:<token>'), a
 * quote to accept or an invoice the client says is paid (both by their
 * public document token).
 */
export type QuickReply =
  | Readonly<{ type: 'action'; choice: ActionChoice; token: string }>
  | Readonly<{ type: 'quote_accept'; docToken: string }>
  | Readonly<{ type: 'invoice_paid'; docToken: string }>

const PREFIX = 'fb1'
const TOKEN = /^[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{22}$/

export const actionPayload = (choice: ActionChoice, token: string): string => `${PREFIX}:${choice}:${token}`
export const quoteAcceptPayload = (docToken: string): string => `${PREFIX}:quote:${docToken}`
export const invoicePaidPayload = (docToken: string): string => `${PREFIX}:paid:${docToken}`

/** The action a button payload stands for, or null for anything else (an old button, a stranger's text). */
export function parseQuickReply(payload: string | null | undefined): QuickReply | null {
  const [prefix, verb, token, extra] = (payload ?? '').trim().split(':')
  if (prefix !== PREFIX || !verb || !token || extra !== undefined || !TOKEN.test(token)) return null
  if (verb === 'quote') return { type: 'quote_accept', docToken: token }
  if (verb === 'paid') return { type: 'invoice_paid', docToken: token }
  return isActionChoice(verb) ? { type: 'action', choice: verb, token } : null
}
