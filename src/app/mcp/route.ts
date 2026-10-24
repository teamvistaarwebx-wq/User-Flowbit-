import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { badTokenGate, noteBadToken } from '@/lib/bad-token-limit'
import { requestIp } from '@/lib/request'
import { corsJson, preflight, publicOrigin } from '@/modules/mcp/http'
import { mongoLimitStore } from '@/modules/mcp/limit-store'
import { requestRefusal } from '@/modules/mcp/limits'
import { CORS_HEADERS, wwwAuthenticate } from '@/modules/mcp/oauth/metadata'
import { verifyAccessToken } from '@/modules/mcp/oauth/core'
import { mongoOAuthStore } from '@/modules/mcp/oauth/store'
import { buildMcpServer } from '@/modules/mcp/server'
import { sessionForGrant, touchGrant } from '@/modules/mcp/session'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Flowbit's remote MCP server (Streamable HTTP, stateless JSON responses, so
 * it runs on serverless functions). Bearer tokens come from Flowbit's own
 * OAuth server; a missing or bad token gets 401 with WWW-Authenticate
 * pointing at the protected resource metadata, as the MCP spec requires.
 */

const rpcError = (status: number, message: string, extra: Record<string, string> = {}) => corsJson({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }, status, extra)

export async function POST(request: Request): Promise<Response> {
  const origin = publicOrigin()
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!bearer) return rpcError(401, 'Sign in to Flowbit to use this connector.', { 'WWW-Authenticate': wwwAuthenticate(origin) })
  const ip = (await requestIp()) ?? 'unknown'
  const blocked = await badTokenGate(ip)
  if (blocked) return rpcError(429, 'Too many invalid tokens from this address. Try again later.', { 'Retry-After': String(blocked.retryAfterSeconds) })
  const grant = await verifyAccessToken(mongoOAuthStore, bearer)
  if (!grant) await noteBadToken(ip)
  if (!grant) return rpcError(401, 'The access token is invalid or expired.', { 'WWW-Authenticate': wwwAuthenticate(origin, 'invalid_token', 'The access token is invalid or expired') })
  const limited = await requestRefusal(mongoLimitStore, grant.id)
  if (limited) return rpcError(429, limited.message, { 'Retry-After': String(limited.retryAfterSeconds) })
  const result = await sessionForGrant(grant)
  if (!result.ok) return rpcError(403, result.reason)
  void touchGrant(grant.id)
  const server = buildMcpServer(result.session, { limits: mongoLimitStore })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  const response = await transport.handleRequest(request, { authInfo: { token: bearer, clientId: grant.clientId, scopes: [...grant.scopes], expiresAt: Math.floor(grant.accessExpiresAt.getTime() / 1000) } })
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}

/** No server-initiated stream on a stateless server (the spec allows 405 here). */
const notAllowed = () => new Response(null, { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' } })
export const GET = notAllowed
export const DELETE = notAllowed
export const OPTIONS = () => preflight()
