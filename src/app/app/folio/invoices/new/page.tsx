import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { FilePlus2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { BuilderEmpty } from '@/components/folio/BuilderEmpty'
import { InvoiceBuilder } from '@/components/folio/InvoiceBuilder'
import { newDocumentInitial, storedDocumentInitial } from '@/components/folio/builder-initial'
import { Invoice } from '@/models/folio/Invoice'
import { saveInvoiceDraft } from '@/modules/folio/invoices/actions'
import { builderOptions } from '@/modules/folio/invoices/builder-data'

export const metadata: Metadata = { title: 'New invoice' }

const id = (v: string | string[] | undefined) => {
  const value = first(v)
  return value && isValidObjectId(value) ? value : undefined
}

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'invoices.write' })
  const duplicateOf = id(sp.duplicateOf)
  const source = duplicateOf ? await ctx.db(Invoice).findById(duplicateOf).lean() : null
  const clientId = source ? String(source.clientId) : id(sp.clientId)
  const options = await builderOptions(ctx, { includeClientId: clientId })
  const amount = Number(first(sp.amount))
  const base = newDocumentInitial(options, { clientId, entityId: id(sp.entityId), dealId: id(sp.dealId), title: first(sp.title), amountPaise: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : undefined }, todayIST())
  const initial = source && source.billingType !== 'opening' ? storedDocumentInitial(base, source) : base
  return (
    <>
      <PageHeader title="New invoice" icon={<FilePlus2 />} breadcrumb={breadcrumbFor('/app/folio/invoices/new')} back={{ href: '/app/folio/invoices', label: 'Invoices' }} description="Build the draft. It gets a number only when you issue it." />
      <BuilderEmpty options={options} canSetUp={ctx.can('folio.settings')} />
      {options.entities.length && options.clients.length ? <InvoiceBuilder mode="invoice" options={options} initial={initial} action={saveInvoiceDraft} /> : null}
    </>
  )
}
