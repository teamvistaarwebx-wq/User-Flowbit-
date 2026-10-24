import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { McpScope } from '../scopes'
import { parseScopes } from '../scopes'
import type { AuthMethod, ClientRegistration } from './clients'
import { redirectUriMatches } from './clients'
import { isCodeChallenge, verifyPkce } from './pkce'

/**
 * Flowbit's OAuth 2.1 authorization server for MCP, as pure logic over an
 * injected store (oauth/store.ts is the MongoDB one; tests use memory).
 * Every secret is random and stored only as its SHA-256: client secrets,
 * codes, access tokens and refresh tokens. Codes are single use (a replay
 * revokes what the code produced, even when the replay races the exchange);
 * refresh tokens rotate on every use and reuse of any token the family ever
 * issued revokes the whole connection.
 */

export const ACCESS_TTL_MS = 60 * 60_000
export const REFRESH_TTL_MS = 30 * 86_400_000
export const CODE_TTL_MS = 5 * 60_000

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const random = (prefix: string, bytes = 32) => `${prefix}${randomBytes(bytes).toString('base64url')}`
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export type ClientRecord = Readonly<{
  clientId: string
  clientName: string
  redirectUris: string[]
  authMethod: AuthMethod
  clientSecretHash: string | null
  createdAt: Date
}>

export type CodeRecord = Readonly<{
  codeHash: string
  clientId: string
  userId: string
  orgId: string
  memberId: string
  scopes: McpScope[]
  redirectUri: string
  codeChallenge: string
  resource: string | null
  expiresAt: Date
  usedAt: Date | null
  grantId: string | null
}>

export type GrantRecord = Readonly<{
  id: string
  orgId: string
  userId: string
  memberId: string
  clientId: string
  clientName: string
  scopes: McpScope[]
  resource: string | null
  accessHash: string
  accessExpiresAt: Date
  refreshHash: string
  refreshExpiresAt: Date
  previousRefreshHash: string | null
  /** The code that started this grant; null for grants made before code families. */
  codeHash?: string | null
  revokedAt: Date | null
}>

export type NewGrant = Omit<GrantRecord, 'id'>
export type TokenPair = Readonly<{ accessHash: string; accessExpiresAt: Date; refreshHash: string; refreshExpiresAt: Date; previousRefreshHash: string | null; scopes: McpScope[] }>

export interface OAuthStore {
  findClient(clientId: string): Promise<ClientRecord | null>
  insertClient(client: ClientRecord): Promise<void>
  insertCode(code: CodeRecord): Promise<void>
  /** Marks the code used if it was unused; returns it with `firstUse` false when it had been used already. */
  claimCode(codeHash: string, now: Date): Promise<{ code: CodeRecord; firstUse: boolean } | null>
  linkCodeToGrant(codeHash: string, grantId: string): Promise<void>
  insertGrant(grant: NewGrant): Promise<string>
  findGrantByAccess(accessHash: string): Promise<GrantRecord | null>
  findGrantByRefresh(refreshHash: string): Promise<GrantRecord | null>
  findGrantByPreviousRefresh(refreshHash: string): Promise<GrantRecord | null>
  /** Replaces the tokens only while `expectRefreshHash` is still current (no double rotation). */
  rotateGrant(id: string, expectRefreshHash: string, next: TokenPair): Promise<boolean>
  revokeGrant(id: string, now: Date): Promise<void>
  /** Marks a code replayed and revokes every grant it started. */
  revokeCodeFamily(codeHash: string, now: Date): Promise<void>
  /** Whether the code was replayed (checked after the grant is stored, to close the race with a parallel replay). */
  codeReplayed(codeHash: string): Promise<boolean>
  /** Adds a newly issued refresh token to the grant's family. */
  rememberRefresh(grant: Pick<GrantRecord, 'id' | 'orgId'>, refreshHash: string, expiresAt: Date): Promise<void>
  /** The grant whose family once issued this refresh token, or null. */
  findGrantIdByIssuedRefresh(refreshHash: string): Promise<string | null>
}

export type OAuthError = Readonly<{ ok: false; status: number; error: string; error_description: string }>
const fail = (status: number, error: string, description: string): OAuthError => ({ ok: false, status, error, error_description: description })

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type RegisteredClient = Readonly<{ client: ClientRecord; clientSecret: string | null }>

export async function registerClient(store: OAuthStore, reg: ClientRegistration, now: Date = new Date()): Promise<RegisteredClient> {
  const clientSecret = reg.authMethod === 'none' ? null : random('fbcs_')
  const client: ClientRecord = {
    clientId: random('fbc_', 18),
    clientName: reg.clientName,
    redirectUris: reg.redirectUris,
    authMethod: reg.authMethod,
    clientSecretHash: clientSecret ? sha256(clientSecret) : null,
    createdAt: now,
  }
  await store.insertClient(client)
  return { client, clientSecret }
}

/** The RFC 7591 response body. */
export function registrationResponse(reg: RegisteredClient, scope: string) {
  const { client, clientSecret } = reg
  return {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: client.authMethod,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope,
  }
}

// ---------------------------------------------------------------------------
// Authorization request (checked before the consent screen, and again on approve)
// ---------------------------------------------------------------------------

export type AuthorizeParams = Readonly<{
  response_type?: string | null
  client_id?: string | null
  redirect_uri?: string | null
  code_challenge?: string | null
  code_challenge_method?: string | null
  scope?: string | null
  state?: string | null
  resource?: string | null
}>

export type AuthorizeRequest = Readonly<{ client: ClientRecord; redirectUri: string; codeChallenge: string; scopes: McpScope[]; state: string | null; resource: string | null }>

/**
 * `fatal`: show the error on Flowbit's page, never redirect (unknown client or
 * redirect URI). `redirect`: send the error back to the client's redirect URI.
 */
export type AuthorizeCheck =
  | Readonly<{ ok: true; request: AuthorizeRequest }>
  | Readonly<{ ok: false; fatal: true; message: string }>
  | Readonly<{ ok: false; fatal: false; redirectTo: string }>

export const sameResource = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null, issuer?: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state) url.searchParams.set('state', state)
  if (issuer) url.searchParams.set('iss', issuer)
  return url.toString()
}

export async function checkAuthorize(store: OAuthStore, p: AuthorizeParams, expectedResource: string): Promise<AuthorizeCheck> {
  const client = p.client_id ? await store.findClient(p.client_id) : null
  if (!client) return { ok: false, fatal: true, message: 'This app is not registered with Flowbit. Start the connection again from the app.' }
  if (!redirectUriMatches(client.redirectUris, p.redirect_uri)) return { ok: false, fatal: true, message: 'The return address does not match what this app registered, so Flowbit stopped here.' }
  const redirectUri = p.redirect_uri as string
  const state = p.state ? String(p.state).slice(0, 1000) : null
  const back = (error: string, description: string): AuthorizeCheck => ({ ok: false, fatal: false, redirectTo: errorRedirect(redirectUri, error, description, state) })
  if (p.response_type !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported')
  if (!p.code_challenge || p.code_challenge_method !== 'S256' || !isCodeChallenge(p.code_challenge)) return back('invalid_request', 'PKCE with code_challenge_method=S256 is required')
  if (p.resource && !sameResource(p.resource, expectedResource)) return back('invalid_target', 'Unknown resource')
  return { ok: true, request: { client, redirectUri, codeChallenge: p.code_challenge, scopes: parseScopes(p.scope), state, resource: p.resource ?? null } }
}

/** Issues a single-use code for the approved request; returns the redirect with code and state. */
export async function issueCode(
  store: OAuthStore,
  req: AuthorizeRequest,
  who: Readonly<{ userId: string; orgId: string; memberId: string; scopes: McpScope[] }>,
  issuer: string,
  now: Date = new Date(),
): Promise<string> {
  const code = random('fbo_')
  await store.insertCode({
    codeHash: sha256(code),
    clientId: req.client.clientId,
    userId: who.userId,
    orgId: who.orgId,
    memberId: who.memberId,
    scopes: who.scopes,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    resource: req.resource,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    usedAt: null,
    grantId: null,
  })
  const url = new URL(req.redirectUri)
  url.searchParams.set('code', code)
  if (req.state) url.searchParams.set('state', req.state)
  url.searchParams.set('iss', issuer)
  return url.toString()
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

export type TokenParams = Readonly<Record<string, string | undefined>>
export type TokenResponse = Readonly<{ ok: true; body: { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string } }>

async function authenticateClient(store: OAuthStore, p: TokenParams, basic: { id: string; secret: string } | null): Promise<ClientRecord | OAuthError> {
  const clientId = basic?.id ?? p.client_id
  const client = clientId ? await store.findClient(clientId) : null
  if (!client) return fail(401, 'invalid_client', 'Unknown client')
  if (client.authMethod === 'none') return client
  const secret = basic?.secret ?? p.client_secret
  if (!secret || !client.clientSecretHash || !sameHash(sha256(secret), client.clientSecretHash)) return fail(401, 'invalid_client', 'Client authentication failed')
  return client
}

function newTokens(scopes: McpScope[], previousRefreshHash: string | null, now: Date): { pair: TokenPair; access: string; refresh: string } {
  const access = random('fba_')
  const refresh = random('fbr_')
  return {
    access,
    refresh,
    pair: { accessHash: sha256(access), accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_MS), refreshHash: sha256(refresh), refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS), previousRefreshHash, scopes },
  }
}

const tokenBody = (access: string, refresh: string, scopes: McpScope[]): TokenResponse => ({
  ok: true,
  body: { access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: scopes.join(' ') },
})

export type TokenContext = Readonly<{
  expectedResource: string
  /** Re-checks the person and workspace at exchange time (still a member, MCP allowed); returns a refusal or null. */
  stillAllowed: (who: { userId: string; orgId: string; memberId: string }) => Promise<string | null>
  now?: Date
}>

async function exchangeCode(store: OAuthStore, client: ClientRecord, p: TokenParams, tc: TokenContext): Promise<TokenResponse | OAuthError> {
  const now = tc.now ?? new Date()
  if (!p.code) return fail(400, 'invalid_request', 'code is required')
  const claimed = await store.claimCode(sha256(p.code), now)
  if (!claimed) return fail(400, 'invalid_grant', 'Unknown code')
  const { code, firstUse } = claimed
  if (!firstUse) {
    await store.revokeCodeFamily(code.codeHash, now)
    if (code.grantId) await store.revokeGrant(code.grantId, now)
    return fail(400, 'invalid_grant', 'This code was already used')
  }
  if (code.clientId !== client.clientId) return fail(400, 'invalid_grant', 'The code belongs to another client')
  if (code.expiresAt.getTime() <= now.getTime()) return fail(400, 'invalid_grant', 'The code has expired')
  if (p.redirect_uri !== code.redirectUri) return fail(400, 'invalid_grant', 'redirect_uri does not match')
  if (!verifyPkce(p.code_verifier, code.codeChallenge)) return fail(400, 'invalid_grant', 'PKCE verification failed')
  const resource = p.resource ?? code.resource
  if (resource && !sameResource(resource, tc.expectedResource)) return fail(400, 'invalid_target', 'Unknown resource')
  const refusal = await tc.stillAllowed(code)
  if (refusal) return fail(400, 'invalid_grant', refusal)
  const { pair, access, refresh } = newTokens(code.scopes, null, now)
  const grantId = await store.insertGrant({
    orgId: code.orgId, userId: code.userId, memberId: code.memberId, clientId: client.clientId, clientName: client.clientName,
    scopes: code.scopes, resource: resource ?? null, accessHash: pair.accessHash, accessExpiresAt: pair.accessExpiresAt,
    refreshHash: pair.refreshHash, refreshExpiresAt: pair.refreshExpiresAt, previousRefreshHash: null, codeHash: code.codeHash, revokedAt: null,
  })
  await store.linkCodeToGrant(code.codeHash, grantId)
  await store.rememberRefresh({ id: grantId, orgId: code.orgId }, pair.refreshHash, pair.refreshExpiresAt)
  if (await store.codeReplayed(code.codeHash)) {
    await store.revokeGrant(grantId, now)
    return fail(400, 'invalid_grant', 'This code was already used')
  }
  return tokenBody(access, refresh, code.scopes)
}

async function refreshTokens(store: OAuthStore, client: ClientRecord, p: TokenParams, tc: TokenContext): Promise<TokenResponse | OAuthError> {
  const now = tc.now ?? new Date()
  if (!p.refresh_token) return fail(400, 'invalid_request', 'refresh_token is required')
  const hash = sha256(p.refresh_token)
  const grant = await store.findGrantByRefresh(hash)
  if (!grant) {
    const reusedId = (await store.findGrantByPreviousRefresh(hash))?.id ?? (await store.findGrantIdByIssuedRefresh(hash))
    if (reusedId) await store.revokeGrant(reusedId, now)
    return fail(400, 'invalid_grant', reusedId ? 'This refresh token was already used; the connection was revoked for safety' : 'Unknown refresh token')
  }
  if (grant.clientId !== client.clientId) return fail(400, 'invalid_grant', 'The token belongs to another client')
  if (grant.revokedAt) return fail(400, 'invalid_grant', 'This connection was revoked')
  if (grant.refreshExpiresAt.getTime() <= now.getTime()) return fail(400, 'invalid_grant', 'The refresh token has expired; connect again')
  const refusal = await tc.stillAllowed(grant)
  if (refusal) return fail(400, 'invalid_grant', refusal)
  const asked = p.scope ? parseScopes(p.scope) : grant.scopes
  if (asked.some((s) => !grant.scopes.includes(s))) return fail(400, 'invalid_scope', 'A refresh cannot add scopes')
  const { pair, access, refresh } = newTokens(asked, hash, now)
  if (!(await store.rotateGrant(grant.id, hash, pair))) {
    // Two uses of one refresh token at once: one of them is not the real client.
    await store.revokeGrant(grant.id, now)
    return fail(400, 'invalid_grant', 'This refresh token was already used; the connection was revoked for safety')
  }
  await store.rememberRefresh(grant, pair.refreshHash, pair.refreshExpiresAt)
  return tokenBody(access, refresh, asked)
}

/** POST /oauth/token: authorization_code (with PKCE) and refresh_token (rotating). */
export async function token(store: OAuthStore, p: TokenParams, basic: { id: string; secret: string } | null, tc: TokenContext): Promise<TokenResponse | OAuthError> {
  const client = await authenticateClient(store, p, basic)
  if ('error' in client) return client
  if (p.grant_type === 'authorization_code') return exchangeCode(store, client, p, tc)
  if (p.grant_type === 'refresh_token') return refreshTokens(store, client, p, tc)
  return fail(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token')
}

/**
 * POST /oauth/revoke (RFC 7009): revokes the connection of an access or
 * refresh token. The endpoint answers "ok" either way; the return value says
 * whether the token was known (unknown ones count towards the per-IP limit).
 */
export async function revoke(store: OAuthStore, tokenValue: string | undefined, clientId: string | null, now: Date = new Date()): Promise<boolean> {
  if (!tokenValue) return false
  const hash = sha256(tokenValue)
  const grant = (await store.findGrantByAccess(hash)) ?? (await store.findGrantByRefresh(hash))
  if (!grant) return false
  if (grant.revokedAt || (clientId && grant.clientId !== clientId)) return true
  await store.revokeGrant(grant.id, now)
  return true
}

/** Token-endpoint errors that mean a bad credential (counted per IP), as opposed to a malformed request. */
export const isBadCredential = (error: string) => error === 'invalid_grant' || error === 'invalid_client'

/** The live grant behind a bearer access token, or null (unknown, expired or revoked). */
export async function verifyAccessToken(store: OAuthStore, bearer: string | null | undefined, now: Date = new Date()): Promise<GrantRecord | null> {
  if (!bearer || !bearer.startsWith('fba_') || bearer.length > 200) return null
  const grant = await store.findGrantByAccess(sha256(bearer))
  if (!grant || grant.revokedAt) return null
  return grant.accessExpiresAt.getTime() > now.getTime() ? grant : null
}

/** "Basic base64(id:secret)" → its parts, or null. */
export function parseBasicAuth(header: string | null | undefined): { id: string; secret: string } | null {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header ?? '')
  if (!match) return null
  const decoded = Buffer.from(match[1], 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon < 1) return null
  try {
    return { id: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) }
  } catch {
    // A malformed %-escape is a bad client credential (invalid_client), not a server error.
    return null
  }
}
