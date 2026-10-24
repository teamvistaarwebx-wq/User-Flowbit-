import { NextResponse } from 'next/server'
import { setUnsubscribed } from '@/modules/messaging/unsubscribe'

export const runtime = 'nodejs'

/**
 * RFC 8058 one-click unsubscribe: mail apps POST here from the
 * List-Unsubscribe header. A GET (a person or a link scanner) goes to the
 * confirmation page instead, so a scanner never unsubscribes anyone.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const view = await setUnsubscribed(token, true, 'one_click')
    return view ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'invalid link' }, { status: 400 })
  } catch (error) {
    console.error('[unsubscribe] one-click failed', error)
    return NextResponse.json({ error: 'could not unsubscribe' }, { status: 500 })
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, request.url), 303)
}
