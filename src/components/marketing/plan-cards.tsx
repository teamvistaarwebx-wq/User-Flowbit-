import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PRODUCTS } from '@/lib/catalog'
import { type BillingCycle, type PlanKey } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { PLAN_CARDS, firstPeriodUnitPrice, minimumNote, rupees, unitPrice, type PlanCard } from '@/modules/marketing/pricing'
import { ProductIcon } from './product-icon'
import { START_FREE_LABEL } from '@/modules/marketing/start-free'

/** Where a plan's "Start free" goes; the plan rides along so checkout can preselect it after the trial. */
export function signupHref(key: PlanKey): string {
  switch (key) {
    case 'suite':
      return '/signup?plan=suite'
    case 'muster_starter':
      return '/signup?plan=custom&products=muster&muster=starter'
    case 'muster_business':
      return '/signup?plan=custom&products=muster&muster=business'
    default:
      return `/signup?plan=custom&products=${key}`
  }
}

const period = (cycle: BillingCycle) => (cycle === 'yearly' ? 'year' : 'month')

/** Yearly shows the first-year price, with the list price it renews at. */
function Price({ plan, cycle, large }: { plan: PlanCard; cycle: BillingCycle; large?: boolean }) {
  const first = firstPeriodUnitPrice(plan.key, cycle)
  const list = unitPrice(plan.key, cycle)
  return (
    <>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className={cn('font-semibold tabular-nums text-white', large ? 'text-[48px] leading-none' : 'text-[36px] leading-none')}>{rupees(first)}</span>
        <span className="text-sm text-[#979797]">/ {plan.unitLabel} / {period(cycle)}</span>
      </p>
      {first < list ? <p className="mt-1 text-xs text-[#979797]">First year. Then {rupees(list)} a year.</p> : null}
    </>
  )
}

/**
 * Suite as the chosen onboarding option card (Figma step 2): grey glass, the 3px white-to-orchid stroke, a
 * "Best value" tab on its top edge and the violet band along the bottom carrying the minimum.
 */
function SuiteCard({ plan, cycle }: { plan: PlanCard; cycle: BillingCycle }) {
  return (
    <div className="relative mt-4 sm:col-span-2 lg:col-span-6">
      <span className="absolute bottom-full right-6 inline-flex h-[18px] items-center rounded-t-[8px] bg-violet-2 px-3 text-xs font-medium text-white">Best value</span>
      <div className="edge-selected overflow-hidden rounded-[14px] bg-white/[0.07] backdrop-blur-xl">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h3 className="text-lg font-semibold text-white">Suite: all four</h3>
            <Price plan={plan} cycle={cycle} large />
            <Button variant="primary" size="lg" className="mt-6" href={signupHref(plan.key)} iconRight={<ArrowRight className="size-4" />}>{START_FREE_LABEL}</Button>
          </div>
          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {(['work', 'muster', 'orbit', 'folio'] as const).map((k) => (
              <li key={k}>
                <p className="flex items-center gap-2 text-sm font-medium text-white"><ProductIcon product={k} />{PRODUCTS[k].name}{k === 'muster' ? ' Business' : ''}</p>
                <p className="mt-1 pl-6 text-xs leading-relaxed text-white/60">{PRODUCTS[k].tagline}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="bg-violet-2 px-6 py-3.5 text-sm text-white sm:px-8">
          Every product, everyone on the team · <span className="font-semibold">{minimumNote(plan.key, cycle)}</span>
        </p>
      </div>
    </div>
  )
}

function ProductCard({ plan, cycle, className }: { plan: PlanCard; cycle: BillingCycle; className?: string }) {
  return (
    <div className={cn('glass lift relative flex flex-col rounded-[14px] p-6', className)}>
      <p className="flex items-center gap-2 text-lg font-semibold text-white">
        {plan.product !== 'suite' ? <ProductIcon product={plan.product} /> : null}
        {plan.name}
      </p>
      <Price plan={plan} cycle={cycle} />
      <p className="mt-2 text-xs text-[#979797]">{minimumNote(plan.key, cycle)}</p>
      <p className="mt-5 flex gap-2.5 border-t border-line-soft/50 pt-4 text-sm leading-relaxed text-white/80">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2" aria-hidden>
          <Check className="size-2.5" strokeWidth={2.5} />
        </span>
        {plan.includes}
      </p>
      <div className="mt-auto pt-6">
        <Button variant="secondary" className="w-full" href={signupHref(plan.key)}>{START_FREE_LABEL}</Button>
      </div>
    </div>
  )
}

const PRODUCT_PLANS = PLAN_CARDS.filter((p) => !p.featured)

/**
 * Five product cards on a six-column grid: three across, then two wider ones, so no row ends in an empty slot.
 * On two columns an odd last card takes the full row.
 */
function productSpan(plan: PlanCard): string {
  const i = PRODUCT_PLANS.indexOf(plan)
  const n = PRODUCT_PLANS.length
  const firstRow = n % 3 === 2 ? n - 2 : n
  return cn(i < firstRow ? 'lg:col-span-2' : 'lg:col-span-3', n % 2 === 1 && i === n - 1 && 'sm:col-span-2 lg:col-span-3')
}

/** All six plans with prices for the chosen cycle, read from lib/plans. `only` limits to some plans (product pages). */
export function PlanCards({ cycle, only }: { cycle: BillingCycle; only?: PlanKey[] }) {
  if (!only) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {PLAN_CARDS.map((plan) => (plan.featured ? <SuiteCard key={plan.key} plan={plan} cycle={cycle} /> : <ProductCard key={plan.key} plan={plan} cycle={cycle} className={productSpan(plan)} />))}
      </div>
    )
  }
  const plans = PLAN_CARDS.filter((p) => only.includes(p.key))
  const products = plans.filter((p) => !p.featured)
  // Flex, not grid: the Suite card's column spans would otherwise add implicit columns and squeeze the product row.
  return (
    <div className="flex flex-col gap-4">
      <div className={cn('mx-auto grid w-full gap-4', products.length > 1 ? 'max-w-3xl sm:grid-cols-2' : 'max-w-md')}>
        {products.map((plan) => <ProductCard key={plan.key} plan={plan} cycle={cycle} />)}
      </div>
      {plans.filter((p) => p.featured).map((plan) => <SuiteCard key={plan.key} plan={plan} cycle={cycle} />)}
    </div>
  )
}
