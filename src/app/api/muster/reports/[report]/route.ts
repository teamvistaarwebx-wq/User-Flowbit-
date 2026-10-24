import { NextResponse, type NextRequest } from 'next/server'
import { audit } from '@/lib/audit'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { monthOf } from '@/lib/dates'
import { buildReport } from '@/modules/muster/reports/builders'
import { REPORTS, isReportKey } from '@/modules/muster/reports/catalog'
import { csvResponse, toCsv } from '@/modules/muster/reports/csv'

export const runtime = 'nodejs'
export const maxDuration = 300

/** CSV export: GET /api/muster/reports/<key>?month=YYYY-MM. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('muster')) return NextResponse.json({ error: 'Muster is not active on this workspace.' }, { status: 403 })
  const { report } = await params
  if (!isReportKey(report)) return NextResponse.json({ error: 'No such report.' }, { status: 404 })
  const raw = request.nextUrl.searchParams.get('month') ?? ''
  if (raw && !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return NextResponse.json({ error: 'Use a real month as YYYY-MM, for example 2026-10.' }, { status: 400 })
  const month = raw || monthOf()
  const result = await buildReport(ctx, report, month)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 })
  if (REPORTS[report].payroll) await audit(ctx, { action: 'report.exported', entity: 'Report', entityId: report, summary: `Exported ${result.table.title}`, product: 'muster' })
  return csvResponse(toCsv(result.table.header, result.table.rows), result.table.filename)
}
