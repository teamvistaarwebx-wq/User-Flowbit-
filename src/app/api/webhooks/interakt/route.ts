import { NextResponse, type NextRequest } from 'next/server'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { whatsAppEnabled } from '@/modules/features/flags'
import { applyInteraktEvent } from '@/modules/whatsapp/inbox'
import { parseInteraktEvent, verifyInteraktWebhook } from '@/modules/whatsapp/webhook-event'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Interakt webhook for WhatsApp A (console spec 10): delivery ticks (sent,
 * delivered, read, failed) and inbound messages (Console inbox, STOP).
 * Authenticated by INTERAKT_WEBHOOK_SECRET: `?token=<secret>` in the URL set in
 * Interakt, or an HMAC-SHA256 of the raw body in `interakt-signature`.
 * Anything not understood answers 200 so Interakt stops retrying; a failure
 * answers 500 so it tries again.
 */
export async function POST(request: NextRequest) {
  // While WhatsApp is off (lib/feature-flags) the webhook does not exist.
  if (!(await whatsAppEnabled())) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const secret = serverEnv().INTERAKT_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 400 })
  const raw = await readBodyLimited(request, BODY_LIMITS.interakt)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const signature = request.headers.get('interakt-signature') ?? request.headers.get('x-interakt-signature')
  if (!verifyInteraktWebhook({ raw, token: request.nextUrl.searchParams.get('token'), signature }, secret)) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const event = parseInteraktEvent(body)
  if (!event) return NextResponse.json({ ok: true, ignored: true })
  try {
    await dbConnect()
    return NextResponse.json({ ok: true, outcome: await applyInteraktEvent(event) })
  } catch (error) {
    console.error('[interakt webhook] failed', event.kind, error)
    return NextResponse.json({ error: 'could not apply the event' }, { status: 500 })
  }
}
