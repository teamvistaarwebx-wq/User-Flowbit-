import Link from 'next/link'
import { Banknote, FilePlus2, FileText, Lock, ReceiptIndianRupee, Repeat, Wallet } from 'lucide-react'
import { Types } from 'mongoose'
import { getCtx } from '@/lib/ctx'
import { daysBetween, formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Badge, StatusPill } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { FolioReceipt } from '@/models/folio/Receipt'
import { FolioRetainer } from '@/models/folio/Retainer'
import { Invoice } from '@/models/folio/Invoice'
import { balanceForClient } from '@/modules/folio/queries/balances'
import { allocatedPaise } from '@/modules/folio/receipts/rules'
import { FREQUENCY_LABELS } from '@/modules/folio/types'
import { cn } from '@/lib/utils'
import { Figure, Note, OverviewCard, PanelHeader, SolidCard, TableCard, TBODY_ROW } from './ui'

const RECENT = 10

export function InvoiceStatusBadge({ status, dueDate, balancePaise, writtenOffPaise, today }: { status: string; dueDate: string; balancePaise: number; writtenOffPaise?: number; today: string }) {
  if (status === 'void') return <Badge tone="neutral" className="line-through">Void</Badge>
  if ((writtenOffPaise ?? 0) > 0) return <Badge tone="neutral" className="text-[#FF8A86]">Written off</Badge>
  const late = (status === 'issued' || status === 'part_paid') && balancePaise > 0 ? daysBetween(dueDate, today) : 0
  if (late > 0) return <StatusPill status="overdue" label={`Overdue ${late}d`} />
  return <StatusPill status={status} />
}

const FIGURE_TONE = { danger: 'text-[#FF6A66]', success: 'text-[#2DCBAF]' } as const

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'success' }) {
  return <Figure label={label} value={formatINR(value)} valueClassName={cn('text-xl leading-7', tone && value > 0 && FIGURE_TONE[tone])} />
}

/** Orbit's client "Invoices" tab: balances, recent invoices and receipts, retainers and plans. */
export async function ClientInvoicesTab({ clientId }: { clientId: string }) {
  const ctx = await getCtx()
  if (!ctx || !ctx.has('folio')) return <Note icon={<Lock />}>Billing lives in Folio, which is not active on this workspace.</Note>
  if (!ctx.can('folio.read')) return <Note icon={<Lock />}>You don’t have access to billing. Ask an admin for Folio access.</Note>
  if (!Types.ObjectId.isValid(clientId)) return null
  const today = todayIST()
  const id = new Types.ObjectId(clientId)
  const [balance, invoices, receipts, retainers, plans] = await Promise.all([
    balanceForClient(ctx, id, today),
    ctx.db(Invoice).find({ clientId: id }, { number: 1, status: 1, issueDate: 1, dueDate: 1, totalPaise: 1, balancePaise: 1, writtenOffPaise: 1, billingType: 1, subject: 1 }).sort({ issueDate: -1, createdAt: -1 }).limit(RECENT).lean(),
    ctx.db(FolioReceipt).find({ clientId: id }, { number: 1, status: 1, receivedOn: 1, amountPaise: 1, allocations: 1 }).sort({ receivedOn: -1 }).limit(5).lean(),
    ctx.db(FolioRetainer).find({ clientId: id, status: { $ne: 'ended' } }, { name: 1, amountPaise: 1, frequency: 1, status: 1 }).lean(),
    ctx.db(FolioBillingPlan).find({ clientId: id, status: { $in: ['draft', 'active', 'on_hold'] } }, { name: 1, code: 1, status: 1, totalValuePaise: 1 }).lean(),
  ])
  const actions = (
    <>
      {ctx.can('invoices.write') ? <Link className={buttonClass('primary', 'sm')} href={`/app/folio/invoices/new?clientId=${clientId}`}><FilePlus2 className="size-4" /> New invoice</Link> : null}
      {ctx.can('receipts.write') ? <Link className={buttonClass('secondary', 'sm')} href={`/app/folio/receipts/new?clientId=${clientId}`}><Banknote className="size-4" /> Record payment</Link> : null}
      {ctx.can('quotes.write') ? <Link className={buttonClass('ghost', 'sm')} href={`/app/folio/quotes/new?clientId=${clientId}`}>New quote</Link> : null}
    </>
  )
  return (
    <div className="grid grid-cols-12 gap-4">
      <OverviewCard className="col-span-12">
        <PanelHeader icon={<Wallet />} title="Balances" actions={actions} />
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-line-soft/40 lg:[&>*]:px-6 lg:[&>*:first-child]:pl-0 lg:[&>*:last-child]:pr-0">
          <Tile label="Outstanding" value={balance.outstandingPaise} />
          <Tile label="Overdue" value={balance.overduePaise} tone="danger" />
          <Tile label="Unapplied credit" value={balance.unappliedCreditPaise} tone="success" />
          <Tile label="Net receivable" value={balance.netReceivablePaise} />
        </div>
      </OverviewCard>

      <TableCard className="col-span-12 lg:col-span-8" icon={<FileText />} title="Recent invoices" subtitle={`The ${RECENT} most recent for this client`} actions={<Link className={buttonClass('ghost', 'sm')} href={`/app/folio/invoices?client=${clientId}`}>All invoices</Link>}>
        {invoices.length ? (
          <ul className="border-t border-line py-1.5">
            {invoices.map((inv) => (
              <li key={String(inv._id)}>
                <Link href={inv.billingType === 'opening' ? `/app/folio/ledger/${clientId}` : `/app/folio/invoices/${inv._id}`} className={cn('grid grid-cols-[1fr_auto] items-center gap-3 px-[23px] py-2.5 sm:grid-cols-[1fr_auto_120px_120px]', TBODY_ROW)}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{inv.billingType === 'opening' ? 'Opening balance' : (inv.number ?? 'Draft invoice')}</span>
                    <span className="block truncate text-xs text-fg-2">{formatDate(inv.issueDate)}{inv.subject ? ` · ${inv.subject}` : ''}</span>
                  </span>
                  <InvoiceStatusBadge status={inv.status} dueDate={inv.dueDate} balancePaise={inv.balancePaise} writtenOffPaise={inv.writtenOffPaise} today={today} />
                  <span className="hidden text-right text-[13px] tabular-nums text-white/80 sm:block">{formatINR(inv.totalPaise)}</span>
                  <span className={`hidden text-right text-[13px] tabular-nums sm:block ${inv.balancePaise > 0 ? 'text-white' : 'text-fg-3'}`}>{inv.balancePaise > 0 ? formatINR(inv.balancePaise) : '—'}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line">
            <EmptyState icon={<FileText />} title="No invoices yet" description="Raise the first one for this client." compact action={ctx.can('invoices.write') ? <Link className={buttonClass('primary', 'sm')} href={`/app/folio/invoices/new?clientId=${clientId}`}>New invoice</Link> : undefined} />
          </div>
        )}
      </TableCard>

      <div className="col-span-12 space-y-4 lg:col-span-4">
        <TableCard icon={<ReceiptIndianRupee />} title="Recent receipts" actions={<Link className={buttonClass('ghost', 'sm')} href={`/app/folio/receipts?client=${clientId}`}>All</Link>}>
          {receipts.length ? (
            <ul className="border-t border-line py-1.5">
              {receipts.map((r) => {
                const left = r.status === 'recorded' ? r.amountPaise - allocatedPaise(r.allocations ?? []) : 0
                return (
                  <li key={String(r._id)}>
                    <Link href={`/app/folio/receipts/${r._id}`} className={cn('flex items-center justify-between gap-2 px-[23px] py-2 text-sm', TBODY_ROW)}>
                      <span className="min-w-0"><span className="block truncate text-white">{r.number}</span><span className="text-xs text-fg-2">{formatDate(r.receivedOn)}{left > 0 ? ` · ${formatINR(left)} unapplied` : ''}</span></span>
                      {r.status === 'recorded' ? <span className="tabular-nums text-[#2DCBAF]">{formatINR(r.amountPaise)}</span> : <StatusPill status={r.status === 'bounced' ? 'overdue' : 'void'} label={r.status === 'bounced' ? 'Bounced' : 'Cancelled'} />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="border-t border-line px-[23px] py-4 text-[13px] text-fg-2">No payments recorded yet.</p>
          )}
        </TableCard>
        <SolidCard>
          <PanelHeader icon={<Repeat />} title="Retainers and plans" actions={<Link className={buttonClass('ghost', 'sm')} href="/app/folio/recurring">Recurring</Link>} className="mb-2" />
          {retainers.length || plans.length ? (
            <ul className="text-sm">
              {retainers.map((r) => (
                <li key={String(r._id)} className="flex min-h-8 items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-white">{r.name}<span className="ml-1 text-xs text-fg-2">· {FREQUENCY_LABELS[r.frequency as keyof typeof FREQUENCY_LABELS] ?? r.frequency}</span></span>
                  <span className="flex items-center gap-2"><span className="tabular-nums text-white/75">{formatINR(r.amountPaise, { decimals: 0 })}</span><StatusPill status={r.status === 'paused' ? 'on_hold' : r.status} label={r.status === 'paused' ? 'Paused' : undefined} /></span>
                </li>
              ))}
              {plans.map((p) => (
                <li key={String(p._id)}>
                  <Link href={`/app/folio/recurring/plans/${p._id}`} className="flex min-h-8 items-center justify-between gap-2 transition-colors hover:text-blush">
                    <span className="min-w-0 truncate text-white">{p.name}<span className="ml-1 text-xs text-fg-2">· {p.code}</span></span>
                    <span className="tabular-nums text-white/75">{formatINR(p.totalValuePaise, { decimals: 0 })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-2">No retainers or billing plans for this client.</p>
          )}
        </SolidCard>
      </div>
    </div>
  )
}
