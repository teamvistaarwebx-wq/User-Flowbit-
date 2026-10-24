import { MessageCircle, Wallet as WalletIcon } from 'lucide-react'
import type { StaffCtx } from '@/lib/console/session'
import { formatDateTime } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { FactRow, SurfaceHeader, TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { AllowanceOverrideDialog, GrantPromoDialog } from '@/components/console/wallet-actions'
import { Wallet } from '@/models/wallet/Wallet'
import { WalletLedger } from '@/models/wallet/WalletLedger'
import { WaConnection } from '@/models/whatsapp/WaConnection'
import { MODE_LABEL } from '@/modules/whatsapp/provider'
import { consoleSettings } from '@/modules/console/settings-query'
import { allowanceFor, allowanceTier } from '@/modules/wallet/rules'
import { Org } from '@/models/Org'

type Scoped = ReturnType<StaffCtx['forOrg']>

const CREDITS = new Set(['recharge', 'bonus', 'promo', 'refund'])

/** Console account → WhatsApp wallet: the connection, balances, ledger, and (Admin) promo grants. */
export async function WalletTab({ scoped, orgId, canGrant }: { scoped: Scoped; orgId: string; canGrant: boolean }) {
  const [wallet, connection, ledger, settings, org] = await Promise.all([
    scoped.db(Wallet).findOne({}).lean(),
    scoped.db(WaConnection).findOne({}, { mode: 1, status: 1, phone: 1, displayName: 1, connectedAt: 1, lastEventAt: 1 }).lean(),
    scoped.db(WalletLedger).find({}).sort({ at: -1, _id: -1 }).limit(100).lean(),
    consoleSettings(),
    Org.findById(orgId, { 'subscription.plan': 1, 'subscription.accountType': 1 }).lean(),
  ])
  const override = wallet?.freeAllowanceOverride ?? null
  const planAllowance = settings.wallet.allowance[allowanceTier(org?.subscription)]
  const paid = wallet?.paidPaise ?? 0
  const promo = wallet?.promoPaise ?? 0
  return (
    <div className="space-y-4">
      <section className="glass rounded-[14px] p-5">
        <SurfaceHeader icon={<MessageCircle strokeWidth={1.5} />} label="WhatsApp (own number)" />
        <div className="mt-3">
          <FactRow label="Status">{connection?.status === 'connected' ? `Connected · ${MODE_LABEL[connection.mode === 'managed' ? 'managed' : 'byo']}` : 'Not connected'}</FactRow>
          {connection?.phone ? <FactRow label="Number">{connection.displayName ? `${connection.displayName} · ` : ''}{connection.phone}</FactRow> : null}
          {connection?.lastEventAt ? <FactRow label="Last webhook event">{formatDateTime(connection.lastEventAt)}</FactRow> : null}
        </div>
      </section>
      <section className="glass rounded-[14px] p-5">
        <SurfaceHeader icon={<WalletIcon strokeWidth={1.5} />} label="Wallet" actions={canGrant ? <span className="flex flex-wrap gap-2"><AllowanceOverrideDialog orgId={orgId} current={override} planAllowance={planAllowance} /><GrantPromoDialog orgId={orgId} /></span> : null} />
        <div className="mt-3">
          <FactRow label="Balance"><span className="tabular-nums">{formatINR(paid + promo, { decimals: 2 })}</span></FactRow>
          <FactRow label="Paid / free credit"><span className="tabular-nums">{formatINR(paid, { decimals: 2 })} / {formatINR(promo, { decimals: 2 })}</span></FactRow>
          <FactRow label="Free messages a month">{override == null ? `${planAllowance} (the plan's)` : `${allowanceFor(org?.subscription, settings.wallet, override)} (set for this workspace; the plan gives ${planAllowance})`}</FactRow>
          <FactRow label="Spend caps">{wallet?.caps?.dailyPaise ? `${formatINR(wallet.caps.dailyPaise)} a day` : 'No daily cap'} · {wallet?.caps?.monthlyPaise ? `${formatINR(wallet.caps.monthlyPaise)} a month` : 'no monthly cap'}</FactRow>
          <FactRow label="Auto top-up">{wallet?.autoTopUp?.enabled ? `On (reminder only): ${formatINR(wallet.autoTopUp.packPaise ?? 0)} below ${formatINR(wallet.autoTopUp.belowPaise ?? 0)}` : 'Off'}</FactRow>
        </div>
      </section>
      <TableCard icon={<WalletIcon strokeWidth={1.5} />} label="Ledger" description="Last 100 entries">
        {ledger.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className={tableHead}>
                  <th scope="col" className={th}>When</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={cn(th, 'text-right')}>Amount</th>
                  <th scope="col" className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={String(r._id)} className={tableRow}>
                    <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{formatDateTime(r.at)}</td>
                    <td className={cn(td, 'text-white')}>{r.type}</td>
                    <td className={cn(td, 'text-right tabular-nums text-white')}>{r.amountPaise ? `${CREDITS.has(r.type) ? '+' : '−'}${formatINR(r.amountPaise, { decimals: 2 })}` : '—'}</td>
                    <td className={cn(td, 'text-[#979797]')}>{r.note ?? ''}{r.byName ? ` · ${r.byName}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<WalletIcon />} title="No wallet activity." /></div>
        )}
      </TableCard>
    </div>
  )
}
