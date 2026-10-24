import { isValidObjectId } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { renderCreditNotePdf } from '@/components/folio/pdf/CreditNotePdf'
import { pdfFilename } from '@/components/folio/pdf/InvoicePdf'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Credit note PDF (a "CANCELLED" mark when cancelled). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('folio') || !ctx.can('folio.read')) return new Response('Not allowed', { status: 403 })
  const { id } = await params
  if (!isValidObjectId(id)) return new Response('Not found', { status: 404 })
  const note = await ctx.db(CreditNote).findById(id).lean()
  const invoice = note ? await ctx.db(Invoice).findById(note.invoiceId).lean() : null
  if (!note || !invoice) return new Response('Not found', { status: 404 })
  try {
    return pdfResponse(await renderCreditNotePdf(ctx.orgId, note, invoice), pdfFilename(note.number, 'credit-note'))
  } catch (error) {
    console.error('[folio] credit note PDF failed', id, error)
    return new Response('The PDF could not be generated. Try again in a moment.', { status: 500 })
  }
}
