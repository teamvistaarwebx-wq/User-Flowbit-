import { badTokenGate, noteBadToken } from '@/lib/bad-token-limit'
import { rateLimit } from '@/lib/rate-limit'
import { requestIp } from '@/lib/request'
import { corsJson, formParams, preflight, publicOrigin } from '@/modules/mcp/http'
import { isBadCredential, parseBasicAuth, token } from '@/modules/mcp/oauth/core'
import { mcpResourceUrl } from '@/modules/mcp/oauth/metadata'
import { mongoOAuthStore } from '@/modules/mcp/oauth/store'
import { stillAllowed } from '@/modules/mcp/session'

export const runtime = 'nodejs'

/** Token endpoint: authorization_code with PKCE (S256), and rotating refresh tokens. */
export async function POST(request: Request) {
  const ip = (await requestIp()) ?? 'unknown'
  const limited = await rateLimit(`oauthToken:${ip}`, 120, 60_000)
  if (!limited.ok) return corsJson({ error: 'slow_down', error_description: 'Too many token requests' }, 429, { 'Retry-After': String(limited.retryAfterSeconds) })
  const blocked = await badTokenGate(ip)
  if (blocked) return corsJson({ error: 'slow_down', error_description: 'Too many bad tokens from this address' }, 429, { 'Retry-After': String(blocked.retryAfterSeconds) })
  const params = await formParams(request)
  if (!params) return corsJson({ error: 'invalid_request', error_description: 'Unreadable body' }, 400)
  const result = await token(mongoOAuthStore, params, parseBasicAuth(request.headers.get('authorization')), { expectedResource: mcpResourceUrl(publicOrigin()), stillAllowed })
  if (!result.ok && isBadCredential(result.error)) await noteBadToken(ip)
  if (!result.ok) return corsJson({ error: result.error, error_description: result.error_description }, result.status, result.status === 401 ? { 'WWW-Authenticate': 'Basic realm="flowbit"' } : {})
  return corsJson(result.body)
}

export const OPTIONS = () => preflight()
