import { describe, expect, it } from 'vitest'
import { parseRegistration, isRegistrationError, redirectUriProblem, type ClientRegistration } from './clients'
import { checkAuthorize, issueCode, parseBasicAuth, registerClient, revoke, token, verifyAccessToken, type AuthorizeRequest } from './core'
import { memoryOAuthStore } from './memory-store'
import { authorizationServerMetadata, protectedResourceMetadata, wwwAuthenticate } from './metadata'
import { challengeFor, verifyPkce } from './pkce'

const ORIGIN = 'https://app.flowbit.test'
const RESOURCE = `${ORIGIN}/mcp`
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'a'.repeat(20) + 'B'.repeat(20) + '-._~123'
const who = { userId: 'u1', orgId: 'o1', memberId: 'm1', scopes: ['work.read', 'work.write'] as const }
const allowed = { expectedResource: RESOURCE, stillAllowed: async () => null }

function reg(overrides: Record<string, unknown> = {}): ClientRegistration {
  const parsed = parseRegistration({ client_name: 'Claude', redirect_uris: [CALLBACK], ...overrides })
  if (isRegistrationError(parsed)) throw new Error(parsed.error_description)
  return parsed
}

async function setup(overrides: Record<string, unknown> = {}) {
  const store = memoryOAuthStore()
  const registered = await registerClient(store, reg(overrides))
  return { store, ...registered }
}

async function codeFor(store: ReturnType<typeof memoryOAuthStore>, clientId: string, challenge = challengeFor(VERIFIER)) {
  const check = await checkAuthorize(store, { response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', scope: 'work.read work.write', state: 'xyz', resource: RESOURCE }, RESOURCE)
  if (!check.ok) throw new Error('authorize failed')
  const url = new URL(await issueCode(store, check.request as AuthorizeRequest, { ...who, scopes: [...who.scopes] }, ORIGIN))
  return { code: url.searchParams.get('code')!, url }
}

describe('dynamic client registration', () => {
  it('registers a public client with exact redirect URIs and no secret', async () => {
    const { client, clientSecret } = await setup()
    expect(client.clientId).toMatch(/^fbc_/)
    expect(clientSecret).toBeNull()
    expect(client.redirectUris).toEqual([CALLBACK])
  })

  it('returns a secret once for confidential clients and stores only its hash', async () => {
    const { store, clientSecret } = await setup({ token_endpoint_auth_method: 'client_secret_post' })
    expect(clientSecret).toMatch(/^fbcs_/)
    expect(JSON.stringify(store.clients)).not.toContain(clientSecret!)
  })

  it('refuses unsafe redirect URIs', () => {
    expect(redirectUriProblem('http://evil.example/cb')).toMatch(/https/)
    expect(redirectUriProblem('https://x.example/cb#frag')).toMatch(/fragment/)
    expect(redirectUriProblem('https://*.example/cb')).toMatch(/wildcard/)
    expect(redirectUriProblem('http://localhost:6274/cb')).toBeNull()
    expect(isRegistrationError(parseRegistration({ redirect_uris: ['javascript:alert(1)'] }))).toBe(true)
    expect(isRegistrationError(parseRegistration({ redirect_uris: [CALLBACK], grant_types: ['client_credentials'] }))).toBe(true)
  })
})

describe('authorization request', () => {
  it('never redirects to an unregistered or slightly different redirect URI', async () => {
    const { store, client } = await setup()
    const base = { response_type: 'code', client_id: client.clientId, code_challenge: challengeFor(VERIFIER), code_challenge_method: 'S256' }
    for (const redirect_uri of [`${CALLBACK}/`, `${CALLBACK}?x=1`, 'https://claude.ai.evil.com/api/mcp/auth_callback']) {
      const check = await checkAuthorize(store, { ...base, redirect_uri }, RESOURCE)
      expect(check).toMatchObject({ ok: false, fatal: true })
    }
    expect(await checkAuthorize(store, { ...base, client_id: 'nope', redirect_uri: CALLBACK }, RESOURCE)).toMatchObject({ ok: false, fatal: true })
  })

  it('requires PKCE S256', async () => {
    const { store, client } = await setup()
    const plain = await checkAuthorize(store, { response_type: 'code', client_id: client.clientId, redirect_uri: CALLBACK, code_challenge: VERIFIER, code_challenge_method: 'plain', state: 's' }, RESOURCE)
    expect(plain.ok).toBe(false)
    if (!plain.ok && !plain.fatal) {
      expect(plain.redirectTo).toContain('error=invalid_request')
      expect(plain.redirectTo).toContain('state=s')
    }
    const none = await checkAuthorize(store, { response_type: 'code', client_id: client.clientId, redirect_uri: CALLBACK }, RESOURCE)
    expect(none.ok).toBe(false)
  })

  it('verifies PKCE verifiers against S256 challenges', () => {
    expect(verifyPkce(VERIFIER, challengeFor(VERIFIER))).toBe(true)
    expect(verifyPkce(`${VERIFIER}x`, challengeFor(VERIFIER))).toBe(false)
    expect(verifyPkce('short', challengeFor('short'))).toBe(false)
  })
})

describe('code exchange', () => {
  it('exchanges a code once, with the verifier and the same redirect URI', async () => {
    const { store, client } = await setup()
    const { code, url } = await codeFor(store, client.clientId)
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('iss')).toBe(ORIGIN)
    const res = await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code, redirect_uri: CALLBACK, code_verifier: VERIFIER, resource: RESOURCE }, null, allowed)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.body.access_token).toMatch(/^fba_/)
    expect(res.body.scope).toBe('work.read work.write')
    // Stored hashed only.
    expect(JSON.stringify(store.grants)).not.toContain(res.body.access_token)
    expect(JSON.stringify(store.grants)).not.toContain(res.body.refresh_token)
    expect(await verifyAccessToken(store, res.body.access_token)).toMatchObject({ orgId: 'o1', memberId: 'm1' })
  })

  it('refuses a wrong verifier, a wrong redirect URI and a replayed code (which revokes the grant)', async () => {
    const { store, client } = await setup()
    const a = await codeFor(store, client.clientId)
    expect(await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code: a.code, redirect_uri: CALLBACK, code_verifier: `${VERIFIER}zz` }, null, allowed)).toMatchObject({ ok: false, error: 'invalid_grant' })
    const b = await codeFor(store, client.clientId)
    expect(await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code: b.code, redirect_uri: 'https://other.example/cb', code_verifier: VERIFIER }, null, allowed)).toMatchObject({ ok: false, error: 'invalid_grant' })
    const c = await codeFor(store, client.clientId)
    const first = await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code: c.code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, null, allowed)
    expect(first.ok).toBe(true)
    const replay = await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code: c.code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, null, allowed)
    expect(replay).toMatchObject({ ok: false, error: 'invalid_grant' })
    if (first.ok) expect(await verifyAccessToken(store, first.body.access_token)).toBeNull()
  })

  it('refuses an expired code and a code for another client', async () => {
    const { store, client } = await setup()
    const other = await registerClient(store, reg({ client_name: 'ChatGPT' }))
    const { code } = await codeFor(store, client.clientId)
    expect(await token(store, { grant_type: 'authorization_code', client_id: other.client.clientId, code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, null, allowed)).toMatchObject({ ok: false })
    const late = await codeFor(store, client.clientId)
    const future = new Date(Date.now() + 10 * 60_000)
    expect(await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code: late.code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, null, { ...allowed, now: future })).toMatchObject({ ok: false, error: 'invalid_grant' })
  })

  it('authenticates confidential clients (post and basic)', async () => {
    const { store, client, clientSecret } = await setup({ token_endpoint_auth_method: 'client_secret_basic' })
    const { code } = await codeFor(store, client.clientId)
    const params = { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: VERIFIER }
    expect(await token(store, { ...params, client_id: client.clientId, client_secret: 'wrong' }, null, allowed)).toMatchObject({ ok: false, error: 'invalid_client' })
    const basic = parseBasicAuth(`Basic ${Buffer.from(`${client.clientId}:${clientSecret}`).toString('base64')}`)
    expect((await token(store, params, basic, allowed)).ok).toBe(true)
  })

  it('refuses when the person lost access between consent and exchange', async () => {
    const { store, client } = await setup()
    const { code } = await codeFor(store, client.clientId)
    const res = await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, null, { ...allowed, stillAllowed: async () => 'MCP is off for this workspace' })
    expect(res).toMatchObject({ ok: false, error_description: 'MCP is off for this workspace' })
  })
})

describe('refresh rotation and revocation', () => {
  async function connected() {
    const { store, client } = await setup()
    const { code } = await codeFor(store, client.clientId)
    const res = await token(store, { grant_type: 'authorization_code', client_id: client.clientId, code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, null, allowed)
    if (!res.ok) throw new Error('exchange failed')
    return { store, client, tokens: res.body }
  }

  it('rotates the refresh token and invalidates the old access token', async () => {
    const { store, client, tokens } = await connected()
    const next = await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token }, null, allowed)
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.body.refresh_token).not.toBe(tokens.refresh_token)
    expect(await verifyAccessToken(store, tokens.access_token)).toBeNull()
    expect(await verifyAccessToken(store, next.body.access_token)).not.toBeNull()
  })

  it('treats reuse of a rotated refresh token as theft and revokes the connection', async () => {
    const { store, client, tokens } = await connected()
    const next = await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token }, null, allowed)
    const reuse = await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token }, null, allowed)
    expect(reuse).toMatchObject({ ok: false, error: 'invalid_grant' })
    if (next.ok) expect(await verifyAccessToken(store, next.body.access_token)).toBeNull()
  })

  it('revokes the whole family when a refresh token from two rotations ago comes back (L5)', async () => {
    const { store, client, tokens } = await connected()
    const second = await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token }, null, allowed)
    if (!second.ok) throw new Error('refresh failed')
    const third = await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: second.body.refresh_token }, null, allowed)
    if (!third.ok) throw new Error('refresh failed')
    expect(store.issued.size).toBe(3)
    const reuse = await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token }, null, allowed)
    expect(reuse).toMatchObject({ ok: false, error: 'invalid_grant', error_description: expect.stringMatching(/revoked/) })
    expect(await verifyAccessToken(store, third.body.access_token)).toBeNull()
    expect(await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: third.body.refresh_token }, null, allowed)).toMatchObject({ ok: false })
  })

  it('revokes the grant when a code replay races the exchange, before the grant is linked (L5)', async () => {
    const { store, client } = await setup()
    const { code } = await codeFor(store, client.clientId)
    const params = { grant_type: 'authorization_code', client_id: client.clientId, code, redirect_uri: CALLBACK, code_verifier: VERIFIER }
    const insert = store.insertGrant
    store.insertGrant = async (g) => {
      // The attacker's copy of the code arrives while the real exchange is between claim and link.
      expect(await token(store, params, null, allowed)).toMatchObject({ ok: false, error: 'invalid_grant' })
      return insert(g)
    }
    const first = await token(store, params, null, allowed)
    expect(first).toMatchObject({ ok: false, error: 'invalid_grant' })
    expect(store.grants).toHaveLength(1)
    expect(store.grants[0].revokedAt).not.toBeNull()
  })

  it('cannot widen scopes on refresh', async () => {
    const { store, client, tokens } = await connected()
    expect(await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token, scope: 'work.read folio.draft' }, null, allowed)).toMatchObject({ ok: false, error: 'invalid_scope' })
  })

  it('revokes by access or refresh token and ignores unknown tokens', async () => {
    const { store, client, tokens } = await connected()
    await revoke(store, 'fba_unknown', client.clientId)
    expect(await verifyAccessToken(store, tokens.access_token)).not.toBeNull()
    await revoke(store, tokens.refresh_token, client.clientId)
    expect(await verifyAccessToken(store, tokens.access_token)).toBeNull()
    expect(await token(store, { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: tokens.refresh_token }, null, allowed)).toMatchObject({ ok: false })
  })

  it('expires access tokens after an hour', async () => {
    const { store, tokens } = await connected()
    expect(await verifyAccessToken(store, tokens.access_token, new Date(Date.now() + 61 * 60_000))).toBeNull()
  })
})

describe('discovery', () => {
  it('advertises S256, DCR and the protected resource', () => {
    const as = authorizationServerMetadata(`${ORIGIN}/`)
    expect(as.issuer).toBe(ORIGIN)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    expect(as.registration_endpoint).toBe(`${ORIGIN}/oauth/register`)
    const pr = protectedResourceMetadata(ORIGIN)
    expect(pr.resource).toBe(RESOURCE)
    expect(pr.authorization_servers).toEqual([ORIGIN])
    expect(wwwAuthenticate(ORIGIN, 'invalid_token')).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`)
  })
})

describe('parseBasicAuth (night check)', () => {
  it('treats a malformed percent-escape as no credentials instead of throwing', () => {
    expect(parseBasicAuth(`Basic ${Buffer.from('%E0%A4%A:%zz').toString('base64')}`)).toBeNull()
    expect(parseBasicAuth(`Basic ${Buffer.from('id%20x:s%3Ac').toString('base64')}`)).toEqual({ id: 'id x', secret: 's:c' })
  })
})
