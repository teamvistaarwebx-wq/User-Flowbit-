import { NextResponse } from 'next/server'
import { runCronJob } from '@/lib/cron'
import { runFolioDaily } from '@/modules/folio/collections/daily'
import { isCronAuthorised } from '@/modules/folio/collections/system'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Folio's daily run, for a server's own scheduler (`npm run cron:folio`).
 * POST with `Authorization: Bearer <hex HMAC-SHA256(APP_SECRET, 'folio:cron')>`.
 * On Vercel the same job runs from GET /api/cron/folio (vercel.json).
 */
export async function POST(request: Request) {
  if (!isCronAuthorised(request.headers.get('authorization'))) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  const headers = { 'cache-control': 'no-store' }
  try {
    const { asOf, outcome } = await runCronJob('folio', runFolioDaily)
    if (!outcome.ran) return NextResponse.json({ asOf, skipped: 'Another Folio run is in progress.' }, { headers })
    return NextResponse.json({ asOf, orgs: outcome.result.orgs }, { headers })
  } catch (error) {
    console.error('[cron folio] failed', error)
    return NextResponse.json({ job: 'folio', error: 'The job failed; see the server log.' }, { status: 500, headers })
  }
}
