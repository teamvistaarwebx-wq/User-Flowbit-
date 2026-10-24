import { NextResponse, type NextRequest } from 'next/server'
import { dbConnect } from '@/lib/db'
import { BODY_LIMITS, readBodyLimited } from '@/lib/read-body'
import { handleWorkspaceWebhook } from '@/modules/payments/webhook'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * A workspace's own Razorpay webhook (payment links on its invoices). The
 * path key picks the workspace; X-Razorpay-Signature over the raw body must
 * match that workspace's webhook secret. Idempotent on the payment id;
 * failures answer 500 so Razorpay retries.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ hook: string }> }) {
  const { hook } = await params
  const raw = await readBodyLimited(request, BODY_LIMITS.razorpay)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  try {
    await dbConnect()
    const reply = await handleWorkspaceWebhook(hook, raw, request.headers.get('x-razorpay-signature') ?? '')
    return NextResponse.json(reply.body, { status: reply.status })
  } catch (error) {
    console.error('[payments] workspace webhook failed', error)
    return NextResponse.json({ error: 'processing failed; retry' }, { status: 500 })
  }
}
