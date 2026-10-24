import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { searchWorkspace } from '@/lib/search'

const MAX_QUERY = 80

/** Command palette search: GET /api/search?q=term -> { hits }. */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, MAX_QUERY)
  const hits = await searchWorkspace(ctx, q)
  return NextResponse.json({ hits }, { headers: { 'cache-control': 'no-store' } })
}
