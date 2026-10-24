import { badTokenGate, noteBadToken } from '@/lib/bad-token-limit'
import { requestIp } from '@/lib/request'
import { corsJson, formParams, preflight } from '@/modules/mcp/http'
import { parseBasicAuth, revoke } from '@/modules/mcp/oauth/core'
import { mongoOAuthStore } from '@/modules/mcp/oauth/store'

export const runtime = 'nodejs'

/** Token revocation (RFC 7009): revokes the whole connection. 200 even for unknown tokens, but unknown ones count towards the per-IP bad-token limit. */
export async function POST(request: Request) {
  const ip = (await requestIp()) ?? 'unknown'
  const blocked = await badTokenGate(ip)
  if (blocked) return corsJson({ error: 'slow_down', error_description: 'Too many bad tokens from this address' }, 429, { 'Retry-After': String(blocked.retryAfterSeconds) })
  const params = await formParams(request)
  if (!params) return corsJson({ error: 'invalid_request' }, 400)
  const basic = parseBasicAuth(request.headers.get('authorization'))
  const known = await revoke(mongoOAuthStore, params.token, basic?.id ?? params.client_id ?? null)
  if (!known && params.token) await noteBadToken(ip)
  return corsJson({})
}

export const OPTIONS = () => preflight()
