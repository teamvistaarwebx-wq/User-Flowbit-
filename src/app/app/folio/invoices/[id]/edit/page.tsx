import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound, redirect } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { BuilderEmpty } from '@/components/folio/BuilderEmpty'
import { InvoiceBuilder } from '@/components/folio/InvoiceBuilder'
import { newDocumentInitial, storedDocumentInitial } from '@/components/folio/builder-initial'
import { Invoice } from '@/models/folio/Invoice'
import { saveInvoiceDraft } from '@/modules/folio/invoices/actions'
import { builderOptions } from '@/modules/folio/invoices/builder-data'

export const metadata: Metadata = { title: 'Edit invoice' }

/** Only drafts can be edited; anything issued goes back to its detail page. */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'folio', perm: 'invoices.write' })
  if (!isValidObjectId(id)) notFound()
  const invoice = await ctx.db(Invoice).findById(id).lean()
  if (!invoice) notFound()
  if (invoice.status !== 'draft' || invoice.billingType === 'opening') redirect(`/app/folio/invoices/${id}`)
  const options = await builderOptions(ctx, { includeClientId: String(invoice.clientId) })
  const base = newDocumentInitial(options, { clientId: String(invoice.clientId), entityId: String(invoice.entityId) }, invoice.issueDate)
  const initial = {
    ...storedDocumentInitial(base, invoice),
    id,
    date: invoice.issueDate,
    paymentTermsDays: String(invoice.paymentTermsDays),
    billingType: invoice.billingType,
    purchaseOrderRef: invoice.purchaseOrderRef ?? '',
    bankAccountId: invoice.bankAccountId ? String(invoice.bankAccountId) : '',
    reverseCharge: invoice.reverseCharge,
    periodStart: invoice.periodStart ?? '',
    periodEnd: invoice.periodEnd ?? '',
    internalNotes: invoice.internalNotes ?? '',
    dealId: undefined,
  }
  return (
    <>
      <PageHeader title="Edit draft invoice" icon={<Pencil />} breadcrumb={breadcrumbFor(`/app/folio/invoices/${id}/edit`)} back={{ href: `/app/folio/invoices/${id}`, label: 'Back to the invoice' }} description="Every figure is recalculated when you save." />
      <BuilderEmpty options={options} canSetUp={ctx.can('folio.settings')} />
      {options.entities.length && options.clients.length ? <InvoiceBuilder mode="invoice" options={options} initial={initial} action={saveInvoiceDraft} /> : null}
    </>
  )
}
