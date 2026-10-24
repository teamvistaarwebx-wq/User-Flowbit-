import { NextResponse } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { runningEntry } from '@/modules/work/time/queries'

/** The signed-in member's running timer (for the top-bar pill): GET /api/work/time/running -> { running }. */
export async function GET() {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('work') || !ctx.can('time.write')) return NextResponse.json({ running: null })
  return NextResponse.json({ running: await runningEntry(ctx) }, { headers: { 'cache-control': 'no-store' } })
}
