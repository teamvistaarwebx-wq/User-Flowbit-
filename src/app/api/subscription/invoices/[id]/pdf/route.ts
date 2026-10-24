import { isValidObjectId } from 'mongoose'
import { NextResponse } from 'next/server'
import { getCtx } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { getStaffCtx } from '@/lib/console/session'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { invoiceFileName, invoicePdf } from '@/modules/subscription/invoices'

export const runtime = 'nodejs'
export const maxDuration = 300

/** A Flowbit GST invoice PDF: billing managers of the workspace, or Console staff (on the Console host, with its own cookie). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidObjectId(id)) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  const ctx = await getCtx()
  let invoice = ctx?.can('billing.manage') ? await ctx.db(SubscriptionInvoice).findById(id).lean() : null
  if (!invoice) {
    const staff = await getStaffCtx()
    if (staff?.can('accounts.view')) invoice = await staff.raw(SubscriptionInvoice).findById(id).lean()
  }
  if (!invoice) return NextResponse.json({ error: ctx ? 'Invoice not found.' : 'Sign in again.' }, { status: ctx ? 404 : 401 })
  return pdfResponse(await invoicePdf(invoice), invoiceFileName(invoice.number))
}
