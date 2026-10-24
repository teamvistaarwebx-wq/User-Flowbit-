import { after } from 'next/server'
import { respond } from '@/modules/connectors/slack/api'
import { verifiedSlackBody } from '@/modules/connectors/slack/request'
import { installFor, runSlash } from '@/modules/connectors/slack/service'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * The /flowbit slash command. Slack wants an answer within 3 seconds, so the
 * work runs after the response and the result goes to the response_url.
 */
export async function POST(request: Request) {
  const raw = await verifiedSlackBody(request)
  if (raw === null) return new Response('Invalid signature', { status: 401 })
  const form = new URLSearchParams(raw)
  const install = await installFor(form.get('team_id') ?? '')
  if (!install) return Response.json({ response_type: 'ephemeral', text: 'This Slack workspace is not connected to Flowbit. An admin can install it in Flowbit → Settings → Integrations → Slack.' })
  const responseUrl = form.get('response_url') ?? ''
  after(async () => {
    const text = await runSlash(install, { teamId: install.teamId, userId: form.get('user_id') ?? '', text: form.get('text') ?? '', channelName: form.get('channel_name') })
    await respond(responseUrl, { text })
  })
  return Response.json({ response_type: 'ephemeral', text: 'On it…' })
}
