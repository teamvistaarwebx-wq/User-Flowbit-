import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { unsign } from '@/lib/auth/tokens'
import { audit } from '@/lib/audit'
import { getCtx } from '@/lib/ctx'
import { encryptionKey, serverEnv } from '@/lib/env'
import { sealSecret } from '@/lib/secret-box'
import { SlackInstall } from '@/models/integrations/SlackInstall'
import { slackApi } from '@/modules/connectors/slack/api'
import { SLACK_STATE_COOKIE, slackRedirectUri, slackSettingsPage, type SlackState } from '@/modules/connectors/slack/oauth'

export const runtime = 'nodejs'

function readState(raw: string | undefined): SlackState | null {
  const payload = unsign(raw)
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SlackState
  } catch {
    return null
  }
}

/** Slack returns here: the state must match the cookie and the admin who started; the bot token is sealed before it is stored. */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  const saved = readState(jar.get(SLACK_STATE_COOKIE)?.value)
  jar.delete({ name: SLACK_STATE_COOKIE, path: '/api/integrations/slack' })
  const params = request.nextUrl.searchParams
  if (params.get('error')) return NextResponse.redirect(slackSettingsPage('?error=denied'))
  const code = params.get('code')
  if (!saved || !code || saved.state !== params.get('state')) return NextResponse.redirect(slackSettingsPage('?error=state'))
  const ctx = await getCtx()
  if (!ctx || String(ctx.orgId) !== saved.orgId || String(ctx.memberId) !== saved.memberId || !ctx.can('org.manage')) return NextResponse.redirect(slackSettingsPage('?error=state'))
  const key = encryptionKey()
  if (!key) return NextResponse.redirect(slackSettingsPage('?error=not_configured'))
  const env = serverEnv()
  const res = await slackApi('oauth.v2.access', null, { client_id: env.SLACK_CLIENT_ID, client_secret: env.SLACK_CLIENT_SECRET, code, redirect_uri: slackRedirectUri() })
  const team = res.team as { id?: string; name?: string } | undefined
  const token = res.access_token as string | undefined
  if (!res.ok || !team?.id || !token) {
    console.error('[slack] install failed', res.error)
    return NextResponse.redirect(slackSettingsPage('?error=failed'))
  }
  const taken = await SlackInstall.findOne({ teamId: team.id, orgId: { $ne: ctx.orgId } }, { _id: 1 }).lean()
  if (taken) return NextResponse.redirect(slackSettingsPage('?error=taken'))
  await ctx.db(SlackInstall).updateOne({ teamId: team.id }, { $set: { teamName: team.name ?? '', botUserId: String(res.bot_user_id ?? ''), botTokenSealed: sealSecret(token, key), scope: String(res.scope ?? ''), installedByName: ctx.user.name } }, { upsert: true })
  await audit(ctx, { action: 'slack.installed', entity: 'SlackInstall', summary: `Connected Slack workspace ${team.name ?? team.id}` })
  return NextResponse.redirect(slackSettingsPage('?connected=1'))
}
