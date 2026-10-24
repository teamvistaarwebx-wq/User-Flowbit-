import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatDate, formatMonth, todayIST } from '@/lib/dates'
import { csvMoney, csvResponse, toTitledCsv } from '@/modules/folio/engine/csv'
import { billingForecast } from '@/modules/folio/forecast/queries'
import { firmContext } from '@/modules/folio/queries/common'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Billing forecast lines as a titled CSV: GET /api/folio/forecast/csv?firm&months=3|6 */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('folio.read')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const today = todayIST()
  const months = sp.get('months') === '3' ? 3 : 6
  const { firm } = await firmContext(ctx, sp.get('firm'))
  const f = await billingForecast(ctx, { entityId: firm?.id ?? null, months, today })
  const rows = [...f.lines, ...f.unscheduled].map((l) => [
    l.month ? formatMonth(l.month) : 'No date',
    l.date,
    l.kind === 'retainer' ? 'Retainer' : 'Milestone',
    l.label,
    f.clientNames[l.clientId] ?? '',
    f.firmNames[l.entityId] ?? '',
    csvMoney(l.amountPaise),
    csvMoney(l.gstPaise),
    l.late ? 'Due, not raised' : '',
  ])
  const body = toTitledCsv(
    { title: 'Billing forecast (before GST)', issuer: firm?.name ?? `${ctx.org.name} · all firms`, period: `${formatMonth(f.months[0])} to ${formatMonth(f.months[f.months.length - 1])}`, generatedOn: formatDate(today) },
    ['Month', 'Billing date', 'Source', 'Line', 'Client', 'Firm', 'Amount', 'GST (estimate)', 'Note'],
    [...rows, ['Total (scheduled)', '', '', '', '', '', csvMoney(f.lines.reduce((s, l) => s + l.amountPaise, 0)), csvMoney(f.lines.reduce((s, l) => s + l.gstPaise, 0)), '']],
  )
  return csvResponse(body, `folio-forecast${firm ? `-${firm.code}` : ''}-${months}-months.csv`)
}
