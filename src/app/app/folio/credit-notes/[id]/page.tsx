import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { FileMinus } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { DocActivityCard } from '@/components/doclinks/doc-activity'
import { documentActivity } from '@/modules/doclinks/queries'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { PageHeader } from '@/components/ui/page-header'
import { CreditNoteActions } from '@/components/folio/CreditNoteActions'
import { BilledTo, DatesBlock, DocumentHead, LinesCard, SummaryCard, SummaryRow, SummaryTotal, TextBlock } from '@/components/folio/DocumentParts'
import { Callout } from '@/components/folio/SetupCallout'
import { DocTypeBadge, FolioStatus } from '@/components/folio/StatusBadge'
import { LINK } from '@/components/folio/ui'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { creditNoteEmailDefaults } from '@/modules/folio/credit-notes/email'
import { amountInWords } from '@/modules/folio/engine/money'
import { reverseChargeNote } from '@/modules/folio/invoices/rules'
import { sgstLabel } from '@/modules/folio/engine/states'
import { CREDIT_NOTE_REASON_LABELS } from '@/modules/folio/types'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Credit note' }

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  if (!isValidObjectId(id)) notFound()
  const note = await ctx.db(CreditNote).findById(id).lean()
  const invoice = note ? await ctx.db(Invoice).findById(note.invoiceId).lean() : null
  if (!note || !invoice) notFound()
  const isTax = note.documentType === 'tax_invoice'
  const canWrite = ctx.can('credit_notes.write')
  const emailDefaults = canWrite && note.status === 'issued' ? await creditNoteEmailDefaults(ctx, note, invoice) : null
  return (
    <>
      <PageHeader
        title={`Credit note ${note.number}`}
        icon={<FileMinus />}
        back={{ href: '/app/folio/credit-notes', label: 'Credit notes' }}
        description={`Against invoice ${invoice.number} dated ${formatDate(invoice.issueDate)}`}
        actions={<CreditNoteActions id={id} number={note.number} invoiceNumber={invoice.number ?? ''} clientId={String(note.clientId)} status={note.status} canWrite={canWrite} emailDefaults={emailDefaults} />}
      >
        <div className="flex flex-wrap items-center gap-2"><DocTypeBadge documentType={note.documentType} /><FolioStatus status={note.status} /></div>
      </PageHeader>
      {note.status === 'cancelled' ? <Callout tone="warning" className="mb-4" title={`Cancelled ${formatDateTime(note.cancelledAt)}`}>{note.cancelReason}. {invoice.number} is owed again; the number stays spent.</Callout> : null}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <DocumentHead
            left={<BilledTo party={{ ...(invoice.billTo ?? {}), gstin: note.clientGstin }} showGstin={isTax} title="Credited to" />}
            right={
              <DatesBlock
                items={[
                  { label: 'Note date', value: formatDate(note.noteDate) },
                  { label: 'Against', value: <Link href={`/app/folio/invoices/${invoice._id}`} className={LINK}>{invoice.number}</Link> },
                  { label: 'Reason', value: CREDIT_NOTE_REASON_LABELS[note.reason] },
                ]}
              />
            }
            footer={note.reasonText ? <TextBlock label="Reason, as printed" text={note.reasonText} /> : undefined}
          />
          <LinesCard title="Credited lines" isTax={isTax} lines={note.lines.map((l) => ({ id: String(l._id), description: l.description, hsnSac: l.hsnSac, quantity: 1, unit: '', ratePaise: l.taxablePaise, gstRatePercent: l.gstRatePercent, taxablePaise: l.taxablePaise }))} />
        </div>
        <aside className="col-span-12 space-y-4 xl:col-span-4">
          <SummaryCard>
            <SummaryRow label="Taxable value" value={formatINR(note.taxablePaise)} strong />
            {note.cgstPaise ? <SummaryRow label="CGST" value={formatINR(note.cgstPaise)} /> : null}
            {note.sgstPaise ? <SummaryRow label={sgstLabel(note.placeOfSupplyStateCode)} value={formatINR(note.sgstPaise)} /> : null}
            {note.igstPaise ? <SummaryRow label="IGST" value={formatINR(note.igstPaise)} /> : null}
            {note.roundOffPaise ? <SummaryRow label="Round off" value={`${note.roundOffPaise > 0 ? '+' : '−'} ${formatINR(Math.abs(note.roundOffPaise))}`} tone="muted" /> : null}
            <SummaryTotal label="Total credit" totalPaise={note.totalPaise} words={amountInWords(note.totalPaise)} />
            {!isTax ? <p className="text-xs text-fg-2">Not a tax document. No GST was charged on the invoice.</p> : null}
            {note.reverseCharge && note.cgstPaise + note.sgstPaise + note.igstPaise > 0 ? <p className="text-xs text-fg-2">{reverseChargeNote(note.cgstPaise + note.sgstPaise + note.igstPaise, formatINR)}</p> : null}
          </SummaryCard>
          <DocActivityCard kind="credit_note" id={id} activity={await documentActivity(ctx, 'credit_note', id)} canManage={canWrite} />
        </aside>
      </div>
    </>
  )
}
