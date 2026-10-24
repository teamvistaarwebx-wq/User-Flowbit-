import { NextResponse, type NextRequest } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { audit } from '@/lib/audit'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { renderEntryPayslip } from '@/modules/muster/payroll/payslips'
import { ownEmployeeId } from '@/modules/muster/people/scope'
import { localeOfUser } from '@/lib/i18n'

export const runtime = 'nodejs'
export const maxDuration = 300

const deny = (status: number, error: string) => NextResponse.json({ error }, { status })

/**
 * Payslip PDF for a payroll entry: GET /api/muster/payslips/<entryId>[?download=1].
 * Payroll readers get any entry; everyone else only their own, once published.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return deny(401, 'Sign in again.')
  if (!ctx.has('muster')) return deny(403, 'Muster is not active on this workspace.')
  const { id } = await params
  if (!isValidObjectId(id)) return deny(404, 'Payslip not found.')
  const entry = await ctx.db(PayrollEntry).findById(id).lean()
  if (!entry) return deny(404, 'Payslip not found.')
  const own = String(entry.employeeId) === ownEmployeeId(ctx)
  if (!ctx.can('payroll.read')) {
    if (!own || !(await ctx.db(Payslip).exists({ entryId: entry._id, isPublished: true }))) return deny(404, 'Payslip not found.')
  }
  const cycle = await ctx.db(PayrollCycle).findById(entry.cycleId, { year: 1, month: 1 }).lean()
  if (!cycle) return deny(404, 'Payslip not found.')
  // Bilingual Hindi/English when asked (?lang=hi) or when the viewer reads Flowbit in Hindi; ?lang=en forces English.
  const lang = request.nextUrl.searchParams.get('lang')
  const language = lang === 'hi' || (lang !== 'en' && localeOfUser(ctx.user) === 'hi') ? 'bilingual' : 'en'
  const { pdf, filename } = await renderEntryPayslip(ctx, cycle, entry, { maskIds: !own && !ctx.can('people.read_sensitive'), language })
  if (!own) await audit(ctx, { action: 'payroll.payslip_downloaded', entity: 'PayrollEntry', entityId: entry._id, summary: `Downloaded ${entry.employeeName}'s payslip for ${cycle.month}/${cycle.year}`, product: 'muster' })
  return pdfResponse(pdf, filename, request.nextUrl.searchParams.get('download') !== '1')
}
