import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { ChevronRight, FileMinus } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { CreditNoteForm } from '@/components/folio/CreditNoteForm'
import { Callout } from '@/components/folio/SetupCallout'
import { InvoiceStatusBadge } from '@/components/folio/StatusBadge'
import { LINK, TableCard, TBODY_ROW } from '@/components/folio/ui'
import { cn } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Invoice } from '@/models/folio/Invoice'
import { creditableInvoices } from '@/modules/folio/credit-notes/queries'
import { creditRoundsTotal, section34Warning } from '@/modules/folio/credit-notes/rules'
import { creditedByLine } from '@/modules/folio/credit-notes/service'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { outstandingFor } from '@/modules/folio/settlement'

export const metadata: Metadata = { title: 'New credit note' }

const BASE = '/app/folio/credit-notes/new'

/** Without ?invoiceId= this is the invoice picker; with it, the credit note form. */
export default async function NewCreditNotePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'credit_notes.write' })
  const invoiceId = first(sp.invoiceId)
  const header = <PageHeader title="New credit note" icon={<FileMinus />} breadcrumb={breadcrumbFor(BASE)} back={{ href: '/app/folio/credit-notes', label: 'Credit notes' }} description="Reduce what a client owes on one issued invoice." />

  if (!invoiceId) {
    const invoices = await creditableInvoices(ctx, first(sp.q) ?? '')
    return (
      <>
        {header}
        <TableCard icon={<FileMinus />} title="Pick the invoice to credit" subtitle="Only an issued invoice with something outstanding can take a credit note. For a paid one, release a payment from it first." actions={<SearchInput placeholder="Invoice number" className="w-full sm:w-72" />}>
          {invoices.length ? (
            <ul className="border-t border-line py-1.5">
              {invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`${BASE}?invoiceId=${i.id}`} className={cn('flex items-center justify-between gap-3 px-[23px] py-2.5 text-[13px]', TBODY_ROW)}>
                    <span className="min-w-0"><span className="font-medium text-white">{i.number}</span><span className="ml-3 text-[#979797]">{i.clientName} · {formatDate(i.issueDate)}</span></span>
                    <span className="flex shrink-0 items-center gap-3"><InvoiceStatusBadge status={i.status} /><span className="tabular-nums text-white">{formatINR(i.totalPaise)}</span><ChevronRight className="size-4 text-fg-3" strokeWidth={1.5} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-line">
              <EmptyState compact icon={<FileMinus />} title="No invoices to credit" description="Credit notes are raised against issued invoices that still have something outstanding." />
            </div>
          )}
        </TableCard>
      </>
    )
  }

  if (!isValidObjectId(invoiceId)) notFound()
  const invoice = await ctx.db(Invoice).findById(invoiceId).lean()
  if (!invoice) notFound()
  const creditable = ['issued', 'part_paid', 'paid'].includes(invoice.status) && invoice.billingType !== 'opening'
  const [client, credited, open, settings] = await Promise.all([ctx.db(Client).findById(invoice.clientId, { name: 1 }).lean(), creditedByLine(ctx, invoice._id), outstandingFor(ctx, invoice._id), getFolioSettings(ctx)])
  return (
    <>
      {header}
      {!creditable ? (
        <Callout tone="warning" title="This invoice cannot take a credit note.">Credit notes can only be raised against an issued invoice. <Link href={`/app/folio/invoices/${invoice._id}`} className={LINK}>Back to {invoice.number ?? 'the draft'}</Link></Callout>
      ) : (
        <CreditNoteForm
          invoiceId={String(invoice._id)}
          invoiceNumber={invoice.number ?? ''}
          clientName={client?.name ?? 'the client'}
          documentType={invoice.documentType}
          supplyType={invoice.supplyType}
          placeOfSupplyStateCode={invoice.placeOfSupplyStateCode ?? null}
          outstandingPaise={Math.max(0, open.outstanding)}
          lines={invoice.lines.map((l) => ({ id: String(l._id), description: l.description, taxablePaise: l.taxablePaise, creditedPaise: credited.get(String(l._id)) ?? 0, gstRatePercent: l.gstRatePercent }))}
          today={todayIST()}
          roundOffTotal={creditRoundsTotal(invoice, settings.invoicing?.roundOffTotal !== false)}
          reverseCharge={Boolean(invoice.reverseCharge)}
          section34Warning={section34Warning(invoice.issueDate, todayIST(), formatDate)}
        />
      )}
    </>
  )
}
