import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Personal email-to-task addresses: tasks+<workspace-slug>-<token>@<domain>.
 * The token is an HMAC of the member id under APP_SECRET (10 characters), so
 * it cannot be guessed or forged, and changing APP_SECRET rotates every
 * address. Pure.
 */

export const TOKEN_LENGTH = 10

export const memberMailToken = (secret: string, orgId: string, memberId: string) =>
  createHmac('sha256', secret).update(`mail-to-task:${orgId}:${memberId}`).digest('base64url').replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(0, TOKEN_LENGTH)

export const taskAddress = (slug: string, token: string, domain: string) => `tasks+${slug}-${token}@${domain}`

export type ParsedAddress = Readonly<{ slug: string; token: string }>

/** The slug and token of a tasks+…@domain address (any of `to`), or null. */
export function parseTaskAddress(recipients: readonly string[], domain: string): ParsedAddress | null {
  const want = domain.trim().toLowerCase()
  for (const raw of recipients) {
    const email = (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim().toLowerCase()
    const [local, host] = email.split('@')
    if (!local || host !== want) continue
    const m = /^tasks\+([a-z0-9][a-z0-9-]*)-([a-z0-9]{10})$/.exec(local)
    if (m) return { slug: m[1], token: m[2] }
  }
  return null
}

export const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** "Ramesh <ramesh@kalpa.in>" → "ramesh@kalpa.in". */
export const bareEmail = (raw: string) => (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim().toLowerCase()
