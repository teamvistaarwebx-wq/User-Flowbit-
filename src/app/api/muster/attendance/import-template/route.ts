import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { IMPORT_COLUMNS, TEMPLATE_ROWS } from '@/modules/muster/attendance/import'
import { toCsv } from '@/modules/muster/import/csv'

/** CSV template for the attendance import: code, date, status, in, out, note, with example rows. */
export async function GET() {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster') || !ctx.can('attendance.manage')) return new Response('Not allowed', { status: 403 })
  const body = toCsv(TEMPLATE_ROWS, [...IMPORT_COLUMNS])
  return new Response(`﻿${body}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="attendance-import-template.csv"' } })
}
