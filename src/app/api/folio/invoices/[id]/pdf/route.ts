import { isValidObjectId } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { Invoice } from '@/models/folio/Invoice'
import { pdfFilename, renderInvoicePdf } from '@/components/folio/pdf/InvoicePdf'
import { loadProfile } from '@/modules/folio/context'
import { getFolioSettings } from '@/modules/folio/settings/queries'

export const runtime = 'nodejs'
export const maxDuration = 300

/** The invoice PDF, rendered from its issue snapshots. Drafts never get one (409); opening rows have none. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('folio') || !ctx.can('folio.read')) return new Response('Not allowed', { status: 403 })
  const { id } = await params
  if (!isValidObjectId(id)) return new Response('Not found', { status: 404 })
  const invoice = await ctx.db(Invoice).findById(id).lean()
  if (!invoice || invoice.billingType === 'opening') return new Response('Not found', { status: 404 })
  if (invoice.status === 'draft') return new Response('This invoice has not been issued yet.', { status: 409 })
  try {
    const [profile, settings] = await Promise.all([loadProfile(ctx, invoice.clientId), getFolioSettings(ctx)])
    const pdf = await renderInvoicePdf(ctx.orgId, invoice, { tdsSection: profile?.tds?.section, showTds: settings.invoicing?.showTdsOnInvoice !== false })
    return pdfResponse(pdf, pdfFilename(invoice.number, 'invoice'))
  } catch (error) {
    console.error('[folio] invoice PDF failed', id, error)
    return new Response('The PDF could not be generated. Try again in a moment.', { status: 500 })
  }
}
