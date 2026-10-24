import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { csvMoney, csvResponse, toTitledCsv } from '@/modules/folio/engine/csv'
import { brandLine } from '@/modules/folio/queries/common'
import { clientStatement } from '@/modules/folio/queries/ledger'
import { LEDGER_TYPE_LABELS } from '@/modules/folio/queries/ledger-math'
import { statementFilename } from '@/modules/folio/queries/statement-pdf'
import { rangeFrom } from '../range'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Client ledger as a titled CSV: GET /api/folio/ledger/<clientId>/csv?from&to */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('folio.read')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const { clientId } = await params
  const range = rangeFrom(request.nextUrl.searchParams)
  const data = await clientStatement(ctx, clientId, range)
  if (!data) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
  const s = data.statement
  const opening = s.from ? [[s.from, '', '', 'Brought forward', null, null, csvMoney(s.broughtForwardPaise)]] : []
  const rows = s.rows.map((r) => [r.date, LEDGER_TYPE_LABELS[r.type], r.document, r.particulars, r.debitPaise ? csvMoney(r.debitPaise) : null, r.creditPaise ? csvMoney(r.creditPaise) : null, csvMoney(r.balancePaise)])
  const totals = [['Total', '', '', '', csvMoney(s.debitPaise), csvMoney(s.creditPaise), csvMoney(s.closingPaise)]]
  const body = toTitledCsv(
    {
      title: `Statement of account — ${data.client.name}`,
      issuer: data.issuer ? brandLine(data.issuer) : ctx.org.name,
      period: s.from ? `${formatDate(s.from)} to ${formatDate(s.to)}` : `As at ${formatDate(s.to)}`,
      generatedOn: formatDate(todayIST()),
    },
    ['Date', 'Type', 'Document', 'Particulars', 'Debit', 'Credit', 'Balance'],
    [...opening, ...rows, ...totals],
  )
  return csvResponse(body, statementFilename(data.client.name, 'csv').replace('statement-', 'ledger-'))
}
