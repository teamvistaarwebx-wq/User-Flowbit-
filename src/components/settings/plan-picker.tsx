'use client'

import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { prorate, quoteSelection, quoteTaxLines, subscriptionInvoiceTotals, supplyTypeFor, type Selection } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { FOLIO_EXTRA_FIRM_PAISE, FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, FOLIO_MAX_FIRMS, monthlyPriceOf, PLAN_PRICES, YEARLY_FREE_MONTHS, type BillingCycle, type PlanKey, type PriceOverrides } from '@/lib/plans'
import { play } from '@/lib/sound'
import { guard, toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Segmented } from '@/components/ui/tabs'
import { confirmCheckout, simulatePayment, startCheckout } from '@/modules/subscription/checkout-actions'
import type { CheckoutStart } from '@/modules/subscription/checkout-types'
import { changePlan, confirmUpgrade } from '@/modules/subscription/plan-actions'
import { clampQuantity, MAX_QUANTITY, readTypedQuantity } from '@/modules/subscription/selection'
import { PlanSummary } from './plan-summary'
import { openRazorpay, RAZORPAY_SCRIPT } from './razorpay-checkout'

export type PickerInitial = {
  plan: 'suite' | 'custom'
  cycle: BillingCycle
  seats: number
  work: number | null
  muster: { tier: 'starter' | 'business'; employees: number } | null
  orbit: number | null
  folio: boolean
  folioFirms: number
}
export type ActivePlan = { amountPaise: number; cycle: BillingCycle; periodStart: string; periodEnd: string }

type Props = {
  initial: PickerInitial
  defaults: { work: number; employees: number; orbit: number; suiteSeats: number }
  persons: number
  testMode: boolean
  /** Production server without Razorpay keys: prices only, no checkout. */
  paymentsOff?: boolean
  supplierState: string | null
  /** Flowbit's GSTIN; null while unregistered, when no GST is charged (D8). */
  supplierGstin: string | null
  billingState: string | null
  /** Set while a plan is active: the picker changes the plan instead of starting a checkout. */
  active: ActivePlan | null
  /** The workspace kind leaves Muster out (freelancer): no Muster row, unless the active plan already has it. */
  hideMuster?: boolean
  /** Console prices (paise per unit per month, lib/plan-config); PLAN_PRICES when absent. */
  prices?: PriceOverrides
  /** First-year discount on a yearly plan when this workspace has never paid for a year (lib/first-year-discount); 0 = none. */
  discountPercent?: number
  onDone?: () => void
}

const price = (paise: number) => formatINR(paise)

function QuantityStepper({ value, min, max = MAX_QUANTITY, onChange, label, error }: { value: number; min: number; max?: number; onChange: (v: number) => void; label: string; error?: string }) {
  // While typing, the field keeps its own draft so it can pass through values
  // below the minimum; the minimum is applied on blur, not per keystroke.
  const [draft, setDraft] = useState<string | null>(null)
  const set = (v: number) => {
    setDraft(null)
    onChange(clampQuantity(v, min, max))
  }
  const onType = (raw: string) => {
    const typed = readTypedQuantity(raw, min, max)
    setDraft(typed.draft)
    if (typed.value !== null) onChange(typed.value)
  }
  const commit = () => {
    if (draft !== null) set(draft === '' ? min : Number(draft))
  }
  return (
    <div>
      <div className="inline-flex h-10 items-center gap-1 rounded-full bg-control p-1 ring-1 ring-inset ring-white/[0.12]">
        <button type="button" aria-label={`Fewer ${label}`} className="hit-area press relative rounded-full p-1.5 text-white/70 hover:bg-control-active hover:text-white" onClick={() => { play('click'); set(value - 1) }}>
          <Minus className="size-3.5" />
        </button>
        <input aria-label={label} inputMode="numeric" value={draft ?? value} onChange={(e) => onType(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} className="w-14 bg-transparent text-center text-sm font-semibold text-white tabular-nums focus:outline-none" />
        <button type="button" aria-label={`More ${label}`} className="hit-area press relative rounded-full p-1.5 text-white/70 hover:bg-control-active hover:text-white" onClick={() => { play('click'); set(value + 1) }}>
          <Plus className="size-3.5" />
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-[#FF6A66]">{error}</p> : null}
    </div>
  )
}

function ChoiceCard({ selected, onSelect, title, badge, children }: { selected: boolean; onSelect: () => void; title: string; badge?: string; children: ReactNode }) {
  const choose = () => {
    if (selected) return
    play('toggle')
    onSelect()
  }
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-label={title}
      tabIndex={0}
      onClick={choose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') choose()
      }}
      className={cn(
        'relative cursor-pointer rounded-[14px] p-[22px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orchid/40',
        selected ? 'edge-selected bg-white/[0.09]' : 'lit-edge bg-white/[0.05] hover:bg-white/[0.07]',
      )}
    >
      {selected ? (
        <span className="absolute bottom-full right-[18px] inline-flex h-[17px] items-center rounded-t-[8px] bg-violet-2 px-3 text-xs font-medium leading-none text-white">Selected</span>
      ) : null}
      <div className="mb-2 flex items-center gap-2.5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {badge ? <span className="text-xs font-medium text-pink">{badge}</span> : null}
      </div>
      {children}
    </div>
  )
}

function ProductRow({ on, onToggle, name, priceLine, children }: { on: boolean; onToggle: (v: boolean) => void; name: string; priceLine: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft/60 py-3 first:border-0" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <Checkbox checked={on} onCheckedChange={onToggle} aria-label={name} />
        <span>
          <span className="block text-sm font-medium text-white">{name}</span>
          <span className="block text-xs text-[#959596]">{priceLine}</span>
        </span>
      </div>
      {on ? children : null}
    </div>
  )
}

/** Suite or pick-your-products, monthly or yearly, with a live GST-inclusive price and checkout. */
export function PlanPicker({ initial, defaults, persons, testMode, paymentsOff = false, supplierState, supplierGstin, billingState, active, prices, discountPercent = 0, onDone, hideMuster = false }: Props) {
  const unit = (key: PlanKey) => price(monthlyPriceOf(key, prices))
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [cycle, setCycle] = useState<BillingCycle>(initial.cycle)
  const [plan, setPlan] = useState(initial.plan)
  const [seats, setSeats] = useState(initial.seats)
  const [work, setWork] = useState<number | null>(initial.work)
  const showMuster = !hideMuster || Boolean(active && initial.muster)
  const [muster, setMuster] = useState(showMuster ? initial.muster : null)
  const [orbit, setOrbit] = useState<number | null>(initial.orbit)
  const [folio, setFolio] = useState(initial.folio)
  const [folioFirms, setFolioFirms] = useState(Math.max(FOLIO_INCLUDED_FIRMS, initial.folioFirms))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const selection: Selection =
    plan === 'suite'
      ? { plan: 'suite', seats, folioFirms }
      : { plan: 'custom', ...(work ? { work } : {}), ...(muster ? { muster } : {}), ...(orbit ? { orbit } : {}), ...(folio ? { folio: true, folioFirms } : {}) }
  const firmsControl = (
    <div className="flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <span className="text-sm text-white">Folio firms</span>
      <QuantityStepper label="firms" value={folioFirms} min={FOLIO_INCLUDED_FIRMS} max={FOLIO_MAX_FIRMS} onChange={setFolioFirms} error={errors['selection.folioFirms']} />
      <span className="text-xs text-[#959596]">{FOLIO_INCLUDED_FIRMS} included, then {price(FOLIO_EXTRA_FIRM_PAISE)} per firm / month</span>
    </div>
  )
  const quote = quoteSelection(selection, cycle, { persons, prices, discountPercent })
  const totals = subscriptionInvoiceTotals(quoteTaxLines(quote), supplyTypeFor({ stateCode2: supplierState, gstin: supplierGstin }, billingState))
  const proration = active && active.cycle === cycle ? prorate({ oldAmountPaise: active.amountPaise, newAmountPaise: quote.periodAmountPaise, periodStart: new Date(active.periodStart), periodEnd: new Date(active.periodEnd) }) : null
  const upgradeNow = Boolean(proration && proration.amountPaise > 0)
  const upgradeTotal = proration && upgradeNow ? subscriptionInvoiceTotals([{ amountPaise: proration.amountPaise }], supplyTypeFor({ stateCode2: supplierState, gstin: supplierGstin }, billingState)).totalPaise : 0
  const renewsOn = active ? formatDate(new Date(active.periodEnd)) : ''

  const note = active
    ? upgradeNow
      ? `Applies now. You pay ${formatINR(upgradeTotal)}${supplierGstin ? ' incl. GST' : ''} for the remaining ${proration!.remainingDays} of ${proration!.totalDays} days, then the new price from ${renewsOn}.`
      : `Starts on ${renewsOn}, when your current period ends.`
    : undefined
  const buttonLabel = paymentsOff
    ? "Payments aren't set up yet"
    : active
    ? upgradeNow
      ? `${testMode ? 'Simulate payment' : 'Pay'} · ${formatINR(upgradeTotal)}`
      : 'Schedule change'
    : `${testMode ? 'Simulate payment' : 'Continue to payment'} · ${formatINR(totals.totalPaise)}`

  const finish = (message?: string) => {
    if (message) toast.success(message)
    else play('whoosh')
    onDone?.()
    router.refresh()
  }

  const submit = () =>
    startTransition(guard(async () => {
      const choice = { selection, cycle }
      const result = active ? await changePlan(choice) : testMode ? await simulatePayment(choice) : await startCheckout(choice)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        if (result.fieldErrors?.billing) document.getElementById('billing-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      setErrors({})
      const start = result.data as CheckoutStart | undefined
      if (start?.mode !== 'razorpay') return finish(result.message)
      const response = await openRazorpay(start.options)
      if (!response) return
      const confirmed = response.razorpay_order_id
        ? await confirmUpgrade({ razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature })
        : await confirmCheckout({ razorpay_payment_id: response.razorpay_payment_id, razorpay_subscription_id: response.razorpay_subscription_id ?? '', razorpay_signature: response.razorpay_signature })
      if (!confirmed.ok) return void toast.error(confirmed.error)
      finish(confirmed.message)
    }, 'We could not confirm the payment here. If money left your account, refresh in a few minutes or contact support.'))

  return (
    <div className="grid grid-cols-12 gap-4">
      {testMode ? null : <Script src={RAZORPAY_SCRIPT} strategy="lazyOnload" />}
      <div className="col-span-12 space-y-6 lg:col-span-7">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<BillingCycle> value={cycle} onChange={setCycle} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
          <span className="text-[13px] text-mint">{discountPercent > 0 ? `Yearly: ${YEARLY_FREE_MONTHS} months free + ${discountPercent}% off your first year` : `Yearly: ${YEARLY_FREE_MONTHS} months free, one payment for 12 months`}</span>
        </div>
        {errors.selection ? <p className="text-sm text-[#FF6A66]">{errors.selection}</p> : null}
        <ChoiceCard selected={plan === 'suite'} onSelect={() => setPlan('suite')} title="Suite: all four products" badge="Best value">
          <p className="text-sm text-white/80">Work, Muster Business, Orbit and Folio for everyone. {unit('suite')} per person / month, minimum {PLAN_PRICES.suite.minimum}.</p>
          {plan === 'suite' ? (
            <div className="mt-4 flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <span className="text-sm text-white">People</span>
              <QuantityStepper label="people" value={seats} min={PLAN_PRICES.suite.minimum} onChange={setSeats} error={errors['selection.seats']} />
            </div>
          ) : null}
          {plan === 'suite' ? <div className="mt-3">{firmsControl}</div> : null}
        </ChoiceCard>
        <ChoiceCard selected={plan === 'custom'} onSelect={() => setPlan('custom')} title="Pick products">
          <p className="mb-2 text-sm text-white/80">Pay only for what you use. Everyone who signs in counts as a Work user.</p>
          {plan === 'custom' ? (
            <div>
              <ProductRow on={Boolean(work)} onToggle={(v) => setWork(v ? defaults.work : null)} name="Flowbit Work" priceLine={`${unit('work')} per user / month · min ${PLAN_PRICES.work.minimum}`}>
                <QuantityStepper label="users" value={work ?? defaults.work} min={PLAN_PRICES.work.minimum} onChange={setWork} error={errors['selection.work']} />
              </ProductRow>
              {showMuster ? (
                <ProductRow on={Boolean(muster)} onToggle={(v) => setMuster(v ? { tier: 'business', employees: defaults.employees } : null)} name="Muster" priceLine={`Starter ${unit('muster_starter')} (no payroll) · Business ${unit('muster_business')} (payroll, PF/ESI/PT) per employee`}>
                  {muster ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Segmented<'starter' | 'business'> value={muster.tier} onChange={(tier) => setMuster({ ...muster, tier })} options={[{ value: 'starter', label: 'Starter' }, { value: 'business', label: 'Business' }]} />
                      <QuantityStepper label="employees" value={muster.employees} min={PLAN_PRICES.muster_starter.minimum} onChange={(employees) => setMuster({ ...muster, employees })} error={errors['selection.muster.employees']} />
                    </div>
                  ) : null}
                </ProductRow>
              ) : null}
              <ProductRow on={Boolean(orbit)} onToggle={(v) => setOrbit(v ? defaults.orbit : null)} name="Orbit" priceLine={`${unit('orbit')} per sales user / month · min ${PLAN_PRICES.orbit.minimum}`}>
                <QuantityStepper label="sales users" value={orbit ?? defaults.orbit} min={PLAN_PRICES.orbit.minimum} onChange={setOrbit} error={errors['selection.orbit']} />
              </ProductRow>
              <ProductRow on={folio} onToggle={setFolio} name="Folio" priceLine={`${unit('folio')} per workspace / month · ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users included`}>
                {errors['selection.folio'] ? <p className="text-xs text-[#FF6A66]">{errors['selection.folio']}</p> : null}
              </ProductRow>
              {folio ? <div className="pb-3 pl-8">{firmsControl}</div> : null}
            </div>
          ) : null}
        </ChoiceCard>
      </div>
      <div className="col-span-12 lg:col-span-5">
        <PlanSummary quote={quote} totals={totals} stateKnown={Boolean(billingState)} testMode={testMode} chargeGst={Boolean(supplierGstin)} note={note} persons={persons} buttonLabel={buttonLabel} onSubmit={submit} pending={pending} disabled={paymentsOff} />
      </div>
    </div>
  )
}
