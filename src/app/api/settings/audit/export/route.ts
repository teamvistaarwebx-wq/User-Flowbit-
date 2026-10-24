import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formulaSafe } from '@/lib/csv-safe'
import { formatDateTime, todayIST } from '@/lib/dates'
import { parseListParams } from '@/lib/list'
import { AuditLog } from '@/models/AuditLog'
import { auditFilter } from '@/modules/settings/audit-query'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_ROWS = 10_000

const csvCell = (value: unknown) => {
  const text = formulaSafe(value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV of the audit log for the current filters (RFC 4180, UTF-8 BOM so Excel reads ₹). */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.can('audit.read')) return NextResponse.json({ error: "You don't have access to the audit log." }, { status: 403 })
  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const filter = auditFilter(parseListParams(params))
  const rows = await ctx.db(AuditLog).find(filter).sort({ createdAt: -1 }).limit(MAX_ROWS).lean()
  const header = ['When (IST)', 'Who', 'Role', 'Action', 'Entity', 'Entity id', 'Summary', 'Changes', 'IP']
  const lines = rows.map((r) =>
    [formatDateTime(r.createdAt), r.platform ? (r.actorName === 'System' ? 'System' : 'Flowbit support') : r.actorName, r.actorRole, r.action, r.entity, r.entityId, r.summary, r.meta, r.ip].map(csvCell).join(','),
  )
  const body = `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="audit-log-${ctx.org.slug}-${todayIST()}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
