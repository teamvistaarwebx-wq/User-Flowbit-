import { z } from 'zod'

/**
 * Dynamic client registration (RFC 7591) as Claude and ChatGPT use it: a
 * public client (PKCE, no secret) or a confidential one (client_secret_post /
 * _basic). Redirect URIs must be https, or http on a loopback host for local
 * tools; never a fragment, never a wildcard, and they are matched exactly.
 */

export const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

export const MAX_REDIRECT_URIS = 10
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i

/** Why a redirect URI cannot be registered, or null. */
export function redirectUriProblem(raw: string): string | null {
  if (raw.length > 2000) return 'redirect_uri is too long'
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'redirect_uri must be an absolute URL'
  }
  if (url.hash || raw.includes('#')) return 'redirect_uri must not have a fragment'
  if (url.username || url.password) return 'redirect_uri must not carry credentials'
  if (raw.includes('*')) return 'redirect_uri must not contain wildcards'
  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:' && LOOPBACK.test(url.hostname)) return null
  return 'redirect_uri must use https (http only for localhost)'
}

/** Exact, character-for-character match against the registered list (OAuth 2.1 §2.3.1). */
export const redirectUriMatches = (registered: readonly string[], given: string | null | undefined): boolean => typeof given === 'string' && registered.includes(given)

const metadataSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(MAX_REDIRECT_URIS),
  client_name: z.string().trim().max(100).optional(),
  client_uri: z.string().url().max(500).optional(),
  logo_uri: z.string().url().max(500).optional(),
  token_endpoint_auth_method: z.enum(AUTH_METHODS).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().max(500).optional(),
  software_id: z.string().max(200).optional(),
  software_version: z.string().max(100).optional(),
})

export type ClientRegistration = Readonly<{
  redirectUris: string[]
  clientName: string
  clientUri: string | null
  logoUri: string | null
  authMethod: AuthMethod
  grantTypes: string[]
  scope: string
  softwareId: string | null
}>

export type RegistrationError = Readonly<{ error: 'invalid_redirect_uri' | 'invalid_client_metadata'; error_description: string }>

/** Validated registration, or the RFC 7591 error body. */
export function parseRegistration(body: unknown): ClientRegistration | RegistrationError {
  const parsed = metadataSchema.safeParse(body)
  if (!parsed.success) return { error: 'invalid_client_metadata', error_description: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') }
  const m = parsed.data
  for (const uri of m.redirect_uris) {
    const problem = redirectUriProblem(uri)
    if (problem) return { error: 'invalid_redirect_uri', error_description: `${problem}: ${uri.slice(0, 200)}` }
  }
  const grantTypes = m.grant_types ?? ['authorization_code', 'refresh_token']
  const unsupported = grantTypes.find((g) => g !== 'authorization_code' && g !== 'refresh_token')
  if (unsupported) return { error: 'invalid_client_metadata', error_description: `grant type ${unsupported} is not supported` }
  if (!grantTypes.includes('authorization_code')) return { error: 'invalid_client_metadata', error_description: 'authorization_code is required' }
  if (m.response_types && m.response_types.some((r) => r !== 'code')) return { error: 'invalid_client_metadata', error_description: 'only the code response type is supported' }
  return {
    redirectUris: [...new Set(m.redirect_uris)],
    clientName: (m.client_name || 'AI app').replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 100) || 'AI app',
    clientUri: m.client_uri ?? null,
    logoUri: m.logo_uri ?? null,
    authMethod: m.token_endpoint_auth_method ?? 'none',
    grantTypes,
    scope: m.scope ?? '',
    softwareId: m.software_id ?? null,
  }
}

export const isRegistrationError = (value: ClientRegistration | RegistrationError): value is RegistrationError => 'error' in value
