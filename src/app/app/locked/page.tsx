import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { featureByKey, PRODUCT_KEYS, PRODUCTS, type ProductKey } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatINR } from '@/lib/money'
import { first, type SearchParams } from '@/lib/list'
import { enabled, FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, PLAN_PRICES, productTrialOf, type PlanKey } from '@/lib/plans'
import { buttonClass } from '@/components/ui/button-styles'
import { Icon } from '@/components/ui/icon'
import { AskAdminButton, OwnerButtons } from './_components/upsell-buttons'
import { PreviewDashboard } from './_components/preview-dashboard'

export const metadata: Metadata = { title: 'Product preview' }

const PRICE_KEY: Record<ProductKey, PlanKey> = { work: 'work', muster: 'muster_starter', orbit: 'orbit', folio: 'folio' }

function priceLine(product: ProductKey, payrollOnly: boolean): string {
  if (product === 'folio') return `${formatINR(PLAN_PRICES.folio.monthlyPaise, { decimals: 0 })} a month for the workspace, with ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users.`
  const price = PLAN_PRICES[payrollOnly ? 'muster_business' : PRICE_KEY[product]]
  return `From ${formatINR(price.monthlyPaise, { decimals: 0 })} per ${price.unit} a month (minimum ${price.minimum}), or everything with Suite at ${formatINR(PLAN_PRICES.suite.monthlyPaise, { decimals: 0 })} per person.`
}

/**
 * Where a member lands on a product (or feature) the workspace hasn't bought:
 * an illustrative dashboard with sample data, what the product does, the
 * price, and Add to plan (billing admins) or Ask your admin.
 */
export default async function LockedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ allowBlocked: true })
  const featureKey = first(sp.feature)
  const feature = featureKey ? featureByKey(featureKey) : undefined
  const requested = (first(sp.product) ?? featureKey?.split('.')[0]) as ProductKey
  const product = PRODUCTS[PRODUCT_KEYS.includes(requested) ? requested : 'work']
  const payrollOnly = feature?.requires === 'muster_business'
  // Already usable (a trial just started, or an old link): go straight to the product.
  if (featureKey ? ctx.hasFeature(featureKey) : ctx.has(product.key)) redirect(product.home)
  const switchedOff = !payrollOnly && ctx.entitlements.entitledProducts.includes(product.key) && !enabled(ctx.org, product.key)
  const canBuy = ctx.can('billing.manage')
  // Product trials are no longer offered (D2); one started earlier may have ended.
  const trialUsed = Boolean(productTrialOf(ctx.org, product.key))

  const status = payrollOnly
    ? 'Payroll with PF, ESI and PT is part of Muster Business. Your workspace is on Muster Starter.'
    : switchedOff
      ? `${product.name} is in your plan but switched off for this workspace.`
      : trialUsed
        ? `Your ${product.name} trial has ended. Your data is kept; add ${product.shortName} to your plan to pick up where you left off.`
        : `${product.name} isn't part of your plan yet. Here's what it looks like with sample data.`

  const actions = switchedOff ? (
    ctx.can('org.manage') ? (
      <Link href="/app/settings/modules" className={buttonClass('primary', 'lg')}>Turn it on in Modules</Link>
    ) : (
      <AskAdminButton product={product.key} />
    )
  ) : canBuy ? (
    <OwnerButtons product={product.key} addLabel={payrollOnly ? 'Upgrade to Business' : 'Add to plan'} />
  ) : (
    <AskAdminButton product={product.key} />
  )

  return (
    <div className="space-y-5">
      <header className="animate-slide-up">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: product.accent }}>
          <Icon name={product.icon} size={16} strokeWidth={1.5} /> {product.name}
        </p>
        <h1 className="mt-2 text-xl font-medium leading-7 text-white">{feature ? `${feature.name} needs Muster Business` : product.tagline}</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/70">{status}</p>
      </header>

      {/* The hero strip, as the dashboard's workday card: what it costs on the left, the next step on the right. */}
      <section className="glass flex flex-col gap-4 rounded-[16px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">Price</p>
          <p className="mt-1 text-sm text-white/80">{priceLine(product.key, payrollOnly)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      </section>

      <PreviewDashboard product={product.key} />

      <section className="card-solid p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">What {product.shortName} does</h2>
        <ul className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {product.features.slice(0, 5).map((f) => (
            <li key={f.key} className="flex gap-3">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2">
                <Check className="size-2.5" strokeWidth={2.5} />
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{f.name}</span>
                <span className="mt-0.5 block text-[13px] text-[#959596]">{f.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/app" className="inline-block text-sm text-white/70 transition-colors hover:text-white">Back to Home</Link>
    </div>
  )
}
