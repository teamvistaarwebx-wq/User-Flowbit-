import { NextResponse, type NextRequest } from 'next/server'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { verifyResendWebhook } from '@/modules/messaging/signatures'
import { applyResendEvent, type ResendWebhook } from '@/modules/messaging/webhook'

export const runtime = 'nodejs'

/**
 * Resend delivery webhook (sent, delivered, opened, bounced, complained):
 * verifies the Svix signature over the raw body with RESEND_WEBHOOK_SECRET,
 * then updates the message. Unknown messages answer 200 so Resend stops
 * retrying; a failure answers 500 so it tries again.
 */
export async function POST(request: NextRequest) {
  const secret = serverEnv().RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 400 })
  const raw = await readBodyLimited(request, BODY_LIMITS.resend)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const headers = { id: request.headers.get('svix-id'), timestamp: request.headers.get('svix-timestamp'), signature: request.headers.get('svix-signature') }
  if (!verifyResendWebhook(raw, headers, secret)) return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  let event: ResendWebhook
  try {
    event = JSON.parse(raw) as ResendWebhook
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  try {
    await dbConnect()
    const outcome = await applyResendEvent(event)
    return NextResponse.json({ ok: true, outcome })
  } catch (error) {
    console.error('[resend webhook] failed', event.type, error)
    return NextResponse.json({ error: 'could not apply the event' }, { status: 500 })
  }
}
