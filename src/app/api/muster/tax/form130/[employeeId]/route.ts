import { NextResponse, type NextRequest } from 'next/server'
import { isNewActYear, OLD_ACT_REFUSAL } from '@/modules/muster/tax/labels'
import { isValidObjectId } from 'mongoose'
import { audit } from '@/lib/audit'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { Employee } from '@/models/muster/Employee'
import { companyPdfOf, pdfSignature } from '@/lib/pdf/org-branding'
import { form130Signer } from '@/modules/muster/tax/form130-signer'
import { ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { form130For } from '@/modules/muster/tax/exports'
import { renderForm130Pdf } from '@/modules/muster/tax/form130-pdf'
import { taxYearSettings } from '@/modules/muster/tax/queries'
import { worksheetView } from '@/modules/muster/tax/worksheet-view'

export const runtime = 'nodejs'
export const maxDuration = 300

const deny = (status: number, error: string) => NextResponse.json({ error }, { status })
const maskPan = (pan: string) => (pan.length === 10 ? `XXXXX${pan.slice(5)}` : pan)

/**
 * Form 130 Part B PDF for one person and tax year: GET /api/muster/tax/form130/<employeeId>?fy=2026-27.
 * The person themselves, or payroll readers who can see them (PAN masked without sensitive-detail rights).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return deny(401, 'Sign in again.')
  if (!ctx.has('muster') || !ctx.hasFeature('muster.payroll')) return deny(403, 'Payroll is not active on this workspace.')
  const { employeeId } = await params
  if (!isValidObjectId(employeeId)) return deny(404, 'Not found.')
  const own = employeeId === ownEmployeeId(ctx)
  if (!own) {
    const visible = ctx.can('payroll.read') ? await visibleEmployeeIds(ctx) : []
    if (visible !== null && !visible.includes(employeeId)) return deny(404, 'Not found.')
  }
  const fy = request.nextUrl.searchParams.get('fy') ?? ''
  if (!/^\d{4}-\d{2}$/.test(fy)) return deny(400, 'Choose a tax year, like 2026-27.')
  if (!isNewActYear(fy)) return deny(400, OLD_ACT_REFUSAL)
  const employee = await ctx.db(Employee).findOne({ _id: employeeId, deletedAt: null }).lean()
  if (!employee) return deny(404, 'Not found.')
  const [year, settings] = await Promise.all([form130For(ctx, fy, employee._id), taxYearSettings(ctx, fy)])
  const tax = year.tax ?? (await worksheetView(ctx, employee, fy))?.tax ?? null
  if (!tax) return deny(409, 'There is no tax worksheet for this year yet: add a salary structure first.')
  const fyStart = `${fy.slice(0, 4)}-04-01`
  const fyEnd = `${Number(fy.slice(0, 4)) + 1}-03-31`
  const pan = employee.pan ?? ''
  const showPan = own || ctx.can('people.read_sensitive')
  const company = await companyPdfOf(ctx.org)
  const signer = form130Signer(settings?.signatory, company.profile)
  const signature = await pdfSignature(ctx.orgId, company.profile.legalName, signer.signatory ? { ...signer.signatory, name: signer.name, designation: signer.designation } : signer.name ? { name: signer.name, designation: signer.designation } : null)
  const pdf = await renderForm130Pdf(company.letterhead, {
    fy,
    employee: { name: employee.fullName, code: employee.code, pan: showPan ? pan : maskPan(pan), designation: employee.designation ?? '', from: employee.joinDate > fyStart ? employee.joinDate : fyStart, to: employee.exitDate && employee.exitDate < fyEnd ? employee.exitDate : fyEnd },
    employer: { tan: settings?.tan ?? '', pan: company.profile.pan ?? '' },
    signatory: { name: signer.name, designation: signer.designation, place: signer.place },
    signature,
    quarters: year.quarters,
    tax,
    complete: year.complete && Boolean(year.tax),
  })
  if (!own) await audit(ctx, { action: 'tax.form130_downloaded', entity: 'Employee', entityId: employee._id, summary: `Downloaded ${employee.fullName}'s Form 130 Part B for ${fy}`, product: 'muster' })
  return pdfResponse(pdf, `form130-part-b-${fy}-${employee.code}.pdf`, request.nextUrl.searchParams.get('download') !== '1')
}
