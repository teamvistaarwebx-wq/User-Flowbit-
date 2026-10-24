import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { randomToken, signed } from '@/lib/auth/tokens'
import { getCtx, routeRefused } from '@/lib/ctx'
import { appUrl, secureCookies } from '@/lib/env'
import { googleIntegrationsReady } from '@/modules/google/connections'
import { INTEGRATION_STATE_COOKIE, INTEGRATION_STATE_MAX_AGE, integrationAuthUrl, integrationReturnPath, integrationsPage, type IntegrationState } from '@/modules/google/oauth'
import { isGoogleService } from '@/modules/google/scopes'
import { gmailReplyDetectionOn } from '@/modules/orbit/sequences/replies'

export const runtime = 'nodejs'

/**
 * Starts connecting the signed-in member's Google Calendar or Gmail: a signed state cookie, then Google's consent
 * screen. An optional `next` (an in-app path) is where the callback returns on success, e.g. the meeting form.
 */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.redirect(appUrl('/login?next=/app/settings/integrations/google'))
  if (routeRefused(ctx)) return NextResponse.redirect(appUrl('/app/settings/subscription'))
  const service = request.nextUrl.searchParams.get('service')
  if (!isGoogleService(service) || (service === 'gmail_read' && !gmailReplyDetectionOn())) return NextResponse.redirect(integrationsPage('?error=service'))
  if (!googleIntegrationsReady()) return NextResponse.redirect(integrationsPage('?error=not_configured'))
  const next = integrationReturnPath(request.nextUrl.searchParams.get('next'))
  const state: IntegrationState = { state: randomToken(16), service, orgId: String(ctx.orgId), memberId: String(ctx.memberId), ...(next ? { next } : {}) }
  ;(await cookies()).set(INTEGRATION_STATE_COOKIE, signed(Buffer.from(JSON.stringify(state)).toString('base64url')), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/api/integrations/google',
    maxAge: INTEGRATION_STATE_MAX_AGE,
  })
  return NextResponse.redirect(integrationAuthUrl(service, state.state))
}
