import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { FileMinus, FileText, History, IndianRupee, Mail, MessageCircle, PhoneCall, StickyNote } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatDateTime } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { BilledTo, DatesBlock, DocumentHead, LinesCard, SummaryCard, SummaryRow, SummaryTotal, TextBlock } from '@/components/folio/DocumentParts'
import { InvoiceActions } from '@/components/folio/InvoiceActions'
import { Callout } from '@/components/folio/SetupCallout'
import { DocTypeBadge, FolioStatus, InvoiceStatusBadge, WrittenOffBadge } from '@/components/folio/StatusBadge'
import { INSET, LINK, PanelHeader, SolidCard, TableCard, TBODY_ROW } from '@/components/folio/ui'
import { SUPPLY_TYPE_LABELS, isTaxable } from '@/modules/folio/engine/gst'
import { amountInWords } from '@/modules/folio/engine/money'
import { reverseChargeNote } from '@/modules/folio/invoices/rules'
import { sgstLabel, stateLabelOf } from '@/modules/folio/engine/states'
import { followupOptions } from '@/modules/folio/collections/queries'
import { invoiceEmailDefaults } from '@/modules/folio/invoices/email'
import { billToOf } from '@/modules/folio/invoices/snapshots'
import { daysOverdue, invoiceDetail } from '@/modules/folio/invoices/queries'
import { BILLING_TYPE_LABELS, CREDIT_NOTE_REASON_LABELS } from '@/modules/folio/types'
import { DocActivityCard } from '@/components/doclinks/doc-activity'
import { PaymentLinkButton } from '@/components/payments/payment-link-button'
import { documentActivity } from '@/modules/doclinks/queries'
import { gatewayInfo } from '@/modules/payments/gateway'
import { PaymentLink } from '@/models/payments/PaymentLink'
import { CreditCard, QrCode } from 'lucide-react'
import { EinvoicePanel } from '@/components/folio/einvoice/EinvoicePanel'
import { activeEinvoice, einvoiceSettingsFor } from '@/modules/folio/einvoice/service'
import { cancelWindowOpen, ineligibleReason } from '@/modules/folio/einvoice/payload'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Invoice' }

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  if (!isValidObjectId(id)) notFound()
  const detail = await invoiceDetail(ctx, id).catch((error: unknown) => (error instanceof NotFoundError ? null : Promise.reject(error)))
  if (!detail) notFound()
  const { invoice, client, entity, profile, payments, creditNotes, messages, followups, peek, issueDateDefault } = detail
  const isTax = invoice.documentType === 'tax_invoice'
  const isOpening = invoice.billingType === 'opening'
  const overdue = daysOverdue(invoice)
  const issued = ['issued', 'part_paid', 'paid'].includes(invoice.status)
  const party = invoice.status === 'draft' && client ? billToOf(client) : (invoice.billTo ?? {})
  const canEmail = ctx.canAny('invoices.write', 'invoices.issue')
  const emailDefaults = issued && !isOpening && canEmail ? await invoiceEmailDefaults(ctx, invoice) : null
  const collectable = ['issued', 'part_paid'].includes(invoice.status) && invoice.balancePaise > 0 && ctx.can('collections.write')
  const allFollowup = collectable ? await followupOptions(ctx) : null
  const invoiceFollowupOptions = allFollowup ? { ...allFollowup, clients: allFollowup.clients.filter((c) => c.id === String(invoice.clientId)), invoices: allFollowup.invoices.filter((i) => i.id === id) } : null
  const sgst = sgstLabel(invoice.placeOfSupplyStateCode)
  const settled = invoice.paidPaise + invoice.tdsReceivedPaise + invoice.creditedPaise > 0
  const shareable = invoice.status !== 'draft' && !isOpening
  const activity = shareable ? await documentActivity(ctx, 'invoice', id) : null
  const canLink = collectable || (['issued', 'part_paid'].includes(invoice.status) && invoice.balancePaise > 0 && ctx.canAny('invoices.write', 'invoices.issue'))
  const gateway = canLink && !isOpening ? await gatewayInfo(ctx.orgId) : null
  const einvSettings = isTax && issued ? await einvoiceSettingsFor(ctx, invoice.entityId) : null
  const einv = einvSettings?.enabled ? await activeEinvoice(ctx, invoice._id) : null
  const payLink = gateway?.connected && gateway.enabled ? await ctx.db(PaymentLink).findOne({ invoiceId: invoice._id, status: 'created', amountPaise: invoice.balancePaise }).sort({ createdAt: -1 }).lean() : null

  return (
    <>
      <PageHeader
        title={invoice.number ?? 'Draft invoice'}
        icon={<FileText />}
        back={{ href: '/app/folio/invoices', label: 'Invoices' }}
        description={[entity.legalName, invoice.subject].filter(Boolean).join(' · ')}
        actions={
          <InvoiceActions
            id={id}
            clientId={String(invoice.clientId)}
            status={invoice.status}
            number={invoice.number ?? null}
            peek={peek}
            issueDate={issueDateDefault}
            isOpening={isOpening}
            writtenOff={invoice.writtenOffPaise > 0}
            settled={settled}
            balancePaise={invoice.balancePaise}
            emailDefaults={emailDefaults}
            followupOptions={invoiceFollowupOptions}
            can={{
              edit: ctx.can('invoices.write'),
              issue: ctx.can('invoices.issue'),
              void: ctx.can('invoices.void'),
              delete: ctx.can('invoices.issue') || (ctx.can('invoices.write') && String(invoice.createdBy) === String(ctx.memberId)),
              receipt: ctx.can('receipts.write'),
              credit: ctx.can('credit_notes.write'),
              collect: ctx.can('collections.write'),
              email: canEmail,
            }}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <DocTypeBadge documentType={invoice.documentType} />
          <InvoiceStatusBadge status={invoice.status} daysOverdue={overdue} />
          {invoice.billingType !== 'one_time' ? <Badge>{BILLING_TYPE_LABELS[invoice.billingType]}</Badge> : null}
          {isTax && !isOpening ? <Badge>{SUPPLY_TYPE_LABELS[invoice.supplyType]}</Badge> : null}
          {invoice.writtenOffPaise > 0 && invoice.status !== 'void' ? <WrittenOffBadge /> : null}
          {invoice.quoteId ? <Link href={`/app/folio/quotes/${invoice.quoteId}`} className="transition-opacity hover:opacity-80"><Badge>From a quote</Badge></Link> : null}
        </div>
      </PageHeader>

      <div className="mb-4 space-y-3 empty:hidden">
        {invoice.status === 'draft' ? (
          <Callout title="This is still a draft.">It carries no number and is not a legal document yet. Issuing it takes the next number in {entity.code}&apos;s series ({peek}) and locks the figures.</Callout>
        ) : null}
        {invoice.status === 'draft' && invoice.documentType === 'tax_invoice' && isTaxable(invoice.supplyType) && !invoice.placeOfSupplyStateCode ? (
          <Callout tone="warning" title="No place of supply.">A tax invoice must show where the supply is made, so this draft cannot be issued yet. Add {client?.name ?? 'the client'}&apos;s state on the client, or pick the place of supply when you edit the draft.</Callout>
        ) : null}
        {overdue > 0 ? (
          <Callout tone="danger" title={`Overdue by ${overdue} days.`} action={ctx.can('collections.write') ? <Button size="sm" variant="secondary" href={`/app/folio/collections?client=${invoice.clientId}`}>Work the follow-up</Button> : null}>
            {formatINR(invoice.balancePaise)} was due on {formatDate(invoice.dueDate)}.
          </Callout>
        ) : null}
        {invoice.status === 'void' ? <Callout tone="warning" title={`Voided ${formatDateTime(invoice.voidedAt)}`}>{invoice.voidReason}. The number stays spent.</Callout> : null}
        {invoice.writtenOffPaise > 0 ? <Callout tone="warning" title={`${formatINR(invoice.writtenOffPaise)} written off ${formatDateTime(invoice.writtenOffAt)}`}>{invoice.writeOffReason}</Callout> : null}
        {isOpening ? <Callout title="Opening balance">What {client?.name ?? 'the client'} owed before Folio. It is settled by receipts like any invoice, and stays out of GST and revenue.</Callout> : null}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <DocumentHead
            left={<BilledTo party={party} showGstin={isTax} />}
            right={
              <DatesBlock
                items={[
                  { label: 'Invoice date', value: formatDate(invoice.issueDate) },
                  { label: 'Due date', value: formatDate(invoice.dueDate) },
                  { label: 'Terms', value: `${invoice.paymentTermsDays} days` },
                  ...(invoice.periodStart && invoice.periodEnd ? [{ label: 'Service period', value: `${formatDate(invoice.periodStart, { short: true })} – ${formatDate(invoice.periodEnd)}` }] : []),
                  ...(invoice.purchaseOrderRef ? [{ label: 'Your PO', value: invoice.purchaseOrderRef }] : []),
                  ...(isTax && invoice.placeOfSupplyStateCode ? [{ label: 'Place of supply', value: stateLabelOf(invoice.placeOfSupplyStateCode) }] : []),
                  ...(isTax ? [{ label: 'Reverse charge', value: invoice.reverseCharge ? 'Yes' : 'No' }] : []),
                ]}
              />
            }
          />

          <LinesCard isTax={isTax} lines={invoice.lines.map((l) => ({ id: String(l._id), description: l.description, hsnSac: l.hsnSac, quantity: l.quantity, unit: l.unit, ratePaise: l.ratePaise, discountPercent: l.discountPercent, gstRatePercent: l.gstRatePercent, taxablePaise: l.taxablePaise }))} />

          {invoice.notes || invoice.terms ? (
            <SolidCard>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextBlock label="Notes" text={invoice.notes} />
                <TextBlock label="Terms" text={invoice.terms} />
              </div>
            </SolidCard>
          ) : null}

          {invoice.status !== 'draft' ? (
            <TableCard
              icon={<IndianRupee />}
              title="Payments against this invoice"
              subtitle={payments.length ? `${payments.length} ${payments.length === 1 ? 'payment' : 'payments'} applied` : undefined}
              actions={ctx.can('receipts.write') && invoice.balancePaise > 0 && invoice.status !== 'void' ? <Button size="sm" variant="secondary" href={`/app/folio/receipts/new?clientId=${invoice.clientId}&invoiceId=${id}`}>Record payment</Button> : null}
            >
              {payments.length ? (
                <ul className="border-t border-line py-1.5">
                  {payments.map((p) => (
                    <li key={p.id} className={cn('flex flex-wrap items-center justify-between gap-3 px-[23px] py-2.5 text-[13px]', TBODY_ROW)}>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={`/app/folio/receipts/${p.id}`} className={cn('font-medium', LINK)}>{p.number}</Link>
                        <span className="text-[#979797]">{formatDate(p.receivedOn)} · {p.mode.replace(/_/g, ' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                        {p.status !== 'recorded' ? <FolioStatus status={p.status === 'bounced' ? 'declined' : 'cancelled'} label={p.status === 'bounced' ? 'Bounced' : 'Cancelled'} /> : null}
                      </span>
                      <span className="tabular-nums text-white">{formatINR(p.amountPaise)}{p.tdsPaise ? <span className="ml-2 text-xs text-fg-2">+ TDS {formatINR(p.tdsPaise)}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="border-t border-line">
                  <EmptyState compact icon={<IndianRupee />} title="No payments applied yet." description="Record one as it lands and the balance updates here." />
                </div>
              )}
            </TableCard>
          ) : null}

          {creditNotes.length ? (
            <TableCard icon={<FileMinus />} title="Credit notes">
              <ul className="border-t border-line py-1.5">
                {creditNotes.map((c) => (
                  <li key={String(c._id)} className={cn('flex flex-wrap items-center justify-between gap-3 px-[23px] py-2.5 text-[13px]', TBODY_ROW)}>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <Link href={`/app/folio/credit-notes/${c._id}`} className={cn('font-medium', LINK)}>{c.number}</Link>
                      <span className="text-[#979797]">{formatDate(c.noteDate)} · {CREDIT_NOTE_REASON_LABELS[c.reason]}</span>
                    </span>
                    <span className="flex items-center gap-3"><FolioStatus status={c.status} /><span className="tabular-nums text-white">{formatINR(c.totalPaise)}</span></span>
                  </li>
                ))}
              </ul>
            </TableCard>
          ) : null}

          {messages.length || followups.length ? (
            <TableCard icon={<History />} title="Chase history" subtitle="Reminders sent and follow-ups logged against this invoice">
              <ul className="border-t border-line py-1.5">
                {messages.map((m) => (
                  <li key={String(m._id)} className="flex items-start gap-3 px-[23px] py-2.5">
                    <span className="mt-0.5 text-icon-muted [&_svg]:size-4">{m.channel === 'whatsapp' ? <MessageCircle strokeWidth={1.5} /> : <Mail strokeWidth={1.5} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white">{m.subject || (m.kind === 'reminder' ? 'Payment reminder' : 'Invoice sent')}<span className="ml-2 text-xs text-fg-3">{m.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</span></span>
                      <span className="block text-xs text-fg-2">{m.status === 'sent' ? `Sent ${formatDate(m.sentAt ?? m.createdAt)} to ${m.toAddress}` : m.status === 'logged' ? `Logged ${formatDate(m.createdAt)} for ${m.toAddress} (no email provider)` : m.status === 'queued' ? 'Waiting to be sent on WhatsApp' : m.status === 'skipped' ? 'Skipped by catch-up' : `Not sent${m.error ? `: ${m.error}` : ''}`}</span>
                    </span>
                  </li>
                ))}
                {followups.map((f) => (
                  <li key={String(f._id)} className="flex items-start gap-3 px-[23px] py-2.5">
                    <span className="mt-0.5 text-icon-muted [&_svg]:size-4"><PhoneCall strokeWidth={1.5} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white">{f.subject || 'Follow-up'}<span className="ml-2 text-xs capitalize text-fg-3">{f.channel}</span></span>
                      <span className="block text-xs text-fg-2">{f.status === 'done' ? f.outcome : f.status === 'cancelled' ? 'Dropped' : `Due ${formatDate(f.snoozedUntil ?? f.dueOn)}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </TableCard>
          ) : null}
        </div>

        <aside className="col-span-12 space-y-4 xl:col-span-4">
          <SummaryCard>
            <SummaryRow label="Subtotal" value={formatINR(invoice.subtotalPaise)} />
            {invoice.discountPaise ? <SummaryRow label="Discount" value={`− ${formatINR(invoice.discountPaise)}`} /> : null}
            <SummaryRow label="Taxable value" value={formatINR(invoice.taxablePaise)} strong />
            {invoice.cgstPaise ? <SummaryRow label="CGST" value={formatINR(invoice.cgstPaise)} /> : null}
            {invoice.sgstPaise ? <SummaryRow label={sgst} value={formatINR(invoice.sgstPaise)} /> : null}
            {invoice.igstPaise ? <SummaryRow label="IGST" value={formatINR(invoice.igstPaise)} /> : null}
            {invoice.roundOffPaise ? <SummaryRow label="Round off" value={`${invoice.roundOffPaise > 0 ? '+' : '−'} ${formatINR(Math.abs(invoice.roundOffPaise))}`} tone="muted" /> : null}
            <SummaryTotal totalPaise={invoice.totalPaise} words={amountInWords(invoice.totalPaise)} />
            {invoice.reverseCharge && invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise > 0 ? <p className="mb-3 text-xs text-fg-2">{reverseChargeNote(invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise, formatINR)}</p> : null}
            {invoice.status !== 'draft' ? (
              <>
                {issued && invoice.totalPaise > 0 ? <Progress className="mb-4" size="lg" value={Math.round(((invoice.totalPaise - invoice.balancePaise) / invoice.totalPaise) * 100)} label="Settled" /> : null}
                <SummaryRow label="Received" value={formatINR(invoice.paidPaise)} />
                {invoice.tdsReceivedPaise ? <SummaryRow label="TDS received" value={formatINR(invoice.tdsReceivedPaise)} /> : null}
                {invoice.creditedPaise ? <SummaryRow label="Credit notes" value={formatINR(invoice.creditedPaise)} /> : null}
                {invoice.writtenOffPaise ? <SummaryRow label="Written off" value={formatINR(invoice.writtenOffPaise)} /> : null}
                <SummaryRow label="Balance due" value={formatINR(invoice.balancePaise)} strong tone={invoice.balancePaise === 0 ? 'success' : overdue > 0 ? 'danger' : undefined} />
              </>
            ) : null}
            {invoice.tdsPaise > 0 ? (
              <div className={cn('mt-3 px-3.5 py-1.5', INSET)}>
                <SummaryRow label={`Expected TDS @ ${invoice.tdsPercent}%${profile?.tds?.section ? ` (${profile.tds.section})` : ''}`} value={`− ${formatINR(invoice.tdsPaise)}`} />
                <SummaryRow label="Expect in bank" value={formatINR(invoice.totalPaise - invoice.tdsPaise)} strong />
              </div>
            ) : null}
          </SummaryCard>
          {gateway?.connected && gateway.enabled ? (
            <SolidCard>
              <PanelHeader icon={<CreditCard />} title="Online payment" subtitle={`Razorpay payment link for the ${formatINR(invoice.balancePaise)} balance. Paid links record the receipt by themselves.`} />
              <div className="mt-4">
                <PaymentLinkButton id={id} url={payLink?.shortUrl ?? null} />
              </div>
            </SolidCard>
          ) : null}
          {einvSettings?.enabled ? (
            <SolidCard>
              <PanelHeader icon={<QrCode />} title="E-invoice" subtitle="IRN from the Invoice Registration Portal, printed with its signed QR on the PDF." />
              <div className="mt-3">
                <EinvoicePanel
                  id={id}
                  canAct={ctx.can('invoices.issue')}
                  canCancel={ctx.can('einvoice.cancel')}
                  ineligible={einv ? null : ineligibleReason(invoice, einvSettings)}
                  view={einv ? { irn: einv.irn, ackNo: einv.ackNo, ackDate: einv.ackDate, environment: einv.environment, cancellable: cancelWindowOpen(einv.ackDate, new Date()), ewb: einv.ewb?.ewbNo ? { ewbNo: einv.ewb.ewbNo, ewbDate: einv.ewb.ewbDate ?? '', validTill: einv.ewb.validTill ?? '' } : null } : null}
                />
              </div>
            </SolidCard>
          ) : null}
          {activity ? <DocActivityCard kind="invoice" id={id} activity={activity} canManage={ctx.canAny('invoices.write', 'invoices.issue')} /> : null}
          {invoice.internalNotes ? (
            <SolidCard>
              <PanelHeader icon={<StickyNote />} title="Internal note" subtitle="Never printed." />
              <p className="mt-3 whitespace-pre-line text-[13px] leading-5 text-white/80">{invoice.internalNotes}</p>
            </SolidCard>
          ) : null}
        </aside>
      </div>
    </>
  )
}
