import type { NextRequest } from 'next/server'
import { isNewActYear, OLD_ACT_REFUSAL } from '@/modules/muster/tax/labels'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { visibleEmployeeIds } from '@/modules/muster/people/scope'
import { csvResponse, toCsv } from '@/modules/muster/reports/csv'
import { DEDUCTEE_HEADER, deducteeRows, QUARTERS, SALARY_HEADER, salaryRows } from '@/modules/muster/tax/form138'
import { deducteesFor, salaryDetailsFor } from '@/modules/muster/tax/exports'
import { can24qExport } from '@/modules/muster/tax/export-access'

export const runtime = 'nodejs'
export const maxDuration = 300

const querySchema = z.object({ fy: z.string().regex(/^\d{4}-\d{2}$/), quarter: z.enum(QUARTERS), part: z.enum(['deductees', 'salary']).default('deductees') })
const refuse = (message: string, status: number) => new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

/**
 * Salary TDS for a quarter as CSV, for the CA's Form 138 (ex-24Q) return:
 * ?fy=2026-27&quarter=Q1. Q4 also takes part=salary for the year's salary details.
 * Carries PANs, so it needs payroll and sensitive-detail rights over the whole company.
 */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster') || !ctx.hasFeature('muster.payroll')) return refuse('Not allowed', 403)
  if (!ctx.can('payroll.read') || !ctx.can('people.read_sensitive')) return refuse('The TDS export carries PANs, so it needs payroll access and access to sensitive details.', 403)
  if (!can24qExport({ payrollRead: true, sensitive: true, seesEveryone: (await visibleEmployeeIds(ctx)) === null })) return refuse('The TDS export covers the whole company, and your role sees only part of it.', 403)
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return refuse('Choose a tax year (2026-27) and a quarter (Q1 to Q4).', 400)
  const { fy, quarter, part } = parsed.data
  if (!isNewActYear(fy)) return refuse(OLD_ACT_REFUSAL, 400)
  if (part === 'salary') {
    const rows = await salaryDetailsFor(ctx, fy)
    await audit(ctx, { action: 'tax.form138_exported', entity: 'Org', entityId: ctx.orgId, summary: `Exported ${fy} salary details for Form 138 (${rows.length} people)`, product: 'muster', meta: { fy, part } })
    return csvResponse(toCsv(SALARY_HEADER, salaryRows(rows)), `form138-${fy}-salary-details.csv`)
  }
  const { rows } = await deducteesFor(ctx, fy, quarter)
  await audit(ctx, { action: 'tax.form138_exported', entity: 'Org', entityId: ctx.orgId, summary: `Exported ${fy} ${quarter} salary TDS for Form 138 (${rows.length} rows)`, product: 'muster', meta: { fy, quarter } })
  return csvResponse(toCsv(DEDUCTEE_HEADER, deducteeRows(rows)), `form138-${fy}-${quarter}.csv`)
}
