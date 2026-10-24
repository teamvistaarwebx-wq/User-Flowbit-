import type { NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { reportCsv } from '@/modules/work/reports/csv'
import { resolveRange } from '@/modules/work/reports/range'
import { validId } from '@/modules/work/reports/scope'
import { isSection } from '@/modules/work/reports/sections'

export const runtime = 'nodejs'
export const maxDuration = 300

/** CSV export: GET /api/work/reports/<section>?range=&from=&to=&project=&team=&assignee=&approved=1 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return new Response('Sign in again.', { status: 401 })
  if (!ctx.has('work') || !ctx.can('work.reports')) return new Response("You don't have access to Work reports.", { status: 403 })
  const { section } = await params
  if (!isSection(section)) return new Response('Unknown report.', { status: 404 })
  const q = request.nextUrl.searchParams
  const range = resolveRange({ range: q.get('range') ?? undefined, from: q.get('from') ?? undefined, to: q.get('to') ?? undefined }, todayIST())
  const scope = { projectId: validId(q.get('project') ?? undefined), teamId: validId(q.get('team') ?? undefined), assigneeId: validId(q.get('assignee') ?? undefined) }
  try {
    const csv = await reportCsv(ctx, section, range, scope, q.get('approved') === '1')
    return new Response(`﻿${csv}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="flowbit-${section}-${range.from}-${range.to}.csv"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[reports] CSV export failed', { section, orgId: String(ctx.orgId) }, error)
    return new Response('Could not build the report. Try again in a moment.', { status: 500 })
  }
}
