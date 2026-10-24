import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { captureLead } from '@/modules/orbit/capture/create'
import { draftFromIndiamartPush } from '@/modules/orbit/capture/indiamart'
import { draftFromWebhook } from '@/modules/orbit/capture/map'
import { captureByHookKey } from '@/modules/orbit/capture/settings'
import { createInboundTask } from '@/modules/connectors/inbound-task'
import { verifySignature } from '@/modules/webhooks/sign'

export const runtime = 'nodejs'

/**
 * A workspace's generic lead webhook: Zapier / Make / Pabbly JSON, Meta lead
 * ads (field_data) and JustDial's lead push. The random key picks the
 * workspace; the request must carry the workspace's token as `?token=`, an
 * `x-flowbit-token` header, or an HMAC-SHA256 of the body in
 * `x-flowbit-signature`. A repeat with the same lead id is acknowledged once.
 * A body with `"type": "task"` creates a Work task instead (connectors/inbound-task),
 * with replay protection (fresh timestamp when given; id, nonce or body seen once).
 */

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const hook = await captureByHookKey(key)
  if (!hook) return NextResponse.json({ error: 'unknown webhook' }, { status: 404 })
  const raw = await readBodyLimited(request, BODY_LIMITS.leadHook)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const token = request.nextUrl.searchParams.get('token') ?? request.headers.get('x-flowbit-token') ?? ''
  const signatureHeader = request.headers.get('x-flowbit-signature') ?? ''
  const signature = signatureHeader.replace(/^sha256=/i, '').toLowerCase()
  // A plain HMAC of the body, or the timestamped `t=…,v1=…` form (HMAC of `t.body`, 5-minute window).
  const signed = (/^[0-9a-f]{64}$/.test(signature) && safeEqual(createHmac('sha256', hook.token).update(raw).digest('hex'), signature)) || verifySignature(hook.token, raw, signatureHeader)
  if (!signed && !(token && safeEqual(token, hook.token))) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const { limit, windowMs } = RATE_LIMITS.leadHook
  const limited = await rateLimit(`leadHook:${key}`, limit, windowMs)
  if (!limited.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  if (body && typeof body === 'object' && (body as { type?: unknown }).type === 'task') {
    try {
      const outcome = await createInboundTask(hook.orgId, body, { raw, headers: request.headers })
      if (outcome.status === 'stale') return NextResponse.json({ error: outcome.reason }, { status: 401 })
      if (outcome.status === 'refused') return NextResponse.json({ error: outcome.reason }, { status: 422 })
      return NextResponse.json({ ok: true, status: outcome.status, taskId: outcome.taskId })
    } catch (error) {
      console.error('[lead webhook] task failed', String(hook.orgId), error)
      return NextResponse.json({ error: 'could not create the task' }, { status: 500 })
    }
  }
  // IndiaMART's Push API wraps its enquiry in RESPONSE; anything else is read as a generic lead.
  const draft = draftFromIndiamartPush(body) ?? draftFromWebhook(body)
  if (!draft) return NextResponse.json({ error: 'A lead needs an email address or a phone number.' }, { status: 422 })
  try {
    const outcome = await captureLead(hook.orgId, draft)
    if (outcome.status === 'refused') return NextResponse.json({ error: outcome.reason }, { status: 503 })
    return NextResponse.json({ ok: true, status: outcome.status })
  } catch (error) {
    console.error('[lead webhook] capture failed', String(hook.orgId), error)
    return NextResponse.json({ error: 'could not store the lead' }, { status: 500 })
  }
}
