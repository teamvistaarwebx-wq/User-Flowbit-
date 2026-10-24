import { isValidObjectId } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { Quote } from '@/models/folio/Quote'
import { pdfFilename } from '@/components/folio/pdf/InvoicePdf'
import { renderQuotePdf } from '@/components/folio/pdf/QuotePdf'
import { loadClient, loadEntity } from '@/modules/folio/context'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Quote or proforma PDF, any status ("DRAFT" mark on drafts). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('folio') || !ctx.canAny('folio.read', 'quotes.write')) return new Response('Not allowed', { status: 403 })
  const { id } = await params
  if (!isValidObjectId(id)) return new Response('Not found', { status: 404 })
  const quote = await ctx.db(Quote).findById(id).lean()
  if (!quote) return new Response('Not found', { status: 404 })
  try {
    const [entity, client] = await Promise.all([loadEntity(ctx, quote.entityId), loadClient(ctx, quote.clientId)])
    return pdfResponse(await renderQuotePdf(ctx.orgId, quote, entity, client), pdfFilename(quote.number, 'quote'))
  } catch (error) {
    console.error('[folio] quote PDF failed', id, error)
    return new Response('The PDF could not be generated. Try again in a moment.', { status: 500 })
  }
}
