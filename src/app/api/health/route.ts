import { NextResponse } from 'next/server'
import { healthSnapshot } from '@/modules/status/health'
import pkg from '../../../../package.json'

export const runtime = 'nodejs'

/**
 * GET /api/health for uptime monitors: version, whether MongoDB and file
 * storage answer, the storage driver and how email goes out ('resend', or
 * 'outbox' when nothing is emailed). No secrets, no hostnames. 503 when the
 * database or storage is down. The public /status page shows the same checks.
 */
export async function GET() {
  const health = await healthSnapshot()
  const ok = health.db && health.storage
  const body = {
    ok,
    version: pkg.version,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    db: health.db ? 'reachable' : 'unreachable',
    storage: health.storageDriver,
    storageStatus: health.storage ? 'reachable' : 'unreachable',
    email: health.email,
    time: new Date().toISOString(),
  }
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } })
}
