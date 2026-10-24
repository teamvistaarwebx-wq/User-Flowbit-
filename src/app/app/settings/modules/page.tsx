import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Lock } from 'lucide-react'
import { breadcrumbFor, PRODUCT_KEYS, PRODUCTS, type ProductKey } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatINR } from '@/lib/money'
import { enabled, PLAN_PRICES } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { ModuleSwitch } from '@/components/settings/module-switch'
import { Member } from '@/models/Member'
import { User } from '@/models/User'

export const metadata: Metadata = { title: 'Modules' }

const PRICE_LINE: Record<ProductKey, string> = {
  work: `${formatINR(PLAN_PRICES.work.monthlyPaise)} per user / month`,
  muster: `${formatINR(PLAN_PRICES.muster_starter.monthlyPaise)}–${formatINR(PLAN_PRICES.muster_business.monthlyPaise)} per employee / month`,
  orbit: `${formatINR(PLAN_PRICES.orbit.monthlyPaise)} per sales user / month`,
  folio: `${formatINR(PLAN_PRICES.folio.monthlyPaise)} per workspace / month`,
}
const SUITE_LINE = `or Suite ${formatINR(PLAN_PRICES.suite.monthlyPaise)} per person`

export default async function ModulesPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const org = ctx.org
  const ent = ctx.entitlements
  const trial = ent.trialing
  const tier = ent.musterTier
  const isEntitledTo = (p: ProductKey) => ent.entitledProducts.includes(p)
  const owner = await ctx.db(Member).findOne({ role: 'owner', status: 'active' }, { userId: 1 }).lean()
  const ownerName = owner ? (await User.findById(owner.userId, { name: 1 }).lean())?.name ?? 'the owner' : 'the owner'
  const canBuy = ctx.can('billing.manage')
  const clientsOn = (['work', 'orbit', 'folio'] as const).some((p) => ctx.has(p))

  const stateOf = (p: ProductKey) => {
    if (!isEntitledTo(p)) return 'Not in your plan'
    if (trial) return ent.accountType === 'free' ? 'Included in the Free plan' : 'Included in your trial'
    if (p === 'muster') return tier === 'business' ? 'In your plan · Business' : 'In your plan · Starter, no payroll'
    return 'In your plan'
  }

  return (
    <>
      <PageHeader title="Modules" help="modules-vs-plan" description="Switch products on or off for everyone in the workspace. Switching off hides a product and keeps its data; it does not change your bill. What you pay is set in Plan & billing." breadcrumb={breadcrumbFor('/app/settings/modules')} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PRODUCT_KEYS.map((p) => {
          const product = PRODUCTS[p]
          const isEntitled = isEntitledTo(p)
          const isOn = isEntitled && enabled(org, p)
          return (
            <Card key={p} className={cn('relative flex flex-col overflow-hidden rounded-[10px]', !isEntitled && 'bg-white/[0.025]')}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Icon name={product.icon} className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} style={{ color: `var(${product.accentVar})` }} />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-6 text-white">{product.name}</h2>
                    <p className={cn('mt-0.5 flex items-center gap-1.5 text-[13px]', isEntitled ? 'text-[#959596]' : 'text-warning')}>
                      {isEntitled ? null : <Lock className="size-3.5" strokeWidth={1.5} />}
                      {isEntitled ? `${stateOf(p)} · ${isOn ? 'on' : 'off'}` : stateOf(p)}
                    </p>
                  </div>
                </div>
                {isEntitled ? <ModuleSwitch product={p} name={product.name} enabled={isOn} /> : null}
              </div>
              <p className="mt-3 text-sm text-white/80">{product.tagline}</p>
              <ul className="mb-4 mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {product.features.slice(0, 6).map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-[13px] text-white">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2">
                      <Check className="size-2.5" strokeWidth={2.5} />
                    </span>
                    {f.name}
                    {f.requires === 'muster_business' && tier === 'starter' && !trial ? <span className="text-xs text-warning">Business</span> : null}
                  </li>
                ))}
              </ul>
              {!isEntitled ? (
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
                  <span className="text-xs text-[#959596]">
                    {PRICE_LINE[p]} · {SUITE_LINE}
                  </span>
                  {canBuy ? (
                    <Link href={`/app/settings/subscription?add=${p}`} className={buttonClass('primary', 'sm')}>
                      Add to plan
                    </Link>
                  ) : (
                    <span className="text-xs text-fg-2">Ask {ownerName} to add it.</span>
                  )}
                </div>
              ) : p === 'muster' && tier === 'starter' && !trial ? (
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
                  <span className="text-xs text-[#959596]">Payroll needs Muster Business.</span>
                  {canBuy ? (
                    <Link href="/app/settings/subscription?muster=business" className={buttonClass('secondary', 'sm')}>
                      Upgrade
                    </Link>
                  ) : (
                    <span className="text-xs text-fg-2">Ask {ownerName} to upgrade.</span>
                  )}
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>
      <Card variant="solid" className="mt-4 rounded-[10px]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">Always on</p>
        <p className="mt-1 text-sm text-white/80">Home, Notifications and Settings{clientsOn ? ', plus Clients while Work, Orbit or Folio is on' : ''}.</p>
      </Card>
    </>
  )
}
