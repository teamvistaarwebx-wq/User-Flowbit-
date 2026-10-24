'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, Lock, ShieldCheck } from 'lucide-react'
import { findPage, PRODUCTS } from '@/lib/catalog'
import { lifecycleCopy } from '@/lib/lifecycle-copy'
import { ExportLink, StartTrialButton, UpgradeLink } from '@/components/subscription/lifecycle-buttons'
import { useShell } from './shell-context'

const TRIAL_WARN_DAYS = 15
/** The Free countdown shows in the last month (the first reminder email goes out then too). */
const FREE_WARN_DAYS = 30
/** A quiet strip in the content column: the lit glass hairline, no coloured border. */
const BANNER = 'glass mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-[10px] px-4 py-2 text-sm sm:mx-6 md:ml-7 md:mr-8 md:mt-3 lg:mr-[33px]'

/** Flowbit support access running now (console spec 8), above any other notice. */
function SupportBanner() {
  const { support, can } = useShell()
  if (!support) return null
  const until = new Date(support.until).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  return (
    <div className={`${BANNER} text-fg-2`} role="status">
      <ShieldCheck className="size-4 shrink-0 text-fg" strokeWidth={1.5} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-fg">{support.staffName} from Flowbit has {support.mode === 'import' ? 'import-only' : 'read-only'} access</span> until {until}.
      </span>
      {can('org.manage') ? <Link href="/app/settings/support" className="shrink-0 text-[13px] font-medium text-link">Manage</Link> : null}
    </div>
  )
}

/** Support access, then lifecycle (state, days left, what happens next, actions) and product-trial notices above the content. */
export function Banners() {
  return (
    <>
      <SupportBanner />
      <LifecycleBanners />
    </>
  )
}

function LifecycleBanners() {
  const shell = useShell()
  const pathname = usePathname()
  const pageProduct = findPage(pathname)?.products?.[0]
  const productTrialLeft = pageProduct ? shell.productTrials[pageProduct] : undefined
  const canBuy = shell.can('billing.manage')
  const lc = shell.lifecycle
  const copy = lifecycleCopy(lc)
  const actions = (
    <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
      {shell.isOwner && (lc.stage === 'read_only' || lc.stage === 'blocked') ? <ExportLink /> : null}
      {canBuy && shell.trialAvailable ? <StartTrialButton /> : null}
      {canBuy ? <UpgradeLink /> : null}
    </span>
  )
  const askOwner = canBuy ? '' : ' Ask your workspace owner to choose a plan.'

  if (copy && (lc.stage === 'read_only' || lc.stage === 'blocked')) {
    return (
      <div className={`${BANNER} ${lc.stage === 'blocked' ? 'text-[#FF7B77]' : 'text-warning'}`}>
        <Lock className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{copy.state}.</span> <span className="text-fg-2">{copy.next}{askOwner}</span>
        </span>
        {actions}
      </div>
    )
  }
  const warnDays = lc.stage === 'free' ? FREE_WARN_DAYS : TRIAL_WARN_DAYS
  if (copy && (lc.stage === 'free' || lc.stage === 'trial') && lc.daysLeft != null && lc.daysLeft <= warnDays) {
    return (
      <div className={`${BANNER} text-fg-2`}>
        <Clock className="size-4 shrink-0 text-fg" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{copy.state}.</span> {copy.next}
        </span>
        {actions}
      </div>
    )
  }
  if (pageProduct && productTrialLeft != null) {
    return (
      <div className={`${BANNER} text-fg-2`}>
        <Clock className="size-4 shrink-0 text-fg" strokeWidth={1.5} />
        <span>
          <span className="font-semibold text-fg">{productTrialLeft} {productTrialLeft === 1 ? 'day' : 'days'} left</span> in your {PRODUCTS[pageProduct].name} trial.
        </span>
        {canBuy ? (
          <Link href={`/app/settings/subscription?add=${pageProduct}`} className="shimmer ml-auto inline-flex h-8 shrink-0 items-center rounded-full bg-grad-button px-4 text-[13px] font-medium text-white">
            Add to plan
          </Link>
        ) : null}
      </div>
    )
  }
  return null
}
