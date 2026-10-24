import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomToken, signed } from '@/lib/auth/tokens'
import { getCtx, routeRefused } from '@/lib/ctx'
import { appUrl, encryptionKey, isSlackConfigured, secureCookies } from '@/lib/env'
import { SLACK_STATE_COOKIE, SLACK_STATE_MAX_AGE, slackInstallUrl, slackSettingsPage, type SlackState } from '@/modules/connectors/slack/oauth'

export const runtime = 'nodejs'

/** Starts installing the Slack app for this workspace (admins): a signed state cookie, then Slack's consent screen. */
export async function GET() {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.redirect(appUrl('/login?next=/app/settings/integrations/slack'))
  if (routeRefused(ctx) || !ctx.can('org.manage')) return NextResponse.redirect(slackSettingsPage('?error=denied'))
  if (!isSlackConfigured() || !encryptionKey()) return NextResponse.redirect(slackSettingsPage('?error=not_configured'))
  const state: SlackState = { state: randomToken(16), orgId: String(ctx.orgId), memberId: String(ctx.memberId) }
  ;(await cookies()).set(SLACK_STATE_COOKIE, signed(Buffer.from(JSON.stringify(state)).toString('base64url')), { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/api/integrations/slack', maxAge: SLACK_STATE_MAX_AGE })
  return NextResponse.redirect(slackInstallUrl(state.state))
}
