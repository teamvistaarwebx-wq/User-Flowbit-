import { CreditCard, Download, ExternalLink, Repeat, Wallet } from 'lucide-react'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { parseListParams, type SearchParams } from '@/lib/list'
import { formatINR, paiseToRupees } from '@/lib/money'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { FactRow, Notice, StatusWord, SurfaceHeader, TableCard } from '@/components/settings/surface'
import { BillingHistory } from '@/components/settings/subscription-sections'
import { AutopayButtons, OfflinePaymentDialog } from '@/components/billing/customer-billing'
import { OfflinePayment } from '@/models/billing/OfflinePayment'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { AUTOPAY_LABEL, autopayCovers, type AutopayStatus } from '@/modules/billing/autopay-state'
import { billPublicUrl } from '@/modules/billing/notify'
import { AFA_LIMIT_PAISE, billBalancePaise, needsPerDebitApproval, OFFLINE_MODE_LABEL, type OfflineMode } from '@/modules/billing/rules'

const PAGE_SIZE = 24

const PAYMENT_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { label: 'Being verified', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Not matched', tone: 'danger' },
  expired: { label: 'Still being verified', tone: 'warning' },
}

/**
 * Plan & billing → Bills and invoices (console spec 8): due bills with Pay now, autopay, Flowbit's GST invoices
 * and the bank transfers the workspace reported. The caller checks billing.manage.
 */
export async function BillsPanel({ ctx, sp }: { ctx: Ctx; sp: SearchParams }) {
  const sub = ctx.org.subscription
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const [due, invoices, invoiceTotal, payments] = await Promise.all([
    ctx.db(SubscriptionInvoice).find({ status: 'due' }).sort({ dueDate: 1 }).lean(),
    ctx.db(SubscriptionInvoice).find({ status: { $ne: 'due' } }).sort({ issueDate: -1, createdAt: -1 }).skip(p.skip).limit(PAGE_SIZE).lean(),
    ctx.db(SubscriptionInvoice).countDocuments({ status: { $ne: 'due' } }),
    ctx.db(OfflinePayment).find({}).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const autopayStatus = (sub?.autopay?.status ?? null) as AutopayStatus | null
  const checkoutAutopay = Boolean(sub?.razorpaySubscriptionId) && !sub?.autopay && sub?.status === 'active' && !sub?.cancelAtPeriodEnd
  const autopayState: 'off' | 'pending' | 'on' = autopayCovers(autopayStatus) || autopayStatus === 'pending' ? 'on' : autopayStatus === 'created' ? 'pending' : 'off'
  const paidPlan = sub?.status === 'active' && sub.plan !== 'trial'
  const provisional = sub?.provisionalUntil && new Date(sub.provisionalUntil) > new Date() ? new Date(sub.provisionalUntil) : null
  const debit = sub?.autopay?.amountPaise ?? 0

  return (
    <div className="space-y-4">
      {provisional ? <Notice tone="info">Your bank transfer is being verified. The workspace stays fully open until {formatDate(provisional)}.</Notice> : null}

      <TableCard icon={<Wallet strokeWidth={1.5} />} label="Due bills" description="Pay online, or pay by bank transfer or UPI and send the UTR" actions={due.length ? <OfflinePaymentDialog today={todayIST()} bills={due.map((b) => ({ id: String(b._id), label: `${b.number} · ${formatINR(billBalancePaise(b), { decimals: 2 })}`, amountRupees: String(paiseToRupees(billBalancePaise(b))), tdsDeclared: Boolean(b.tds?.declared) }))} /> : null}>
        {due.length ? (
          <ul className="border-t border-line">
            {due.map((b) => (
              <li key={String(b._id)} className="flex flex-col gap-3 px-[23px] py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block text-sm text-white">{b.billType === 'proforma' ? 'Proforma' : 'Bill'} {b.number} · <span className="tabular-nums">{formatINR(billBalancePaise(b), { decimals: 2 })}</span></span>
                  <span className="block text-xs text-[#979797]">Due {formatDate(b.dueDate ?? b.issueDate)} · {formatDate(b.periodStart)} to {formatDate(b.periodEnd)}{b.tds?.declared ? ' · TDS 2% deducted' : ''}{b.receivedPaise ? ` · ${formatINR(b.receivedPaise)} received so far` : ''}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <a href={`/api/subscription/invoices/${b._id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}><Download className="size-3.5" /> PDF</a>
                  {b.paymentLink?.shortUrl ? <a href={b.paymentLink.shortUrl} target="_blank" rel="noreferrer" className={buttonClass('primary', 'sm')}><CreditCard className="size-3.5" /> Pay now</a> : b.publicKey ? <a href={billPublicUrl(b.publicKey)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}><ExternalLink className="size-3.5" /> Open bill</a> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<Wallet />} title="Nothing to pay right now." /></div>
        )}
      </TableCard>

      <section className="glass rounded-[14px] p-5">
        <SurfaceHeader icon={<Repeat strokeWidth={1.5} />} label="Autopay" description="UPI Autopay or an e-mandate renews your plan by itself. You get a notice 24 hours before every debit." actions={paidPlan && !checkoutAutopay ? <AutopayButtons state={autopayState} /> : null} />
        <div className="mt-3">
          <FactRow label="Status">{checkoutAutopay ? 'On (set up at checkout)' : autopayStatus ? AUTOPAY_LABEL[autopayStatus] : 'Off'}</FactRow>
          {sub?.autopay?.nextChargeAt && autopayCovers(autopayStatus) ? <FactRow label="Next debit"><span className="tabular-nums">{formatINR(debit, { decimals: 2 })} on {formatDate(new Date(sub.autopay.nextChargeAt))}</span></FactRow> : null}
          {!paidPlan ? <FactRow label="Note">Autopay starts once a plan is paid. Pay your bill first.</FactRow> : null}
          {needsPerDebitApproval({ amountPaise: debit, cycle: sub?.cycle }) ? <FactRow label="Above ₹15,000">{`Debits above ${formatINR(AFA_LIMIT_PAISE)} need your approval each time in your bank or UPI app.`}</FactRow> : null}
        </div>
      </section>

      <BillingHistory
        rows={invoices.map((i) => ({ id: String(i._id), number: i.number, issueDate: i.issueDate, periodStart: i.periodStart, periodEnd: i.periodEnd, totalPaise: i.totalPaise, provider: i.payment?.provider ?? 'simulated', paymentId: i.payment?.paymentId, utr: i.payment?.utr, status: i.status ?? 'paid', kind: i.kind ?? 'subscription' }))}
        total={invoiceTotal}
        page={p.page}
        pageSize={PAGE_SIZE}
        params={sp}
      />

      {payments.length ? (
        <TableCard icon={<Wallet strokeWidth={1.5} />} label="Bank transfers you reported" description="Matched against Flowbit's bank statement within 7 days">
          <ul className="border-t border-line">
            {payments.map((pay) => (
              <li key={String(pay._id)} className="flex items-center justify-between gap-3 px-[23px] py-3 text-sm">
                <span className="min-w-0"><span className="block text-white tabular-nums">{formatINR(pay.amountPaise, { decimals: 2 })} · {OFFLINE_MODE_LABEL[pay.mode as OfflineMode]} · UTR {pay.utr}</span><span className="block text-xs text-[#979797]">Paid {formatDate(pay.paidOn)}{pay.rejectedReason ? ` · ${pay.rejectedReason}` : ''}</span></span>
                <StatusWord status={pay.status} label={PAYMENT_STATUS[pay.status]?.label} tone={PAYMENT_STATUS[pay.status]?.tone} />
              </li>
            ))}
          </ul>
        </TableCard>
      ) : null}
    </div>
  )
}
