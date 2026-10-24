import type { Selection, Usage } from '@/lib/billing'
import { PRODUCT_KEYS, type ProductKey } from '@/lib/catalog'
import type { PlanIntent } from '@/lib/plan-intent'
import type { BillingCycle } from '@/lib/plans'
import { defaultSelections, selectionOf, type StoredSub } from './selection'

/** What the plan picker starts with (pure; shared by the page and tests). */
export type PickerStart = {
  plan: 'suite' | 'custom'
  cycle: BillingCycle
  seats: number
  work: number | null
  muster: { tier: 'starter' | 'business'; employees: number } | null
  orbit: number | null
  folio: boolean
  /** Total Folio firms (with Folio or Suite); at least the included 2. */
  folioFirms: number
}

type SubLike = (StoredSub & { cycle?: string | null }) | null | undefined

/**
 * The picker's starting point: the current plan, preselected from the URL
 * (?add=orbit picks products with Orbit added; ?muster=business sets the tier;
 * ?products=work,folio picks several, as the stored pricing-page pick does),
 * otherwise Suite sized to today's usage.
 */
export function pickerStart(sub: SubLike, usage: Usage, query: { add?: string; muster?: string; products?: string }): PickerStart {
  const d = defaultSelections(usage)
  const cycle: BillingCycle = sub?.cycle === 'yearly' ? 'yearly' : 'monthly'
  const current: Selection | null = selectionOf(sub)
  const wanted = new Set([...(query.products ?? '').split(','), query.add ?? ''].filter((p): p is ProductKey => PRODUCT_KEYS.includes(p as ProductKey)))
  const tier = query.muster === 'business' || query.muster === 'starter' ? query.muster : null
  if (tier === 'business') wanted.add('muster')

  const folioFirms = Math.max(d.folioFirms, current?.folioFirms ?? 0)
  const base: PickerStart =
    current?.plan === 'suite'
      ? { plan: 'suite', cycle, seats: current.seats, work: null, muster: null, orbit: null, folio: false, folioFirms }
      : current?.plan === 'custom'
        ? { plan: 'custom', cycle, seats: d.suiteSeats, work: current.work ?? null, muster: current.muster ?? null, orbit: current.orbit ?? null, folio: Boolean(current.folio), folioFirms }
        : { plan: 'suite', cycle, seats: d.suiteSeats, work: null, muster: null, orbit: null, folio: false, folioFirms }

  if (!wanted.size) return base
  const custom: PickerStart = base.plan === 'suite' && current ? base : { ...base, plan: 'custom' }
  if (custom.plan === 'suite') return custom
  return {
    ...custom,
    work: wanted.has('work') ? (custom.work ?? d.work) : custom.work,
    orbit: wanted.has('orbit') ? (custom.orbit ?? d.orbit) : custom.orbit,
    folio: wanted.has('folio') ? true : custom.folio,
    muster: wanted.has('muster') ? { tier: tier ?? custom.muster?.tier ?? 'business', employees: custom.muster?.employees ?? d.employees } : custom.muster,
  }
}

/** Picker query from the URL, else from the pricing-page pick stored at signup (only while no plan was bought). */
export function pickerQuery(url: { add?: string; muster?: string; products?: string }, stored: PlanIntent | null, hasPlan: boolean): { add?: string; muster?: string; products?: string } {
  if (url.add || url.muster || url.products || hasPlan || !stored || stored.plan === 'suite') return url
  return { products: stored.products.join(','), muster: stored.muster ?? undefined }
}
