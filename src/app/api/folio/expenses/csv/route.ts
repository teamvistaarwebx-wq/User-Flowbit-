import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { csvMoney, csvResponse, toTitledCsv } from '@/modules/folio/engine/csv'
import { resolvePeriod } from '@/modules/folio/engine/period'
import { exportExpenses } from '@/modules/folio/expenses/queries'
import { EXPENSE_MODE_LABELS, PAID_FROM_LABELS, type ExpenseMode, type PaidFrom } from '@/modules/folio/expenses/rules'
import { firmContext } from '@/modules/folio/queries/common'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Expenses as a titled CSV: GET /api/folio/expenses/csv?firm&period&from&to&category&q */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('expenses.read')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const today = todayIST()
  const period = resolvePeriod({ period: sp.get('period'), from: sp.get('from'), to: sp.get('to') }, today, 'this_fy')
  const { firm } = await firmContext(ctx, sp.get('firm'))
  const rows = await exportExpenses(ctx, { entityId: firm?.id ?? null, period, categoryId: sp.get('category'), q: sp.get('q')?.trim() || null })
  const body = toTitledCsv(
    { title: 'Expenses', issuer: firm?.name ?? `${ctx.org.name} · all firms`, period: period.from && period.to ? `${formatDate(period.from)} to ${formatDate(period.to)}` : 'All dates', generatedOn: formatDate(today) },
    ['Date', 'Firm', 'Category', 'Paid to', 'Description', 'Amount', 'GST', 'Input tax claimable', 'Cost', 'Mode', 'Paid from', 'Reference', 'Repeats monthly'],
    [
      ...rows.map((r) => [r.date, r.entityCode, r.categoryName, r.vendor, r.description, csvMoney(r.amountPaise), csvMoney(r.gstPaise), csvMoney(r.inputTaxPaise), csvMoney(r.netPaise), EXPENSE_MODE_LABELS[r.mode as ExpenseMode] ?? r.mode, PAID_FROM_LABELS[r.paidFrom as PaidFrom] ?? r.paidFrom, r.reference, r.repeatMonthly ? 'Yes' : 'No']),
      ['Total', '', '', '', '', csvMoney(rows.reduce((s, r) => s + r.amountPaise, 0)), csvMoney(rows.reduce((s, r) => s + r.gstPaise, 0)), csvMoney(rows.reduce((s, r) => s + r.inputTaxPaise, 0)), csvMoney(rows.reduce((s, r) => s + r.netPaise, 0)), '', '', '', ''],
    ],
  )
  const span = period.from && period.to ? `${period.from}-to-${period.to}` : 'all'
  return csvResponse(body, `folio-expenses${firm ? `-${firm.code}` : ''}-${span}.csv`)
}
