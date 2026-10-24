'use client'

import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { rechargeWalletAction, setAutoTopUpAction, setWalletCapsAction } from '@/modules/wallet/actions'
import { PACKS, rechargeQuote } from '@/modules/wallet/rules'

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** Packs with their bonus, or a custom amount; shows the GST and the total before paying. */
export function RechargeForm({ disabled, chargeGst }: { disabled: boolean; chargeGst: boolean }) {
  const [amount, setAmount] = useState(String(PACKS[1].paise / 100))
  const paise = Math.round(Number(amount) * 100)
  const quote = Number.isFinite(paise) && paise > 0 ? rechargeQuote(paise, chargeGst) : null
  return (
    <ActionForm action={rechargeWalletAction} onDone={(r) => { if (r.data?.url) window.location.href = r.data.url }} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Recharge pack">
        {PACKS.map((p) => {
          const active = paise === p.paise
          return (
            <button key={p.paise} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => setAmount(String(p.paise / 100))} className={cn('rounded-[12px] border px-3 py-2 text-left text-sm transition-colors', active ? 'border-violet-2 bg-white/[0.08] text-white' : 'border-line bg-white/[0.02] text-fg-2 hover:border-white/30')}>
              <span className="block font-medium tabular-nums">{inr(p.paise)}</span>
              <span className="block text-xs">{p.bonusPercent ? `+${p.bonusPercent}% bonus` : 'No bonus'}</span>
            </button>
          )
        })}
      </div>
      <FormField name="amount" label={chargeGst ? "Amount (₹, before GST)" : "Amount (₹)"} help="At least ₹500, whole rupees.">
        <Input id="amount" name="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} disabled={disabled} />
      </FormField>
      {quote ? (
        <p className="text-xs text-fg-2">
          You pay <span className="tabular-nums text-white">{inr(quote.payablePaise)}</span> {chargeGst ? <>({inr(quote.creditPaise)} + {inr(quote.gstPaise)} GST)</> : '(no GST: Flowbit is not GST-registered yet)'} and get <span className="text-white">{inr(quote.creditPaise)}</span> of credit{quote.bonusPaise ? <> plus <span className="text-white">{inr(quote.bonusPaise)}</span> bonus</> : null}. {chargeGst ? 'A GST tax invoice is issued at once.' : 'An invoice (not a tax invoice) is issued at once.'}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Starting…" icon={<Wallet className="size-4" />} disabled={disabled}>Recharge</SubmitButton>
    </ActionForm>
  )
}

export function CapsForm({ dailyRupees, monthlyRupees }: { dailyRupees: number; monthlyRupees: number }) {
  return (
    <ActionForm action={setWalletCapsAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <FormField name="daily" label="Daily cap (₹)" help="0 = no cap"><Input id="daily" name="daily" inputMode="numeric" defaultValue={String(dailyRupees)} /></FormField>
      <FormField name="monthly" label="Monthly cap (₹)" help="0 = no cap"><Input id="monthly" name="monthly" inputMode="numeric" defaultValue={String(monthlyRupees)} /></FormField>
      <SubmitButton>Save caps</SubmitButton>
    </ActionForm>
  )
}

export function AutoTopUpForm({ enabled, belowRupees, packRupees }: { enabled: boolean; belowRupees: number; packRupees: number }) {
  return (
    <ActionForm action={setAutoTopUpAction} className="space-y-3">
      <Checkbox name="enabled" defaultChecked={enabled} label="Top up automatically" description="Not charged automatically yet: wallet autopay needs a UPI Autopay mandate, which comes later. Until then the low-balance alert reminds you to recharge." />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FormField name="below" label="When the balance is below (₹)"><Input id="below" name="below" inputMode="numeric" defaultValue={String(belowRupees)} /></FormField>
        <FormField name="pack" label="Add (₹)"><Input id="pack" name="pack" inputMode="numeric" defaultValue={String(packRupees)} /></FormField>
        <SubmitButton>Save</SubmitButton>
      </div>
    </ActionForm>
  )
}
