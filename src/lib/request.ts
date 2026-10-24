import 'server-only'
import { headers } from 'next/headers'

/**
 * Client IP, or 'local'. Safe to call outside a request (returns 'local').
 * Clients can send their own X-Forwarded-For, and proxies append to it, so the
 * left-most entry is attacker-chosen. The right-most entry is the address our
 * own (single) reverse proxy saw, which is the one rate limits can trust.
 */
export async function requestIp(): Promise<string> {
  try {
    const h = await headers()
    const hops = (h.get('x-forwarded-for') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    return hops.at(-1) || h.get('x-real-ip') || 'local'
  } catch {
    return 'local'
  }
}

/** The request's user agent (trimmed to 300 chars), or '' outside a request. */
export async function requestUserAgent(): Promise<string> {
  try {
    return ((await headers()).get('user-agent') ?? '').slice(0, 300)
  } catch {
    return ''
  }
}
