import { NextResponse } from 'next/server'
import { getStaffCtx } from '@/lib/console/session'
import { todayIST } from '@/lib/dates'
import { csvResponse } from '@/modules/orbit/csv'
import { buildReport, parseReportParams, REPORT_SECTIONS, sectionsFor, type ReportSection } from '@/modules/console/reports/build'
import { reportCsv } from '@/modules/console/reports/csv'
import { monthsEnding } from '@/modules/console/reports/money'
import { loadReportData } from '@/modules/console/reports/query'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Console Reports as CSV, one section per file, with the same role rules as the page. */
export async function GET(request: Request, { params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const p = await getStaffCtx()
  if (!p) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!p.can('reports.view') || !(REPORT_SECTIONS as readonly string[]).includes(section) || !sectionsFor(p.staff.role).sections.includes(section as ReportSection)) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  const now = new Date()
  const sp = new URL(request.url).searchParams
  const reportParams = parseReportParams({ period: sp.get('period') ?? undefined, month: sp.get('month') ?? undefined, group: sp.get('group') ?? undefined }, now)
  const data = await loadReportData(p, { ledgerSince: new Date(`${monthsEnding(reportParams.month, 12)[0]}-01T00:00:00+05:30`) })
  const report = buildReport(data, reportParams, { role: p.staff.role, staffId: String(p.staff.id) }, now)
  const csv = reportCsv(section as ReportSection, report, reportParams)
  if (!csv) return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  await p.audit({ action: 'console.report_exported', summary: `Exported the ${section} report (CSV)`, meta: reportParams })
  return csvResponse(csv, `flowbit-${section}-${todayIST()}.csv`)
}
