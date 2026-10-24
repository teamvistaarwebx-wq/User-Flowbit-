import { MCP_SCOPES } from '../scopes'

/**
 * Discovery documents the MCP authorization spec asks for: the protected
 * resource metadata (RFC 9728) of /mcp and the authorization server metadata
 * (RFC 8414) of Flowbit. Pure: pass the public origin (APP_URL).
 */

const trim = (origin: string) => origin.replace(/\/+$/, '')

export const mcpResourceUrl = (origin: string) => `${trim(origin)}/mcp`
export const protectedResourceMetadataUrl = (origin: string) => `${trim(origin)}/.well-known/oauth-protected-resource/mcp`

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [trim(origin)],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Flowbit',
    resource_documentation: `${trim(origin)}/manual`,
  }
}

export function authorizationServerMetadata(origin: string) {
  const base = trim(origin)
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/manual`,
  }
}

/** The WWW-Authenticate header of a 401 from /mcp. */
export function wwwAuthenticate(origin: string, error?: 'invalid_token' | 'insufficient_scope', description?: string): string {
  const parts = [`resource_metadata="${protectedResourceMetadataUrl(origin)}"`]
  if (error) parts.push(`error="${error}"`)
  if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`)
  return `Bearer ${parts.join(', ')}`
}

/** CORS for the discovery, registration, token and MCP endpoints (browser-based MCP clients). */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}
