import { isRateLimited, RATE_LIMITS, rateLimit, type RateLimitResult } from './rate-limit'

/**
 * Per-IP limit on bad credentials at the MCP and OAuth endpoints (/mcp,
 * /oauth/token, /oauth/revoke): each refusal of a bad token counts, and an IP
 * over the limit is refused before any token lookup until the window ends.
 * Good tokens never count.
 */

const key = (ip: string) => `badToken:${ip || 'unknown'}`

/** The refusal for an IP already over the limit, or null to go on. Counts nothing. */
export async function badTokenGate(ip: string): Promise<RateLimitResult | null> {
  const { limit, windowMs } = RATE_LIMITS.badToken
  const state = await isRateLimited(key(ip), limit, windowMs)
  return state.ok ? null : state
}

/** Counts one bad token from this IP. */
export async function noteBadToken(ip: string): Promise<RateLimitResult> {
  const { limit, windowMs } = RATE_LIMITS.badToken
  return rateLimit(key(ip), limit, windowMs)
}
