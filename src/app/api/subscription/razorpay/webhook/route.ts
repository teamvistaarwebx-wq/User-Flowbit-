import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env'
import { elevated } from '@/lib/platform'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { BillingEvent } from '@/models/subscription/BillingEvent'
import { verifyWebhookSignature } from '@/modules/subscription/signatures'
import { processRazorpayEvent, type RazorpayEvent } from '@/modules/subscription/webhook'

export const runtime = 'nodejs'
export const maxDuration = 300

const isDuplicate = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

/** An unprocessed attempt older than this with no error is treated as crashed and may be re-run. */
const STALE_ATTEMPT_MS = 5 * 60_000

type Outcome = 'done' | 'failed' | 'busy'

/**
 * Razorpay webhook: verifies X-Razorpay-Signature over the raw body, stores the
 * event once (keyed by x-razorpay-event-id) and applies it. A retry of an event
 * already processed is a no-op; a retry of one that failed (or stalled) re-runs
 * it, which is safe because every lifecycle step is idempotent by payment id.
 * Failures answer 500 so Razorpay keeps retrying instead of dropping the event.
 */
export async function POST(request: NextRequest) {
  const secret = serverEnv().RAZORPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 400 })
  const raw = await readBodyLimited(request, BODY_LIMITS.razorpay)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature') ?? '', secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }
  let body: RazorpayEvent
  try {
    body = JSON.parse(raw) as RazorpayEvent
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const eventId = request.headers.get('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex')

  const outcome = await elevated('razorpay webhook', async (db): Promise<Outcome> => {
    let record
    try {
      record = await db.raw(BillingEvent).create({ provider: 'razorpay', eventId, type: body.event ?? 'unknown', payload: body, receivedAt: new Date() })
    } catch (error) {
      if (!isDuplicate(error)) throw error
      // A retry: claim the stored event only if it never finished (failed, or stalled mid-run).
      record = await db.raw(BillingEvent).findOneAndUpdate(
        { provider: 'razorpay', eventId, processedAt: { $exists: false }, $or: [{ error: { $exists: true } }, { receivedAt: { $lt: new Date(Date.now() - STALE_ATTEMPT_MS) } }] },
        { $set: { receivedAt: new Date() }, $unset: { error: 1 } },
        { new: true },
      )
      if (!record) {
        const done = await db.raw(BillingEvent).exists({ provider: 'razorpay', eventId, processedAt: { $exists: true } })
        return done ? 'done' : 'busy'
      }
    }
    try {
      const orgId = await processRazorpayEvent(db, body)
      await db.raw(BillingEvent).updateOne({ _id: record._id }, { $set: { processedAt: new Date(), ...(orgId ? { orgId } : {}) } })
      return 'done'
    } catch (error) {
      console.error('[webhook] razorpay event failed', body.event, eventId, error)
      await db.raw(BillingEvent).updateOne({ _id: record._id }, { $set: { error: error instanceof Error ? error.message : String(error) } })
      return 'failed'
    }
  })
  if (outcome === 'failed') return NextResponse.json({ error: 'processing failed; retry' }, { status: 500 })
  if (outcome === 'busy') return NextResponse.json({ error: 'already processing; retry' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
