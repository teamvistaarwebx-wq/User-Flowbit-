import { NextResponse, type NextRequest } from 'next/server'
import { dbConnect } from '@/lib/db'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { whatsAppEnabled } from '@/modules/features/flags'
import { connectionForHook, touchConnection } from '@/modules/whatsapp/connection'
import { parseInteraktEvent, verifyInteraktWebhook } from '@/modules/whatsapp/webhook-event'
import { applyWorkspaceEvent } from '@/modules/whatsapp/workspace-webhook'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * A workspace's own Interakt webhook (WhatsApp B). The random path key picks
 * the workspace; the request must carry that workspace's webhook secret as
 * `?token=` or an HMAC-SHA256 `interakt-signature` of the raw body. Ticks,
 * inbound messages and STOP apply to that workspace only. Unknown events
 * answer 200 (Interakt stops retrying); a failure answers 500 (it retries).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ hook: string }> }) {
  // While WhatsApp is off (lib/feature-flags) the webhook does not exist, so the employee bot stays silent too.
  if (!(await whatsAppEnabled())) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { hook } = await params
  await dbConnect()
  const connection = await connectionForHook(hook)
  if (!connection) return NextResponse.json({ error: 'unknown webhook' }, { status: 404 })
  const raw = await readBodyLimited(request, BODY_LIMITS.interakt)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const signature = request.headers.get('interakt-signature') ?? request.headers.get('x-interakt-signature')
  if (!verifyInteraktWebhook({ raw, token: request.nextUrl.searchParams.get('token'), signature }, connection.webhookSecret)) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const event = parseInteraktEvent(body)
  await touchConnection(connection.orgId)
  if (!event) return NextResponse.json({ ok: true, ignored: true })
  try {
    return NextResponse.json({ ok: true, outcome: await applyWorkspaceEvent(connection.orgId, event) })
  } catch (error) {
    console.error('[whatsapp webhook] failed', String(connection.orgId), event.kind, error)
    return NextResponse.json({ error: 'could not apply the event' }, { status: 500 })
  }
}
