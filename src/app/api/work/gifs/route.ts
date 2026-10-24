import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { serverEnv } from '@/lib/env'
import { rateLimit } from '@/lib/rate-limit'
import { MAX_GIF_QUERY, searchGifs } from '@/modules/work/posts/gifs'

export const runtime = 'nodejs'

const SEARCHES_PER_MINUTE = 60

/**
 * GET /api/work/gifs?q=: GIF search for the post composer, proxied to Klipy
 * so the API key stays on the server and Klipy sees an anonymous customer id
 * instead of the member. The picker's small previews load from Klipy's CDN
 * while someone is choosing; a picked GIF is copied into the workspace, so
 * posts never hotlink. Members who can write posts only; 404 when no
 * KLIPY_API_KEY is set.
 */
export async function GET(req: NextRequest) {
  const key = serverEnv().KLIPY_API_KEY
  if (!key) return NextResponse.json({ error: 'GIF search is not set up.' }, { status: 404 })
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('work') || !ctx.can('posts.write')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const limited = await rateLimit(`gifSearch:${ctx.memberId}`, SEARCHES_PER_MINUTE, 60_000)
  if (!limited.ok) return NextResponse.json({ error: 'Too many searches. Wait a moment.' }, { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } })
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, MAX_GIF_QUERY)
  // Klipy may personalise by an anonymous customer id; never the member's own id.
  const customerId = createHash('sha256').update(`gif:${String(ctx.memberId)}`).digest('hex').slice(0, 24)
  const results = await searchGifs(key, q, { customerId })
  return NextResponse.json({ results }, { headers: { 'cache-control': 'private, max-age=60' } })
}
