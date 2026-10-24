import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatINR } from '@/lib/money'
import { isoDate } from '@/lib/validation'
import { BANK_LAYOUT_LABEL, BANK_LAYOUTS, buildBankFile, DEBIT_ACCOUNT, PAYMENT_MODES } from '@/modules/muster/payroll/bank-file'
import { bankFileReady, bankPayees, mayExportBankFile } from '@/modules/muster/payroll/bank-file-queries'
import { cycleLabel, cycleMonth, getCycle } from '@/modules/muster/payroll/queries'
import { visibleEmployeeIds } from '@/modules/muster/people/scope'
import { csvResponse, toCsv } from '@/modules/muster/reports/csv'

export const runtime = 'nodejs'
export const maxDuration = 300

const querySchema = z.object({
  layout: z.enum(BANK_LAYOUTS),
  debit: z.string().trim().regex(DEBIT_ACCOUNT, 'The debit account must be 9 to 18 digits.'),
  mode: z.enum(PAYMENT_MODES).default('NEFT'),
  date: isoDate,
  narration: z.string().trim().min(1).max(60),
})

const refuse = (message: string, status: number) => new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

/** Bulk salary payment file for a locked or released payroll month. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster') || !ctx.hasFeature('muster.payroll')) return refuse('Not allowed', 403)
  if (!mayExportBankFile(ctx)) return refuse('The bank file carries account numbers, so it needs payroll release or lock rights and access to sensitive details.', 403)
  if ((await visibleEmployeeIds(ctx)) !== null) return refuse('The bank file covers the whole company, and your role sees only part of it.', 403)
  const { id } = await params
  const cycle = await getCycle(ctx, id)
  if (!cycle) return refuse('Not found', 404)
  if (!bankFileReady(cycle.status)) return refuse(`${cycleLabel(cycle)} is not locked yet. Lock the payroll month before paying it out.`, 409)
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? 'Check the layout, debit account and value date.', 400)
  const q = parsed.data
  const payees = await bankPayees(ctx, cycle)
  const file = buildBankFile({ layout: q.layout, payees, debitAccount: q.debit, mode: q.mode, valueDate: q.date, narration: q.narration })
  if (!file.rows.length) return refuse('Nobody in this month can be paid by bank transfer. Add bank accounts and IFSCs to their records first.', 409)
  await audit(ctx, {
    action: 'payroll.bank_file_exported',
    entity: 'PayrollCycle',
    entityId: cycle._id,
    summary: `Bank file (${BANK_LAYOUT_LABEL[q.layout]}) for ${cycleLabel(cycle)}: ${file.rows.length} payments, ${formatINR(file.totalPaise)}`,
    product: 'muster',
    meta: { layout: q.layout, mode: q.mode, valueDate: q.date, debitLast4: q.debit.slice(-4), payments: file.rows.length, skipped: payees.length - file.rows.length },
  })
  return csvResponse(toCsv(file.header, file.rows), `salary-${cycleMonth(cycle)}-${q.layout}.csv`)
}
