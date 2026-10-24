import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { toCsv } from '@/modules/muster/import/csv'
import { TEMPLATE_EXAMPLE, templateColumns } from '@/modules/muster/import/employees'

/** CSV template with the columns this person may set and one example row. */
export async function GET() {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster') || !ctx.can('people.import')) return new Response('Not allowed', { status: 403 })
  const columns = templateColumns(ctx.can('people.read_sensitive'))
  const body = toCsv([TEMPLATE_EXAMPLE], columns)
  return new Response(`﻿${body}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="employee-import-template.csv"' } })
}
