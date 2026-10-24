import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { TWO_FACTOR_MESSAGE } from '@/lib/actions'
import { getCtx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { contentDisposition } from '@/lib/file-response'
import { zipStream } from '@/lib/zip'
import { exportEntries } from '@/modules/lifecycle/export'
import { mongoExportSource } from '@/modules/lifecycle/export-source'
import { TENANT_COLLECTIONS } from '@/modules/lifecycle/registry'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * The full workspace export (console spec 4.3): a ZIP of JSON and CSV per
 * module plus stored files, streamed as it is built. Open in every state,
 * read-only and blocked included; only the workspace owner may download it.
 */
export async function GET() {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (ctx.twoFactorMissing) return NextResponse.json({ error: TWO_FACTOR_MESSAGE }, { status: 403 })
  if (!ctx.isOwner) return NextResponse.json({ error: 'Only the workspace owner can export the whole workspace.' }, { status: 403 })
  await audit(ctx, { action: 'workspace.exported', entity: 'Org', entityId: ctx.orgId, summary: 'Downloaded the full workspace export' })
  const entries = exportEntries(mongoExportSource(ctx.orgId), TENANT_COLLECTIONS, { workspace: ctx.org.name, at: new Date() })
  const body = zipStream(entries, (error) => console.error('[export] workspace export failed', String(ctx.orgId), error))
  return new Response(body, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': contentDisposition('attachment', `flowbit-${ctx.org.slug}-${todayIST()}.zip`),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
