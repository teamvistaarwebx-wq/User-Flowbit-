import { Download, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import type { CreditNoteView, InvoiceView, PublicView, QuoteView, ReceiptView, StatementView } from '@/modules/doclinks/view-types'
import { DocLines } from './doc-lines'
import { BrandButton, PublicCard } from './public-shell'
import { QuoteRespond } from './quote-respond'
import { UpiQr } from './upi-qr'
import { UtrForm } from './utr-form'

/** The body of each public document kind. Server components; only the forms are client. */

const pdfHref = (token: string) => `/d/${token}/pdf`

function Head({ label, number, billedTo, badge, meta }: { label: string; number: string; billedTo: string; badge?: ReactNode; meta: { label: string; value: string }[] }) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white/60">{label}</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-white">{number}</h1>
          {billedTo ? <p className="mt-1 text-sm text-white/70">For {billedTo}</p> : null}
        </div>
        {badge}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {meta.map((m) => (
          <div key={m.label}>
            <dt className="text-xs text-white/60">{m.label}</dt>
            <dd className="text-white">{m.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  )
}

function Notes({ notes, terms }: { notes: string | null; terms: string | null }) {
  if (!notes && !terms) return null
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      {notes ? <p className="whitespace-pre-line text-white/70">{notes}</p> : null}
      {terms ? <p className="whitespace-pre-line text-white/60">{terms}</p> : null}
    </div>
  )
}

const PdfButton = ({ token }: { token: string }) => (
  <a href={pdfHref(token)} className="press inline-flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-5 text-sm font-medium text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.12] [&_svg]:size-4">
    <Download strokeWidth={1.5} /> Download PDF
  </a>
)

const INVOICE_BADGE: Record<string, { tone: 'success' | 'warning' | 'info' | 'neutral'; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  part_paid: { tone: 'warning', label: 'Part paid' },
  issued: { tone: 'info', label: 'Due' },
  void: { tone: 'neutral', label: 'Cancelled' },
}

function InvoiceBody({ view }: { view: InvoiceView }) {
  const badge = INVOICE_BADGE[view.status] ?? INVOICE_BADGE.issued
  const balance = formatINR(view.balancePaise)
  return (
    <>
      <PublicCard className="space-y-6">
        <Head label={view.title} number={view.number} billedTo={view.billedTo} badge={<Badge tone={badge.tone} size="md">{badge.label}</Badge>} meta={[{ label: 'Dated', value: formatDate(view.issueDate) }, { label: 'Due', value: formatDate(view.dueDate) }, { label: 'Balance due', value: balance }]} />
        <DocLines lines={view.lines} totals={view.totals} />
        <Notes notes={view.notes} terms={view.terms} />
        <div className="flex flex-wrap gap-3">
          {view.payable && view.payUrl ? (
            <BrandButton href={view.payUrl}>
              Pay {balance} now <ExternalLink strokeWidth={1.5} />
            </BrandButton>
          ) : null}
          <PdfButton token={view.token} />
        </div>
      </PublicCard>
      {view.payable && (view.upi || view.bank) ? (
        <PublicCard className="space-y-5">
          <h2 className="text-base font-semibold text-white">Other ways to pay</h2>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {view.upi ? <UpiQr upi={view.upi} amountLabel={balance} /> : null}
            {view.bank ? (
              <dl className="space-y-1 text-sm">
                <dt className="text-xs text-white/60">Bank transfer</dt>
                <dd className="text-white">{view.bank.name}</dd>
                <dd className="text-white/80">A/c {view.bank.account} · IFSC {view.bank.ifsc}</dd>
                <dd className="text-xs text-white/60">The full account number is on the PDF.</dd>
              </dl>
            ) : null}
          </div>
          <div className="border-t border-white/[0.1] pt-4">
            <p className="mb-3 text-sm text-white/70">Paid by UPI or bank transfer? Share the reference so it can be matched.</p>
            <UtrForm token={view.token} balanceLabel={balance} />
          </div>
        </PublicCard>
      ) : null}
    </>
  )
}

const QUOTE_BADGE: Record<string, { tone: 'success' | 'warning' | 'info' | 'neutral' | 'danger'; label: string }> = {
  accepted: { tone: 'success', label: 'Accepted' },
  converted: { tone: 'success', label: 'Accepted' },
  declined: { tone: 'danger', label: 'Declined' },
  sent: { tone: 'info', label: 'Awaiting your reply' },
  draft: { tone: 'info', label: 'Awaiting your reply' },
}

function QuoteBody({ view }: { view: QuoteView }) {
  const badge = QUOTE_BADGE[view.status] ?? QUOTE_BADGE.sent
  return (
    <PublicCard className="space-y-6">
      <Head label={view.title} number={view.number} billedTo={view.billedTo} badge={<Badge tone={badge.tone} size="md">{badge.label}</Badge>} meta={[{ label: 'Dated', value: formatDate(view.quoteDate) }, { label: 'Valid until', value: formatDate(view.validUntil) }, { label: 'Total', value: formatINR(view.totalPaise) }]} />
      <DocLines lines={view.lines} totals={view.totals} />
      <Notes notes={view.notes} terms={view.terms} />
      <div className="space-y-4 border-t border-white/[0.1] pt-5">
        {view.decision.open ? <QuoteRespond token={view.token} /> : <p className="text-sm text-white/80">{view.decision.reason}</p>}
        <PdfButton token={view.token} />
      </div>
    </PublicCard>
  )
}

function CreditNoteBody({ view }: { view: CreditNoteView }) {
  return (
    <PublicCard className="space-y-6">
      <Head label="Credit note" number={view.number} billedTo={view.billedTo} meta={[{ label: 'Dated', value: formatDate(view.noteDate) }, { label: 'Against invoice', value: view.invoiceNumber ?? '—' }, { label: 'Reason', value: view.reason }]} />
      <DocLines lines={view.lines} totals={view.totals} />
      <PdfButton token={view.token} />
    </PublicCard>
  )
}

function ReceiptBody({ view }: { view: ReceiptView }) {
  return (
    <PublicCard className="space-y-6">
      <Head
        label="Payment receipt"
        number={view.number}
        billedTo={view.billedTo}
        badge={view.status === 'recorded' ? <Badge tone="success" size="md">Received</Badge> : <Badge tone="danger" size="md">{view.status === 'bounced' ? 'Bounced' : 'Cancelled'}</Badge>}
        meta={[{ label: 'Received on', value: formatDate(view.receivedOn) }, { label: 'Amount', value: formatINR(view.amountPaise) }, { label: 'Paid by', value: view.mode }]}
      />
      {view.reference ? <p className="text-sm text-white/70">Reference {view.reference}</p> : null}
      {view.allocations.length ? (
        <ul className="divide-y divide-white/[0.08] border-y border-white/[0.08] text-sm">
          {view.allocations.map((a) => (
            <li key={a.invoiceNumber} className="flex justify-between py-2.5 text-white">
              <span>Invoice {a.invoiceNumber}</span>
              <span className="tabular-nums">{formatINR(a.amountPaise)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <PdfButton token={view.token} />
    </PublicCard>
  )
}

function StatementBody({ view }: { view: StatementView }) {
  return (
    <PublicCard className="space-y-6">
      <Head label="Statement of account" number={view.billedTo} billedTo="" meta={[{ label: 'As on', value: formatDate(view.asOf) }, { label: 'Total due', value: formatINR(view.totalDuePaise) }, { label: 'Open invoices', value: String(view.invoices.length) }]} />
      {view.invoices.length ? (
        <ul className="divide-y divide-white/[0.08] border-y border-white/[0.08] text-sm">
          {view.invoices.map((i) => (
            <li key={i.number} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-white">
                {i.number}
                <span className="ml-2 text-xs text-white/60">due {formatDate(i.dueDate)}</span>
                {i.overdue ? <Badge tone="danger" className="ml-2">Overdue</Badge> : null}
              </span>
              <span className="tabular-nums text-white">{formatINR(i.balancePaise)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/70">Nothing is due. Thank you.</p>
      )}
      <PdfButton token={view.token} />
    </PublicCard>
  )
}

export function PublicDocument({ view }: { view: PublicView }) {
  switch (view.kind) {
    case 'invoice':
      return <InvoiceBody view={view} />
    case 'quote':
      return <QuoteBody view={view} />
    case 'credit_note':
      return <CreditNoteBody view={view} />
    case 'receipt':
      return <ReceiptBody view={view} />
    case 'statement':
      return <StatementBody view={view} />
  }
}
