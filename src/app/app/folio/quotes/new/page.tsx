import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { ClipboardList } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { BuilderEmpty } from '@/components/folio/BuilderEmpty'
import { InvoiceBuilder } from '@/components/folio/InvoiceBuilder'
import { newDocumentInitial } from '@/components/folio/builder-initial'
import { builderOptions } from '@/modules/folio/invoices/builder-data'
import { saveQuote } from '@/modules/folio/quotes/actions'

export const metadata: Metadata = { title: 'New quote' }

const id = (v: string | string[] | undefined) => {
  const value = first(v)
  return value && isValidObjectId(value) ? value : undefined
}

/** Accepts the Orbit prefill: ?clientId=&dealId=&title=&amount=<paise>, and ?kind=proforma. */
export default async function NewQuotePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'quotes.write' })
  const clientId = id(sp.clientId)
  const options = await builderOptions(ctx, { includeClientId: clientId })
  const amount = Number(first(sp.amount))
  const initial = {
    ...newDocumentInitial(options, { clientId, entityId: id(sp.entityId), dealId: id(sp.dealId), title: first(sp.title), amountPaise: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : undefined }, todayIST()),
    kind: first(sp.kind) === 'proforma' ? ('proforma' as const) : ('quote' as const),
  }
  return (
    <>
      <PageHeader title={initial.kind === 'proforma' ? 'New proforma' : 'New quote'} icon={<ClipboardList />} breadcrumb={breadcrumbFor('/app/folio/quotes/new', ctx)} back={{ href: '/app/folio/quotes', label: 'Quotes' }} description="Priced exactly like an invoice. It stays editable until it is converted." />
      <BuilderEmpty options={options} canSetUp={ctx.can('folio.settings')} />
      {options.entities.length && options.clients.length ? <InvoiceBuilder mode="quote" options={options} initial={initial} action={saveQuote} /> : null}
    </>
  )
}
