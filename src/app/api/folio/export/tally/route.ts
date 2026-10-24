import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { audit } from '@/lib/audit'
import { resolveBoundedPeriod } from '@/modules/folio/engine/period'
import { firmContext } from '@/modules/folio/queries/common'
import { buildTallyExport } from '@/modules/folio/tally/export'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Tally XML (beta) for a period and firm: GET /api/folio/export/tally?firm&period&from&to&masters=1&expenses=journal */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('folio.reports')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const today = todayIST()
  const period = resolveBoundedPeriod({ period: sp.get('period'), from: sp.get('from'), to: sp.get('to') }, today, 'this_month')
  const { firm } = await firmContext(ctx, sp.get('firm'))
  try {
    const result = await buildTallyExport(ctx, { from: period.from, to: period.to, entityId: firm?.id ?? null, masters: sp.get('masters') === '1', expensesAs: sp.get('expenses') === 'journal' ? 'Journal' : 'Payment', expenses: ctx.can('expenses.read') })
    if (result.tooMany) return NextResponse.json({ error: 'Too many documents for one file. Pick a shorter period (a month or a quarter).' }, { status: 422 })
    const c = result.counts
    await audit(ctx, { action: 'folio.tally_exported', entity: 'FolioSettings', entityId: ctx.orgId, summary: `Tally export ${period.from} to ${period.to}${firm ? ` (${firm.code})` : ''}: ${c.sales} invoices, ${c.creditNotes} credit notes, ${c.receipts} receipts, ${c.expenses} expenses`, product: 'folio' })
    const name = `tally-${firm ? `${firm.code}-` : ''}${period.from}-to-${period.to}.xml`.replace(/[^a-zA-Z0-9._-]+/g, '_')
    return new Response(result.xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'private, no-store' } })
  } catch (error) {
    console.error('[folio] tally export failed', error)
    return NextResponse.json({ error: 'The Tally export failed. Try a shorter period, or tell us if it keeps failing.' }, { status: 500 })
  }
}
