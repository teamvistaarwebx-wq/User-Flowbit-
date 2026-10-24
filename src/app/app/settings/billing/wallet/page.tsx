import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Gauge, ListOrdered, Repeat, ShieldCheck, Wallet as WalletIcon } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { requireWhatsAppPage } from '@/modules/features/flags'
import { formatDate, formatDateTime } from '@/lib/dates'
import { flowbitSupplier, isRazorpayConfigured, simulatedPaymentsAllowed } from '@/lib/env'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { FactRow, Notice, SurfaceHeader, TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { BillingTabs } from '@/components/billing/billing-tabs'
import { AutoTopUpForm, CapsForm, RechargeForm } from '@/components/billing/wallet-forms'
import { WalletLedger, type LedgerType } from '@/models/wallet/WalletLedger'
import { consoleSettings } from '@/modules/console/settings-query'
import { connectionInfo } from '@/modules/whatsapp/connection'
import { ensureWallet, stateOf } from '@/modules/wallet/store'
import { allowanceFor, freeLeft, spentNow } from '@/modules/wallet/rules'

export const metadata: Metadata = { title: 'WhatsApp wallet' }

const LEDGER_LABEL: Record<LedgerType, string> = { recharge: 'Recharge', bonus: 'Pack bonus', promo: 'Free credit from Flowbit', debit: 'Message', free: 'Free message (plan)', refund: 'Refund (not sent)', expiry: 'Expired' }
const CREDITS: readonly LedgerType[] = ['recharge', 'bonus', 'promo', 'refund']

/** Settings → Plan & billing → WhatsApp wallet: balance, recharge, caps, auto top-up and the ledger. */
export default async function WalletPage() {
  const ctx = await requireMember({ allowBlocked: true, perm: 'billing.manage' })
  await requireWhatsAppPage()
  const [doc, settings, connection, ledger] = await Promise.all([
    ensureWallet(ctx.orgId),
    consoleSettings(),
    connectionInfo(ctx.orgId),
    ctx.db(WalletLedger).find({}).sort({ at: -1, _id: -1 }).limit(100).lean(),
  ])
  const wallet = stateOf(doc)
  const now = new Date()
  const allowance = allowanceFor(ctx.org.subscription, settings.wallet, doc?.freeAllowanceOverride)
  const spent = spentNow(wallet, now)
  const canRecharge = isRazorpayConfigured() || simulatedPaymentsAllowed()
  const fee = settings.wallet.byoFeePaise

  return (
    <>
      <PageHeader title="Plan & billing" description="Your plan and seats, Flowbit's bills and invoices, autopay and the WhatsApp wallet." breadcrumb={breadcrumbFor('/app/settings/billing/wallet')} />
      <BillingTabs />
      <div className="grid grid-cols-12 gap-4">
        <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-5">
          <SurfaceHeader icon={<WalletIcon strokeWidth={1.5} />} label="Balance" description={connection.connected ? (connection.mode === 'byo' ? (fee ? `Each WhatsApp message costs ${formatINR(fee, { decimals: 2 })} from this wallet; Interakt bills you for Meta directly.` : 'Your own Interakt account pays for messages, so nothing is charged here now.') : 'Messages are charged at the Flowbit rate card.') : 'Used once WhatsApp is connected in Settings → Integrations.'} />
          <p className="mt-4 text-3xl font-semibold tabular-nums text-white">{formatINR(wallet.paidPaise + wallet.promoPaise, { decimals: 2 })}</p>
          <div className="mt-3">
            <FactRow label="Paid credit"><span className="tabular-nums">{formatINR(wallet.paidPaise, { decimals: 2 })}</span></FactRow>
            <FactRow label="Free credit (used first)"><span className="tabular-nums">{formatINR(wallet.promoPaise, { decimals: 2 })}</span></FactRow>
            <FactRow label="Free messages this month">{allowance ? `${freeLeft(wallet, allowance, now)} of ${allowance} left` : 'None on your plan'}</FactRow>
            <FactRow label="Spent today / this month"><span className="tabular-nums">{formatINR(spent.day, { decimals: 2 })} / {formatINR(spent.month, { decimals: 2 })}</span></FactRow>
          </div>
          {!connection.connected ? <p className="mt-3 text-xs text-fg-2"><Link href="/app/settings/integrations/whatsapp" className="text-link hover:underline">Connect WhatsApp</Link> to send from your own number.</p> : null}
        </section>

        <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-7">
          <SurfaceHeader icon={<WalletIcon strokeWidth={1.5} />} label="Recharge" description="Pay by UPI, card or net banking through Razorpay. Bigger packs carry free bonus credit." />
          <div className="mt-4">
            {canRecharge ? <RechargeForm disabled={false} chargeGst={Boolean(flowbitSupplier().gstin)} /> : <Notice tone="info">Online recharge is not switched on yet. Write to Flowbit support to add credit.</Notice>}
          </div>
        </section>

        <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-6">
          <SurfaceHeader icon={<Gauge strokeWidth={1.5} />} label="Spend caps" description="WhatsApp stops charging past these and messages fall back to email or wait up to 24 hours." />
          <div className="mt-4"><CapsForm dailyRupees={wallet.caps.dailyPaise / 100} monthlyRupees={wallet.caps.monthlyPaise / 100} /></div>
          <p className="mt-3 text-xs text-fg-2">You are alerted when the balance drops below {formatINR(settings.wallet.lowBalancePaise)} and when it runs out.</p>
        </section>

        <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-6">
          <SurfaceHeader icon={<Repeat strokeWidth={1.5} />} label="Auto top-up" />
          <div className="mt-4"><AutoTopUpForm enabled={Boolean(doc.autoTopUp?.enabled)} belowRupees={(doc.autoTopUp?.belowPaise ?? 20_000) / 100} packRupees={(doc.autoTopUp?.packPaise ?? 100_000) / 100} /></div>
        </section>

        <TableCard className="col-span-12" icon={<ListOrdered strokeWidth={1.5} />} label="Ledger" description="Every recharge, message, refund and expiry, newest first (last 100)">
          {ledger.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={tableHead}>
                    <th scope="col" className={th}>When</th>
                    <th scope="col" className={th}>What</th>
                    <th scope="col" className={cn(th, 'text-right')}>Amount</th>
                    <th scope="col" className={th}>Note</th>
                    <th scope="col" className={th}><span className="sr-only">Invoice</span></th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => {
                    const credit = CREDITS.includes(row.type as LedgerType)
                    return (
                      <tr key={String(row._id)} className={tableRow}>
                        <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{formatDateTime(row.at)}</td>
                        <td className={cn(td, 'whitespace-nowrap text-white')}>{LEDGER_LABEL[row.type as LedgerType] ?? row.type}{row.category ? ` · ${row.category}` : ''}</td>
                        <td className={cn(td, 'text-right tabular-nums', credit ? 'text-success' : 'text-white')}>{row.amountPaise ? `${credit ? '+' : '−'}${formatINR(row.amountPaise, { decimals: 2 })}` : '—'}</td>
                        <td className={cn(td, 'text-[#979797]')}>{row.note ?? ''}{row.type === 'recharge' && row.expiresAt ? ` · expires ${formatDate(row.expiresAt)}` : ''}</td>
                        <td className={td}>{row.invoiceId && row.type === 'recharge' ? <a href={`/api/subscription/invoices/${row.invoiceId}/pdf`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}><Download className="size-3.5" strokeWidth={1.5} /> Invoice</a> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line"><EmptyState compact icon={<WalletIcon />} title="Nothing yet." /></div>
          )}
        </TableCard>

        <section className="glass col-span-12 rounded-[14px] p-5">
          <SurfaceHeader icon={<ShieldCheck strokeWidth={1.5} />} label="Terms of message credit" />
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-2">
            <li>Credit can be used only for messages sent through Flowbit. It cannot be withdrawn as cash or moved to another workspace.</li>
            <li>Free and bonus credit is used first. Paid credit expires 12 months after the recharge it came from.</li>
            <li>A message that fails to send is not charged; its credit comes back.</li>
            <li>Unused paid credit is not refundable, except for a duplicate payment or if Flowbit stops the service. Then it goes back to the original payment method against a credit note.</li>
            <li>Prices exclude 18% GST, which is charged on each recharge with a tax invoice.</li>
          </ul>
        </section>
      </div>
    </>
  )
}
