import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { getCtx, routeRefused } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { contentDisposition } from '@/lib/file-response'
import { exportSubject, SUBJECT_LABEL } from '@/modules/privacy/core'
import { subjectId, subjectRefFrom } from '@/modules/privacy/refs'
import { loadSubject, mongoPrivacyStore } from '@/modules/privacy/store'

export const runtime = 'nodejs'

/**
 * DPDP: everything this workspace holds about one client contact, lead or
 * member, as a JSON file (owners and admins). Works read-only too; audited
 * without the person's name.
 */
export async function GET(request: Request) {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (routeRefused(ctx)) return NextResponse.json({ error: 'This workspace is paused.' }, { status: 403 })
  if (!ctx.can('org.manage')) return NextResponse.json({ error: 'Only owners and admins can export personal data.' }, { status: 403 })
  const ref = subjectRefFrom(new URL(request.url).searchParams)
  if (!ref) return NextResponse.json({ error: 'Pick a contact, lead or member.' }, { status: 400 })
  const subject = await loadSubject(ctx, ref)
  if (!subject) return NextResponse.json({ error: 'That person was not found in this workspace.' }, { status: 404 })
  const data = await exportSubject(mongoPrivacyStore(ctx), subject, new Date())
  await audit(ctx, { action: 'privacy.exported', entity: ref.kind === 'lead' ? 'Lead' : ref.kind === 'member' ? 'Member' : 'Client', entityId: subjectId(ref), summary: `Exported the personal data of a ${SUBJECT_LABEL[ref.kind]} (DPDP request)` })
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': contentDisposition('attachment', `personal-data-${ref.kind}-${subjectId(ref).slice(-6)}-${todayIST()}.json`),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
