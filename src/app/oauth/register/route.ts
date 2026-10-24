import { rateLimit } from '@/lib/rate-limit'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { requestIp } from '@/lib/request'
import { corsJson, preflight } from '@/modules/mcp/http'
import { isRegistrationError, parseRegistration } from '@/modules/mcp/oauth/clients'
import { registerClient, registrationResponse } from '@/modules/mcp/oauth/core'
import { mongoOAuthStore } from '@/modules/mcp/oauth/store'
import { MCP_SCOPES } from '@/modules/mcp/scopes'

export const runtime = 'nodejs'

/** Dynamic client registration (RFC 7591): Claude and ChatGPT register themselves here. 20 a day per IP. */
export async function POST(request: Request) {
  const ip = (await requestIp()) ?? 'unknown'
  const limited = await rateLimit(`oauthRegister:${ip}`, 20, 24 * 60 * 60_000)
  if (!limited.ok) return corsJson({ error: 'temporarily_unavailable', error_description: 'Too many registrations from this address' }, 429, { 'Retry-After': String(limited.retryAfterSeconds) })
  const raw = await readBodyLimited(request, BODY_LIMITS.oauthRegister)
  if (raw === null) return corsJson({ error: 'invalid_client_metadata', error_description: 'Body too large' }, 413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return corsJson({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, 400)
  }
  const reg = parseRegistration(body)
  if (isRegistrationError(reg)) return corsJson(reg, 400)
  const registered = await registerClient(mongoOAuthStore, reg)
  return corsJson(registrationResponse(registered, MCP_SCOPES.join(' ')), 201)
}

export const OPTIONS = () => preflight()
