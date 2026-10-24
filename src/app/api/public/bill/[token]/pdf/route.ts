import { pdfResponse } from '@/lib/pdf/base'
import { billByToken } from '@/modules/billing/public-bill'
import { invoiceFileName, invoicePdf } from '@/modules/subscription/invoices'

export const runtime = 'nodejs'
export const maxDuration = 300

/** The PDF of a Flowbit bill or invoice by its public link (WhatsApp document headers fetch this). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const bill = await billByToken(token)
  if (!bill) return new Response('This link is not available.', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })
  try {
    const response = pdfResponse(await invoicePdf(bill), invoiceFileName(bill.number))
    response.headers.set('cache-control', 'private, no-store')
    response.headers.set('x-robots-tag', 'noindex')
    return response
  } catch (error) {
    console.error('[billing] public PDF failed', bill.number, error)
    return new Response('The PDF could not be generated. Try again in a moment.', { status: 500 })
  }
}
