import Link from 'next/link'
import { Download, FileMinus2, Landmark, Receipt, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react'
import type { StaffCtx } from '@/lib/console/session'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR, paiseToRupees } from '@/lib/money'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusWord, TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { BillRowActions, CreditNoteDialog, RecordOfflineDialog, TdsDialog, VerifyButtons } from '@/components/console/billing-actions'
import { FlowbitCreditNote } from '@/models/billing/FlowbitCreditNote'
import { OfflinePayment } from '@/models/billing/OfflinePayment'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { tdsOfBill } from '@/modules/billing/due-totals'
import { billBalancePaise, CREDIT_REASON_LABEL, OFFLINE_MODE_LABEL, TDS_CERT_LABEL, type CreditReason, type OfflineMode } from '@/modules/billing/rules'

/** The sections of /console/billing (console spec 7.2, 11). Server components; actions check roles again. */

type Names = Map<string, string>
async function orgNames(p: StaffCtx, ids: unknown[]): Promise<Names> {
  const orgs = await p.raw(Org).find({ _id: { $in: ids } }, { name: 1 }).lean()
  return new Map(orgs.map((o) => [String(o._id), o.name]))
}
const OrgLink = ({ id, names }: { id: unknown; names: Names }) => <Link href={`/console/accounts/${String(id)}`} className="text-white hover:underline">{names.get(String(id)) ?? 'Workspace'}</Link>
const Empty = ({ title, icon }: { title: string; icon: React.ReactNode }) => <div className="border-t border-line"><EmptyState compact icon={icon} title={title} /></div>
const fileHref = (id: unknown) => `/api/console/files/${String(id)}`

export async function DueBills({ p }: { p: StaffCtx }) {
  const bills = await p.raw(SubscriptionInvoice).find({ status: 'due' }).sort({ dueDate: 1 }).limit(200).lean()
  const names = await orgNames(p, bills.map((b) => b.orgId))
  const today = todayIST()
  return (
    <TableCard icon={<Wallet strokeWidth={1.5} />} label="Due bills and payment links" description={`${bills.length} waiting for payment`}>
      {bills.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className={tableHead}><th className={th}>Bill</th><th className={th}>Workspace</th><th className={cn(th, 'text-right')}>Asks for</th><th className={th}>Due</th><th className={th}>Payment link</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {bills.map((b) => {
                const asks = billBalancePaise(b)
                return (
                  <tr key={String(b._id)} className={tableRow}>
                    <td className={cn(td, 'whitespace-nowrap text-white')}>{b.number}{b.billType === 'proforma' ? ' · proforma' : ''}</td>
                    <td className={td}><OrgLink id={b.orgId} names={names} /></td>
                    <td className={cn(td, 'text-right tabular-nums text-white')}>{formatINR(asks, { decimals: 2 })}{b.receivedPaise ? <span className="block text-xs text-[#979797]">{formatINR(b.receivedPaise)} received</span> : null}</td>
                    <td className={cn(td, 'whitespace-nowrap', b.dueDate && b.dueDate < today ? 'text-[#FF6A66]' : 'text-[#979797]')}>{formatDate(b.dueDate ?? b.issueDate)}</td>
                    <td className={cn(td, 'text-[#979797]')}>{b.paymentLink?.shortUrl ? <a href={b.paymentLink.shortUrl} target="_blank" rel="noreferrer" className="hover:underline">{b.paymentLink.shortUrl.replace(/^https?:\/\//, '')}</a> : 'None (offline only)'}</td>
                    <td className={td}>
                      <span className="flex flex-wrap justify-end gap-1">
                        <a href={`/api/subscription/invoices/${b._id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}><Download className="size-3.5" /> PDF</a>
                        {p.can('payment.record') ? <RecordOfflineDialog billId={String(b._id)} number={b.number} amountRupees={String(paiseToRupees(asks))} today={today} tdsDeclared={Boolean(b.tds?.declared)} /> : null}
                        <BillRowActions billId={String(b._id)} number={b.number} canSend={p.can('bill.create')} canCancel={p.can('invoice.cancel')} />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={<Wallet />} title="No due bills." />}
    </TableCard>
  )
}

export async function OfflineQueue({ p }: { p: StaffCtx }) {
  const rows = await p.raw(OfflinePayment).find({ status: { $in: ['pending', 'expired'] } }).sort({ provisionalUntil: 1 }).limit(200).lean()
  const names = await orgNames(p, rows.map((r) => r.orgId))
  const bills = await p.raw(SubscriptionInvoice).find({ _id: { $in: rows.map((r) => r.invoiceId) } }, { number: 1, totalPaise: 1 }).lean()
  const billOf = (id: unknown) => bills.find((b) => String(b._id) === String(id))
  return (
    <TableCard icon={<Landmark strokeWidth={1.5} />} label="Offline payments to verify" description="Match each UTR with the bank statement. The person who recorded a payment cannot verify it.">
      {rows.length ? (
        <ul className="border-t border-line">
          {rows.map((r) => (
            <li key={String(r._id)} className="flex flex-col gap-3 px-[23px] py-4 lg:flex-row lg:items-center lg:justify-between">
              <span className="min-w-0 text-sm">
                <span className="block text-white"><span className="tabular-nums">{formatINR(r.amountPaise, { decimals: 2 })}</span> · {OFFLINE_MODE_LABEL[r.mode as OfflineMode]} · UTR <span className="font-mono">{r.utr}</span>{r.tdsDeclared ? ' · TDS declared' : ''}</span>
                <span className="block text-xs text-[#979797]"><OrgLink id={r.orgId} names={names} /> · bill {billOf(r.invoiceId)?.number ?? '—'} ({formatINR(billOf(r.invoiceId)?.totalPaise ?? 0)}) · paid {formatDate(r.paidOn)} · by {r.recordedByName} ({r.source})</span>
                <span className={cn('block text-xs', r.status === 'expired' ? 'text-[#FF6A66]' : 'text-[#979797]')}>{r.status === 'expired' ? 'Provisional access ended: verify to unlock' : `Provisional access until ${formatDate(r.provisionalUntil)}`}{r.screenshotFileId ? <> · <a href={fileHref(r.screenshotFileId)} target="_blank" rel="noreferrer" className="underline">screenshot</a></> : null}</span>
              </span>
              {p.can('payment.verify') ? <VerifyButtons paymentId={String(r._id)} selfRecorded={String(r.recordedByStaffId ?? '') === String(p.staff.id)} /> : null}
            </li>
          ))}
        </ul>
      ) : <Empty icon={<Landmark />} title="Nothing waiting for verification." />}
    </TableCard>
  )
}

export async function Invoices({ p }: { p: StaffCtx }) {
  const invoices = await p.raw(SubscriptionInvoice).find({ status: { $ne: 'due' } }).sort({ createdAt: -1 }).limit(100).lean()
  const names = await orgNames(p, invoices.map((i) => i.orgId))
  return (
    <TableCard icon={<Receipt strokeWidth={1.5} />} label="Tax invoices" description="Latest 100 across every workspace">
      {invoices.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className={tableHead}><th className={th}>Number</th><th className={th}>Workspace</th><th className={th}>Date</th><th className={cn(th, 'text-right')}>Total</th><th className={th}>Payment</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const left = i.totalPaise - (i.creditedPaise ?? 0)
                return (
                  <tr key={String(i._id)} className={tableRow}>
                    <td className={cn(td, 'whitespace-nowrap text-white')}>{i.number}</td>
                    <td className={td}><OrgLink id={i.orgId} names={names} /></td>
                    <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{formatDate(i.issueDate)}</td>
                    <td className={cn(td, 'text-right tabular-nums text-white')}>{formatINR(i.totalPaise, { decimals: 2 })}{i.creditedPaise ? <span className="block text-xs text-[#979797]">−{formatINR(i.creditedPaise)} credited</span> : null}</td>
                    <td className={cn(td, 'text-[#979797]')}>{i.payment?.provider === 'offline' ? `UTR ${i.payment.utr ?? ''}` : `${i.payment?.provider ?? ''} ${i.payment?.paymentId ?? ''}`}</td>
                    <td className={td}><StatusWord status={i.status === 'cancelled' ? 'cancelled' : 'paid'} label={i.status === 'cancelled' ? 'Cancelled' : 'Paid'} /></td>
                    <td className={td}>
                      <span className="flex justify-end gap-1">
                        <a href={`/api/subscription/invoices/${i._id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}><Download className="size-3.5" /> PDF</a>
                        {i.status === 'paid' && left > 0 && p.can('credit_note.issue') ? <CreditNoteDialog invoiceId={String(i._id)} number={i.number} maxRupees={String(paiseToRupees(left))} refundable={i.payment?.provider === 'razorpay'} /> : null}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={<Receipt />} title="No invoices yet." />}
    </TableCard>
  )
}

export async function TdsTracking({ p }: { p: StaffCtx }) {
  const rows = await p.raw(SubscriptionInvoice).find({ 'tds.declared': true, status: { $ne: 'cancelled' } }).sort({ issueDate: -1 }).limit(200).lean()
  const names = await orgNames(p, rows.map((r) => r.orgId))
  return (
    <TableCard icon={<ShieldCheck strokeWidth={1.5} />} label="TDS certificates" description="Business customers deduct 2%. Track Form 16A and reconcile with 26AS by hand.">
      {rows.length ? (
        <ul className="border-t border-line">
          {rows.map((r) => (
            <li key={String(r._id)} className="flex flex-col gap-2 px-[23px] py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="block text-white">{r.number} · <OrgLink id={r.orgId} names={names} /> · TDS <span className="tabular-nums">{formatINR(tdsOfBill(r), { decimals: 2 })}</span>{r.status === 'due' ? ' · expected, bill not paid yet' : ''}</span>
                <span className="block text-xs text-[#979797]">{TDS_CERT_LABEL[(r.tds?.certificateStatus ?? 'awaited') as keyof typeof TDS_CERT_LABEL]}{r.tds?.quarter ? ` · ${r.tds.quarter}` : ''}{r.tds?.note ? ` · ${r.tds.note}` : ''}{r.tds?.certificateFileId ? <> · <a href={fileHref(r.tds.certificateFileId)} target="_blank" rel="noreferrer" className="underline">certificate</a></> : null}</span>
              </span>
              {p.can('tds.manage') ? <TdsDialog invoiceId={String(r._id)} number={r.number} status={r.tds?.certificateStatus ?? 'awaited'} quarter={r.tds?.quarter ?? ''} /> : null}
            </li>
          ))}
        </ul>
      ) : <Empty icon={<ShieldCheck />} title="No TDS declared yet." />}
    </TableCard>
  )
}

export async function CreditNotes({ p }: { p: StaffCtx }) {
  const notes = await p.raw(FlowbitCreditNote).find({}).sort({ createdAt: -1 }).limit(100).lean()
  const names = await orgNames(p, notes.map((n) => n.orgId))
  return (
    <TableCard icon={<FileMinus2 strokeWidth={1.5} />} label="Credit notes and refunds">
      {notes.length ? (
        <ul className="border-t border-line">
          {notes.map((n) => (
            <li key={String(n._id)} className="flex items-center justify-between gap-3 px-[23px] py-3 text-sm">
              <span className="min-w-0"><span className="block text-white">{n.number} on {n.invoiceNumber} · <OrgLink id={n.orgId} names={names} /></span><span className="block text-xs text-[#979797]">{CREDIT_REASON_LABEL[n.reason as CreditReason]}{n.note ? ` · ${n.note}` : ''} · {n.createdByName} · {formatDate(n.issueDate)}{n.refund?.status && n.refund.status !== 'none' ? ` · refund ${n.refund.status}${n.refund.error ? `: ${n.refund.error}` : ''}` : ''}</span></span>
              <span className="tabular-nums text-white">{formatINR(n.totalPaise, { decimals: 2 })}</span>
            </li>
          ))}
        </ul>
      ) : <Empty icon={<FileMinus2 />} title="No credit notes yet." />}
    </TableCard>
  )
}

export async function Overdue({ p }: { p: StaffCtx }) {
  const now = new Date()
  const today = todayIST()
  const [bills, lapsed] = await Promise.all([
    p.raw(SubscriptionInvoice).find({ status: 'due', dueDate: { $lt: today } }).sort({ dueDate: 1 }).limit(200).lean(),
    p.raw(Org).find({ deletedAt: null, 'subscription.plan': { $in: ['suite', 'custom'] }, 'subscription.accountType': { $nin: ['internal', 'test', 'comped'] }, $or: [{ 'subscription.status': 'past_due' }, { 'subscription.status': 'active', 'subscription.currentPeriodEnd': { $lt: now } }] }, { name: 1, subscription: 1 }).limit(200).lean(),
  ])
  const names = await orgNames(p, bills.map((b) => b.orgId))
  return (
    <TableCard icon={<TriangleAlert strokeWidth={1.5} />} label="Overdue accounts" description="Bills past their due date, and paid plans past their period end">
      {bills.length || lapsed.length ? (
        <ul className="border-t border-line">
          {bills.map((b) => (
            <li key={String(b._id)} className="flex items-center justify-between gap-3 px-[23px] py-3 text-sm">
              <span><OrgLink id={b.orgId} names={names} /> <span className="text-xs text-[#979797]">· bill {b.number} due {formatDate(b.dueDate!)}</span></span>
              <span className="tabular-nums text-[#FF6A66]">{formatINR(billBalancePaise(b), { decimals: 2 })}</span>
            </li>
          ))}
          {lapsed.map((o) => (
            <li key={String(o._id)} className="flex items-center justify-between gap-3 px-[23px] py-3 text-sm">
              <span><Link href={`/console/accounts/${o._id}`} className="text-white hover:underline">{o.name}</Link> <span className="text-xs text-[#979797]">· {o.subscription?.status === 'past_due' ? `payment failed since ${formatDate(o.subscription.pastDueSince ? new Date(o.subscription.pastDueSince) : now)}` : `period ended ${formatDate(new Date(o.subscription!.currentPeriodEnd!))}`}</span></span>
              <span className="text-xs text-[#979797]">{o.subscription?.autopay?.status ? `autopay ${o.subscription.autopay.status}` : 'no autopay'}</span>
            </li>
          ))}
        </ul>
      ) : <Empty icon={<TriangleAlert />} title="Nobody is overdue." />}
    </TableCard>
  )
}
