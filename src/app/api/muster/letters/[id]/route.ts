import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { getLetter } from '@/modules/muster/letters/queries'
import { letterFileName, renderLetterPdf } from '@/modules/muster/letters/pdf'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'

export const runtime = 'nodejs'
export const maxDuration = 300

const deny = (status: number, error: string) => NextResponse.json({ error }, { status })

/**
 * Letter PDF: GET /api/muster/letters/<id>[?download=1]. HR readers (letters.read,
 * person visible, payroll.read for pay letters) see drafts as DRAFT; the person
 * gets their own issued letters. Revoked letters carry a REVOKED watermark.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return deny(401, 'Sign in again.')
  if (!ctx.has('muster')) return deny(403, 'Muster is not active on this workspace.')
  const { id } = await params
  const letter = await getLetter(ctx, id)
  if (!letter) return deny(404, 'Letter not found.')
  const own = String(letter.employeeId) === ownEmployeeId(ctx)
  const visible = await visibleEmployeeIds(ctx)
  // Nobody reads a draft about themselves before HR issues it (unless they may decide their own record).
  const ownDraft = own && letter.status === 'draft' && !mayDecideOwn(ctx)
  const hrReader = !ownDraft && ctx.can('letters.read') && (visible === null || visible.includes(String(letter.employeeId))) && (!letter.statesPay || ctx.can('payroll.read'))
  const ownIssued = own && letter.status !== 'draft'
  if (!hrReader && !ownIssued) return deny(404, 'Letter not found.')
  const pdf = await renderLetterPdf(ctx.org, { ...letter, watermark: letter.status === 'revoked' ? 'REVOKED' : letter.status === 'draft' ? 'DRAFT' : undefined })
  const filename = letter.status === 'draft' ? `DRAFT-${letterFileName(letter.referenceNumber, letter.employeeName)}` : letterFileName(letter.referenceNumber, letter.employeeName)
  return pdfResponse(pdf, filename, request.nextUrl.searchParams.get('download') !== '1')
}
