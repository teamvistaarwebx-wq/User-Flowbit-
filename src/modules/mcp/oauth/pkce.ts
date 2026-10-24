import { createHash, timingSafeEqual } from 'node:crypto'

/** PKCE (RFC 7636), S256 only: OAuth 2.1 and the MCP spec forbid `plain`. */

/** 43–128 characters of [A-Z a-z 0-9 - . _ ~]. */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/
/** base64url of a SHA-256 digest: 43 characters. */
const CHALLENGE = /^[A-Za-z0-9\-_]{43}$/

export const isCodeVerifier = (value: unknown): value is string => typeof value === 'string' && VERIFIER.test(value)
export const isCodeChallenge = (value: unknown): value is string => typeof value === 'string' && CHALLENGE.test(value)

export const challengeFor = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

/** True when `verifier` hashes to `challenge` (constant time). */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (!isCodeVerifier(verifier) || !isCodeChallenge(challenge)) return false
  const a = Buffer.from(challengeFor(verifier))
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}
