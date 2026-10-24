import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatDate, formatMonth, todayIST } from '@/lib/dates'
import { csvMoney, csvResponse, toTitledCsv } from '@/modules/folio/engine/csv'
import { resolveBoundedPeriod, throughThisMonth } from '@/modules/folio/engine/period'
import { PAYROLL_NOTES, profitAndLoss } from '@/modules/folio/pnl/queries'
import { firmContext } from '@/modules/folio/queries/common'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Profit and loss by month as a titled CSV: GET /api/folio/pnl/csv?firm&period&from&to */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('folio.reports')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const today = todayIST()
  const range = throughThisMonth(resolveBoundedPeriod({ period: sp.get('period'), from: sp.get('from'), to: sp.get('to') }, today, 'this_fy'), today)
  const { firm } = await firmContext(ctx, sp.get('firm'))
  const pnl = await profitAndLoss(ctx, { ...range, entityId: firm?.id ?? null })
  const body = toTitledCsv(
    { title: 'Profit and loss (management view, not statutory accounts)', issuer: firm?.name ?? `${ctx.org.name} · all firms`, period: `${formatDate(range.from)} to ${formatDate(range.to)}`, generatedOn: formatDate(today) },
    ['Line', ...pnl.months.map(formatMonth), 'Total'],
    [...pnl.rows.map((r) => [r.label, ...r.values.map(csvMoney), csvMoney(r.total)]), [], [PAYROLL_NOTES[pnl.payroll.state]], ['Income is taxable value (GST excluded) less credit notes. Costs are expenses net of claimable GST.']],
  )
  return csvResponse(body, `folio-pnl${firm ? `-${firm.code}` : ''}-${range.from}-to-${range.to}.csv`)
}
