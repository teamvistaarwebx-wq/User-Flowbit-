import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { csvResponse } from '@/modules/folio/engine/csv'
import { brandLine, listEntities } from '@/modules/folio/queries/common'
import { REPORT_KEYS, reportCsv, reportParams, type ReportKey } from '@/modules/folio/queries/report-types'
import { runReport } from '@/modules/folio/queries/reports'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Folio report CSV: GET /api/folio/reports/<gst|sales|collections|aging|revenue>?from&to&entity&section&by */
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('folio.reports')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const { report } = await params
  if (!(REPORT_KEYS as readonly string[]).includes(report)) return NextResponse.json({ error: 'Unknown report.' }, { status: 404 })
  const today = todayIST()
  const sp = request.nextUrl.searchParams
  const p = reportParams((k) => sp.get(k) ?? undefined, today)
  const entities = await listEntities(ctx)
  const key = report as ReportKey
  const entityId = key === 'gst' ? (p.entityId ?? entities.find((e) => e.kind === 'gst')?.id ?? null) : p.entityId
  const table = await runReport(ctx, key, { ...p, entityId }, today)
  const issuer = entities.find((e) => e.id === entityId) ?? entities.find((e) => e.isDefault) ?? entities[0]
  const body = reportCsv(table, issuer ? brandLine(issuer) : ctx.org.name, formatDate(today))
  const suffix = key === 'gst' ? `-${p.section}` : key === 'revenue' ? `-by-${p.by}` : ''
  return csvResponse(body, `folio-${key}${suffix}-${p.from}-to-${p.to}.csv`)
}
