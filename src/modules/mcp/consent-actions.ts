'use server'

import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { appUrl } from '@/lib/env'
import { mcpRefusal } from './access'
import { ctxInWorkspace } from './consent'
import { checkAuthorize, errorRedirect, issueCode } from './oauth/core'
import { mcpResourceUrl } from './oauth/metadata'
import { mongoOAuthStore } from './oauth/store'
import { grantableScopes, parseScopes } from './scopes'
import { mcpEnabledFor } from './session'

/**
 * Approve or deny on the consent screen. Everything is checked again here
 * (client, exact redirect URI, PKCE, membership, plan, switch, scopes ∩ role);
 * the browser only chooses the workspace and unticks scopes.
 */

export type ConsentResult = { ok: true; redirectTo: string } | { ok: false; error: string }

const params = z.object({
  client_id: z.string().max(100),
  redirect_uri: z.string().max(2000),
  code_challenge: z.string().max(200),
  code_challenge_method: z.string().max(10),
  state: z.string().max(1000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().max(500).optional(),
})

const approveSchema = params.extend({ orgId: z.string().length(24), scopes: z.array(z.string().max(40)).max(10) })

const origin = () => appUrl('')

export async function approveConsent(input: z.input<typeof approveSchema>): Promise<ConsentResult> {
  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'The request was not complete. Start the connection again from the app.' }
  const p = parsed.data
  const current = await getSession()
  if (!current) return { ok: false, error: 'Your session ended. Sign in again.' }
  const check = await checkAuthorize(mongoOAuthStore, { ...p, response_type: 'code' }, mcpResourceUrl(origin()))
  if (!check.ok) return check.fatal ? { ok: false, error: check.message } : { ok: true, redirectTo: check.redirectTo }
  const ctx = await ctxInWorkspace(current.user, current.session, p.orgId)
  if (!ctx) return { ok: false, error: 'You are not a member of that workspace.' }
  const refusal = mcpRefusal(ctx.entitlements, await mcpEnabledFor(ctx.orgId), ctx.twoFactorMissing)
  if (refusal) return { ok: false, error: refusal }
  const role = { permissions: ctx.permissions, products: ctx.entitlements.products }
  const allowed = grantableScopes(check.request.scopes, role)
  const chosen = parseScopes(p.scopes).filter((s) => allowed.includes(s))
  if (!chosen.length) return { ok: false, error: 'Tick at least one permission your role allows.' }
  const redirectTo = await issueCode(mongoOAuthStore, check.request, { userId: String(ctx.userId), orgId: String(ctx.orgId), memberId: String(ctx.memberId), scopes: chosen }, origin())
  await audit(ctx, { action: 'mcp.connected', entity: 'OAuthClient', entityId: check.request.client.clientId, summary: `Connected ${check.request.client.clientName} (${chosen.join(', ')})`, meta: { scopes: chosen, client: check.request.client.clientName } })
  return { ok: true, redirectTo }
}

export async function denyConsent(input: z.input<typeof params>): Promise<ConsentResult> {
  const parsed = params.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'The request was not complete.' }
  const check = await checkAuthorize(mongoOAuthStore, { ...parsed.data, response_type: 'code' }, mcpResourceUrl(origin()))
  if (!check.ok) return check.fatal ? { ok: false, error: check.message } : { ok: true, redirectTo: check.redirectTo }
  return { ok: true, redirectTo: errorRedirect(check.request.redirectUri, 'access_denied', 'The person declined', check.request.state, origin()) }
}
