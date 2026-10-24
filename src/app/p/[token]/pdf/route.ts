import { NextResponse, type NextRequest } from 'next/server'
import { storedFileResponse } from '@/lib/file-response'
import { loadPayslipLink, PAYSLIP_COOKIE, payslipFile, payslipSessionValid } from '@/modules/muster/payroll/payslip-link'

export const runtime = 'nodejs'

/** The payslip PDF of a WhatsApp payslip link, only after the emailed code was entered on its page (15 minutes). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await loadPayslipLink(token)
  if (!view || !payslipSessionValid(request.cookies.get(PAYSLIP_COOKIE)?.value, view.linkId)) return NextResponse.redirect(new URL(`/p/${token}`, request.url))
  const file = await payslipFile(view)
  const response = file ? await storedFileResponse(file, { disposition: 'attachment', cacheControl: 'private, no-store' }) : null
  return response ?? NextResponse.json({ error: 'The payslip file is not available. Ask HR.' }, { status: 404 })
}
