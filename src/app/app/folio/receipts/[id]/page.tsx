import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ban, CalendarDays, FileText, IndianRupee, Info, ListChecks, ReceiptIndianRupee, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { DocActivityCard } from '@/components/doclinks/doc-activity'
import { documentActivity } from '@/modules/doclinks/queries'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'
import { Fact, Figure, LINK, Note, OverviewCard, PanelHeader, SolidCard, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from '@/components/folio/ui'
import { profileSummaries } from '@/modules/folio/queries/common'
import { receiptDetail } from '@/modules/folio/receipts/queries'
import { RECEIPT_MODE_LABELS, type ReceiptMode } from '@/modules/folio/receipts/rules'
import { ApplyPanel, ReceiptActions, ReleaseButton } from '../_components/receipt-actions'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'
import { ReceiptStatusBadge } from '../_components/receipt-badge'

export const metadata: Metadata = { title: 'Receipt' }

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const r = await receiptDetail(ctx, id)
  if (!r) notFound()
  const today = todayIST()
  const canWrite = ctx.can('receipts.write')
  const recorded = r.status === 'recorded'
  const tdsOn = (await profileSummaries(ctx, [r.client.id])).get(r.client.id)?.tds.on ?? false

  return (
    <>
      <PageHeader
        title={<span className="inline-flex items-center gap-3">{r.number} <ReceiptStatusBadge status={r.status} /></span>}
        description={`${formatINR(r.amountPaise)} received on ${formatDate(r.receivedOn)} from ${r.client.name}`}
        back={{ href: '/app/folio/receipts', label: 'Receipts' }}
        icon={<ReceiptIndianRupee />}
        actions={
          canWrite && recorded ? (
            <span className="flex flex-wrap items-center gap-2">
              <SendWhatsAppDialog kind="receipt" id={r.id} title={`Send receipt ${r.number} on WhatsApp`} />
              <ReceiptActions receiptId={r.id} today={today} />
            </span>
          ) : null
        }
      />

      {r.status === 'bounced' || r.status === 'cancelled' ? (
        <div className="mb-4 space-y-3">
          {r.status === 'bounced' ? (
            <Note tone="danger" icon={<Ban />} title="This payment bounced.">
              {r.bounceReason ?? ''} · {formatDate(r.bouncedOn)}. Nothing it once settled counts as paid.
            </Note>
          ) : null}
          {r.status === 'cancelled' ? <Note title="This receipt was cancelled.">{r.cancelReason ? `${r.cancelReason}. ` : ''}It no longer counts anywhere.</Note> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 lg:col-span-8">
          <TableCard icon={<ListChecks />} title="Applied to" subtitle={r.allocations.length ? `${formatINR(r.appliedPaise)} applied${r.tdsPaise ? ` · ${formatINR(r.tdsPaise)} TDS withheld` : ''}` : 'Not applied to any invoice yet'}>
            {r.allocations.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className={THEAD_ROW}>
                      <Th icon={<FileText />}>Invoice</Th>
                      <Th icon={<CalendarDays />} className="hidden sm:table-cell">Dated</Th>
                      <Th align="right" className="hidden sm:table-cell">Invoice total</Th>
                      <Th icon={<IndianRupee />} align="right">Cash</Th>
                      <Th align="right">TDS</Th>
                      {canWrite && recorded ? <Th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    <tr aria-hidden className="h-1.5" />
                    {r.allocations.map((a) => (
                      <tr key={a.id} className={TBODY_ROW}>
                        <Td><Link href={`/app/folio/invoices/${a.invoiceId}`} className={cn('font-medium', LINK)}>{a.number}</Link></Td>
                        <Td className="hidden text-[#979797] sm:table-cell">{formatDate(a.issueDate)}</Td>
                        <Td align="right" className="hidden tabular-nums text-white/75 sm:table-cell">{formatINR(a.totalPaise)}</Td>
                        <Td align="right" className="tabular-nums">{formatINR(a.amountPaise)}</Td>
                        <Td align="right" className="tabular-nums text-white/75">{a.tdsPaise ? formatINR(a.tdsPaise) : '—'}</Td>
                        {canWrite && recorded ? <Td align="right"><ReleaseButton receiptId={r.id} allocationId={a.id} invoiceNumber={a.number} /></Td> : null}
                      </tr>
                    ))}
                    <tr aria-hidden className="h-2" />
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border-t border-line">
                <EmptyState icon={<Wallet />} title="Nothing applied yet" description={`This is sitting as credit on ${r.client.name}.`} compact />
              </div>
            )}
          </TableCard>

          {canWrite && recorded && r.unappliedPaise > 0 ? (
            <SolidCard>
              <PanelHeader icon={<Wallet />} title={`Apply the remaining ${formatINR(r.unappliedPaise)}`} subtitle={`Open invoices of ${r.client.name}${r.entity ? ` billed by ${r.entity.code}` : ''}.`} className="mb-4" />
              <ApplyPanel receiptId={r.id} unappliedPaise={r.unappliedPaise} options={r.applyOptions} today={today} showTds={tdsOn} />
            </SolidCard>
          ) : null}
        </div>

        <aside className="col-span-12 space-y-4 lg:col-span-4">
          <OverviewCard>
            <PanelHeader icon={<Info />} title="Details" />
            <div className="mt-4 grid grid-cols-2 gap-4 border-b border-line-soft/60 pb-4">
              <Figure label="Amount" value={formatINR(r.amountPaise)} valueClassName="text-xl leading-7" />
              <Figure label="Unapplied" value={formatINR(r.unappliedPaise)} valueClassName={cn('text-xl leading-7', r.unappliedPaise > 0 && 'text-warning')} />
            </div>
            <div className="mt-2">
              <Fact label="Client"><Link href={`/app/folio/ledger/${r.client.id}`} className={LINK}>{r.client.name}</Link></Fact>
              <Fact label="Applied">{formatINR(r.appliedPaise)}</Fact>
              {r.tdsPaise ? <Fact label="TDS withheld">{formatINR(r.tdsPaise)}</Fact> : null}
              <Fact label="Mode">{RECEIPT_MODE_LABELS[r.mode as ReceiptMode] ?? r.mode}</Fact>
              <Fact label="Reference">{r.reference ?? null}</Fact>
              {r.instrumentDate ? <Fact label="Cheque date">{formatDate(r.instrumentDate)}</Fact> : null}
              <Fact label="Into">{[r.entity ? `${r.entity.code} · ${r.entity.name}` : null, r.bank ? `${r.bank.bankName} ${r.bank.masked}` : null].filter(Boolean).join(' · ') || null}</Fact>
            </div>
            {r.notes ? <p className="mt-3 whitespace-pre-line border-t border-line-soft/60 pt-3 text-[13px] leading-5 text-white/80">{r.notes}</p> : null}
          </OverviewCard>
          <DocActivityCard kind="receipt" id={id} activity={await documentActivity(ctx, 'receipt', id)} canManage={ctx.can('receipts.write')} />
        </aside>
      </div>
    </>
  )
}
