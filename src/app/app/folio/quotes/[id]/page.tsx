import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { ArrowRightLeft, ClipboardList, Pencil } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatDateTime, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { BilledTo, DatesBlock, DocumentHead, LinesCard, SummaryCard, SummaryRow, SummaryTotal, TextBlock } from '@/components/folio/DocumentParts'
import { InvoiceBuilder } from '@/components/folio/InvoiceBuilder'
import { QuoteActions } from '@/components/folio/QuoteActions'
import { Callout } from '@/components/folio/SetupCallout'
import { DocTypeBadge, FolioStatus, KindBadge } from '@/components/folio/StatusBadge'
import { LINK, SolidCard } from '@/components/folio/ui'
import { DocActivityCard } from '@/components/doclinks/doc-activity'
import { documentActivity } from '@/modules/doclinks/queries'
import { newDocumentInitial, storedDocumentInitial } from '@/components/folio/builder-initial'
import { Client } from '@/models/Client'
import { Invoice } from '@/models/folio/Invoice'
import { loadEntity } from '@/modules/folio/context'
import { SUPPLY_TYPE_LABELS } from '@/modules/folio/engine/gst'
import { amountInWords } from '@/modules/folio/engine/money'
import { sgstLabel, stateLabelOf } from '@/modules/folio/engine/states'
import { builderOptions } from '@/modules/folio/invoices/builder-data'
import { billToOf } from '@/modules/folio/invoices/snapshots'
import { saveQuote } from '@/modules/folio/quotes/actions'
import { quoteEmailDefaults } from '@/modules/folio/quotes/email'
import { isExpired, quoteName } from '@/modules/folio/quotes/service'
import { isQuoteEditable } from '@/modules/folio/quotes/rules'
import { Quote } from '@/models/folio/Quote'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Quote' }

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'folio', anyPerm: ['folio.read', 'quotes.write'] })
  if (!isValidObjectId(id)) notFound()
  const quote = await ctx.db(Quote).findById(id).lean()
  if (!quote) notFound()
  const name = quoteName(quote)
  const canWrite = ctx.can('quotes.write')

  if (first(sp.edit) === '1' && canWrite && isQuoteEditable(quote.status)) {
    const options = await builderOptions(ctx, { includeClientId: String(quote.clientId) })
    const base = newDocumentInitial(options, { clientId: String(quote.clientId), entityId: String(quote.entityId) }, quote.quoteDate)
    const initial = { ...storedDocumentInitial(base, quote), id, kind: quote.kind, date: quote.quoteDate, validUntil: quote.validUntil, dealId: quote.dealId ? String(quote.dealId) : undefined }
    return (
      <>
        <PageHeader title={`Edit ${name}`} icon={<Pencil />} back={{ href: `/app/folio/quotes/${id}`, label: 'Back to the quote' }} description="Every figure is recalculated when you save." />
        <InvoiceBuilder mode="quote" options={options} initial={initial} action={saveQuote} />
      </>
    )
  }

  const [client, entity, converted] = await Promise.all([
    ctx.db(Client).findById(quote.clientId).lean(),
    loadEntity(ctx, quote.entityId),
    quote.convertedInvoiceId ? ctx.db(Invoice).findById(quote.convertedInvoiceId, { number: 1, status: 1 }).lean() : null,
  ])
  const isTax = quote.documentType === 'tax_invoice'
  const expired = isExpired(quote, todayIST())
  const emailDefaults = canWrite ? await quoteEmailDefaults(ctx, quote) : null
  const sgst = sgstLabel(quote.placeOfSupplyStateCode)

  return (
    <>
      <PageHeader
        title={name}
        icon={<ClipboardList />}
        back={{ href: '/app/folio/quotes', label: 'Quotes' }}
        description={[entity.tradeName || entity.legalName, quote.subject].filter(Boolean).join(' · ')}
        actions={<QuoteActions id={id} clientId={String(quote.clientId)} name={name} status={quote.status} expired={expired} emailDefaults={emailDefaults} can={{ write: canWrite, convert: ctx.can('invoices.write') }} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={quote.kind} />
          <DocTypeBadge documentType={quote.documentType} />
          {expired ? <FolioStatus status="expired" /> : <FolioStatus status={quote.status} />}
          {isTax ? <Badge>{SUPPLY_TYPE_LABELS[quote.supplyType]}</Badge> : null}
        </div>
      </PageHeader>

      <div className="mb-4 space-y-3 empty:hidden">
        {converted ? (
          <Callout title="Converted to an invoice" action={ctx.can('folio.read') ? <Link href={`/app/folio/invoices/${quote.convertedInvoiceId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-75"><ArrowRightLeft className="size-4" />{converted.number ? `Invoice ${converted.number}` : 'Draft invoice'}</Link> : <span className="text-[13px] text-fg-2">{converted.number ? `Invoice ${converted.number}` : 'Draft invoice'}</span>}>
            The quote is closed. Changes now happen on the invoice.
          </Callout>
        ) : null}
        {expired ? <Callout tone="warning" title={`Expired on ${formatDate(quote.validUntil)}`}>Edit it and extend &quot;Valid until&quot; before sending or converting it.</Callout> : null}
        {quote.status === 'declined' ? <Callout tone="danger" title="Declined">{quote.declineReason}</Callout> : null}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <DocumentHead
            left={<BilledTo party={client ? billToOf(client) : {}} showGstin={isTax} title="Prepared for" />}
            right={
              <DatesBlock
                items={[
                  { label: 'Date', value: formatDate(quote.quoteDate) },
                  { label: 'Valid until', value: <span className={expired ? 'text-[#FF6A66]' : undefined}>{formatDate(quote.validUntil)}</span> },
                  ...(isTax && quote.placeOfSupplyStateCode ? [{ label: 'Place of supply', value: stateLabelOf(quote.placeOfSupplyStateCode) }] : []),
                  ...(quote.sentAt ? [{ label: 'Sent', value: formatDate(quote.sentAt) }] : []),
                  ...(quote.acceptedAt ? [{ label: 'Accepted', value: formatDate(quote.acceptedAt) }] : []),
                  ...(quote.dealId ? [{ label: 'Deal', value: <Link href={`/app/orbit/deals/${quote.dealId}`} className={LINK}>Open in Orbit</Link> }] : []),
                ]}
              />
            }
          />
          <LinesCard isTax={isTax} lines={quote.lines.map((l) => ({ id: String(l._id), description: l.description, hsnSac: l.hsnSac, quantity: l.quantity, unit: l.unit, ratePaise: l.ratePaise, discountPercent: l.discountPercent, gstRatePercent: l.gstRatePercent, taxablePaise: l.taxablePaise }))} />
          {quote.notes || quote.terms ? (
            <SolidCard>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextBlock label="Notes" text={quote.notes} />
                <TextBlock label="Terms" text={quote.terms} />
              </div>
            </SolidCard>
          ) : null}
        </div>
        <aside className="col-span-12 space-y-4 xl:col-span-4">
          <SummaryCard>
            <SummaryRow label="Subtotal" value={formatINR(quote.subtotalPaise)} />
            {quote.discountPaise ? <SummaryRow label="Discount" value={`− ${formatINR(quote.discountPaise)}`} /> : null}
            <SummaryRow label="Taxable value" value={formatINR(quote.taxablePaise)} strong />
            {quote.cgstPaise ? <SummaryRow label="CGST" value={formatINR(quote.cgstPaise)} /> : null}
            {quote.sgstPaise ? <SummaryRow label={sgst} value={formatINR(quote.sgstPaise)} /> : null}
            {quote.igstPaise ? <SummaryRow label="IGST" value={formatINR(quote.igstPaise)} /> : null}
            {quote.roundOffPaise ? <SummaryRow label="Round off" value={`${quote.roundOffPaise > 0 ? '+' : '−'} ${formatINR(Math.abs(quote.roundOffPaise))}`} tone="muted" /> : null}
            <SummaryTotal totalPaise={quote.totalPaise} words={amountInWords(quote.totalPaise)} />
          </SummaryCard>
          {quote.respondedOnline && quote.respondedName ? (
            <SolidCard>
              <p className="text-sm text-white">{quote.status === 'declined' ? 'Declined' : 'Accepted'} online by {quote.respondedName}</p>
              <p className="mt-1 text-xs text-fg-2">{formatDateTime(quote.acceptedAt ?? quote.declinedAt)}{quote.respondedIp ? ` · IP ${quote.respondedIp}` : ''}</p>
              {quote.respondedComment ? <p className="mt-2 whitespace-pre-line text-[13px] text-white/80">{quote.respondedComment}</p> : null}
            </SolidCard>
          ) : null}
          <DocActivityCard kind="quote" id={id} activity={await documentActivity(ctx, 'quote', id)} canManage={canWrite} />
        </aside>
      </div>
    </>
  )
}
