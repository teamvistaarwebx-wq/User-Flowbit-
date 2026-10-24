import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { unsign } from '@/lib/auth/tokens'
import { audit } from '@/lib/audit'
import { getCtx } from '@/lib/ctx'
import { appUrl, serverEnv } from '@/lib/env'
import { exchangeCode } from '@/modules/google/client'
import { googleIntegrationsReady, saveConnection } from '@/modules/google/connections'
import { INTEGRATION_STATE_COOKIE, integrationRedirectUri, integrationReturnPath, integrationsPage, type IntegrationState } from '@/modules/google/oauth'
import { GOOGLE_SERVICE_LABEL, grantedScope, isGoogleService } from '@/modules/google/scopes'

export const runtime = 'nodejs'

function readState(raw: string | undefined): IntegrationState | null {
  const payload = unsign(raw)
  if (!payload) return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IntegrationState
    return isGoogleService(value.service) ? value : null
  } catch {
    return null
  }
}

/**
 * Google returns here after consent. The state must match the cookie and the
 * member who started; the scope must be the one asked for; the refresh token
 * is sealed before it is stored. On success it returns to the state's `next`
 * (checked again here), else to Settings; errors always go to Settings, which explains them.
 */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  const saved = readState(jar.get(INTEGRATION_STATE_COOKIE)?.value)
  jar.delete({ name: INTEGRATION_STATE_COOKIE, path: '/api/integrations/google' })
  const params = request.nextUrl.searchParams
  if (params.get('error')) return NextResponse.redirect(integrationsPage('?error=denied'))
  const code = params.get('code')
  if (!saved || !code || saved.state !== params.get('state')) return NextResponse.redirect(integrationsPage('?error=state'))
  const ctx = await getCtx()
  if (!ctx || String(ctx.orgId) !== saved.orgId || String(ctx.memberId) !== saved.memberId) return NextResponse.redirect(integrationsPage('?error=state'))
  if (!googleIntegrationsReady()) return NextResponse.redirect(integrationsPage('?error=not_configured'))
  try {
    const env = serverEnv()
    const token = await exchangeCode({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: integrationRedirectUri() }, code)
    if (!grantedScope(token.scope, saved.service)) return NextResponse.redirect(integrationsPage(`?error=scope&service=${saved.service}`))
    if (!token.refresh_token) return NextResponse.redirect(integrationsPage(`?error=no_refresh&service=${saved.service}`))
    await saveConnection(ctx, { memberId: ctx.memberId, userId: ctx.userId, service: saved.service, refreshToken: token.refresh_token, scope: token.scope ?? '' })
    await audit(ctx, { action: 'google.connected', entity: 'GoogleConnection', summary: `Connected ${GOOGLE_SERVICE_LABEL[saved.service]}`, product: 'settings' })
    const next = integrationReturnPath(saved.next)
    return NextResponse.redirect(next ? appUrl(next) : integrationsPage(`?connected=${saved.service}`))
  } catch (error) {
    console.error('[google] integration callback failed', error instanceof Error ? error.message : error)
    return NextResponse.redirect(integrationsPage('?error=failed'))
  }
}
