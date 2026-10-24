import { featureByKey, type ProductKey } from '@/lib/catalog'
import { formatINR } from '@/lib/money'
import { DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT, firstYearDiscountPaise } from '@/lib/first-year-discount'
import { FOLIO_EXTRA_FIRM_PAISE, FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, FOLIO_MAX_FIRMS, GST_PERCENT, PLAN_PRICES, YEARLY_FREE_MONTHS, YEARLY_MONTHS, quote, type BillingCycle, type MusterTier, type PlanKey, type Quote } from '@/lib/plans'

/**
 * Marketing views of the price table. Every figure is derived from
 * `@/lib/plans` so the website can never drift from checkout.
 */

export const TEAM_MIN = 6
export const TEAM_MAX = 150
export const TEAM_DEFAULT = 20
export const ORBIT_SEATS_DEFAULT = 2

export type PlanCard = {
  key: PlanKey
  name: string
  product: ProductKey | 'suite'
  includes: string
  unitLabel: string
  featured?: boolean
}

/** The six plans in display order. Names and copy only; prices come from PLAN_PRICES. */
export const PLAN_CARDS: PlanCard[] = [
  { key: 'suite', name: 'Suite', product: 'suite', featured: true, includes: 'Work, Muster Business, Orbit and Folio for everyone on the team.', unitLabel: 'person' },
  { key: 'work', name: 'Flowbit Work', product: 'work', includes: 'Tasks, spaces, projects, teams, meetings, posts, time, whiteboards, reports and Arc.', unitLabel: 'user' },
  { key: 'muster_starter', name: 'Muster Starter', product: 'muster', includes: 'People, attendance, leave, reimbursements, letters and self-service. No payroll.', unitLabel: 'employee' },
  { key: 'muster_business', name: 'Muster Business', product: 'muster', includes: 'Everything in Starter, plus payroll with PF, ESI, PT and payslips.', unitLabel: 'employee' },
  { key: 'orbit', name: 'Orbit', product: 'orbit', includes: 'Leads, deals, contacts, activities and pipeline reports.', unitLabel: 'sales user' },
  { key: 'folio', name: 'Folio', product: 'folio', includes: `GST invoices, quotes, receipts, ledger, aging and recurring retainers. ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users included; each extra firm is ${formatINR(FOLIO_EXTRA_FIRM_PAISE, { decimals: 0 })} a month. The ${FOLIO_INCLUDED_USERS} users cannot be raised: Owner, Admins, Finance and Sales count, so bigger teams take Suite.`, unitLabel: 'workspace' },
]

const months = (cycle: BillingCycle) => (cycle === 'yearly' ? YEARLY_MONTHS : 1)

/**
 * The first-year discount the public site shows (console spec 2). The site is
 * static, so it shows the default; a different Console percentage shows in the
 * plan picker and on bills.
 */
export const YEARLY_DISCOUNT_PERCENT = DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT

/** Unit list price for one billing period, in paise (yearly = 10 months' price). What a yearly renewal pays. */
export const unitPrice = (key: PlanKey, cycle: BillingCycle): number => PLAN_PRICES[key].monthlyPaise * months(cycle)

/** Unit price in the first period: yearly is the list price less the first-year discount. */
export const firstPeriodUnitPrice = (key: PlanKey, cycle: BillingCycle): number => {
  const list = unitPrice(key, cycle)
  return cycle === 'yearly' ? list - firstYearDiscountPaise(list, YEARLY_DISCOUNT_PERCENT) : list
}

/** "2 months free + 50% off your first year" for the yearly toggle. */
export const yearlyOfferCopy = (): string => `${YEARLY_FREE_MONTHS} months free + ${YEARLY_DISCOUNT_PERCENT}% off your first year`

/** The smallest bill a plan can produce in one period, in paise. */
export const minimumPrice = (key: PlanKey, cycle: BillingCycle): number => unitPrice(key, cycle) * (PLAN_PRICES[key].flat ? 1 : PLAN_PRICES[key].minimum)

/**
 * The one GST sentence for the website, FAQ and Terms (owner decision D8):
 * static pages cannot read FLOWBIT_GSTIN, so it reads true before and after
 * registration. Bills follow lib/billing supplyTypeFor.
 */
export const gstCopy = (legalName: string): string =>
  `Prices exclude ${GST_PERCENT}% GST. Until ${legalName} is registered for GST, we charge no GST and our invoices say they are not tax invoices. After registration, ${GST_PERCENT}% GST is added and every payment gets a GST tax invoice.`

/** "₹149" — whole rupees for marketing figures. */
export const rupees = (paise: number): string => formatINR(paise, { decimals: 0 })

/** "₹199 a month for each firm beyond the 2 included". */
export const extraFirmCopy = (): string => `${rupees(FOLIO_EXTRA_FIRM_PAISE)} a month for each firm beyond the ${FOLIO_INCLUDED_FIRMS} included`

/** "Minimum 10 people (₹1,490 a month)" from the price table. */
export function minimumNote(key: PlanKey, cycle: BillingCycle): string {
  const price = PLAN_PRICES[key]
  const period = cycle === 'yearly' ? 'a year' : 'a month'
  const firstMinimum = firstPeriodUnitPrice(key, cycle) * (price.flat ? 1 : price.minimum)
  const amount = cycle === 'yearly' ? `${rupees(firstMinimum)} the first year` : `${rupees(minimumPrice(key, cycle))} ${period}`
  if (price.flat) return `Flat per workspace (${amount})`
  const unit = PLAN_CARDS.find((c) => c.key === key)?.unitLabel ?? price.unit
  const plural = price.minimum === 1 ? unit : unit === 'person' ? 'people' : `${unit}s`
  return `Minimum ${price.minimum} ${plural} (${amount})`
}

/** The cheapest per-unit monthly price across products ("from ₹39"). */
export const lowestMonthly = (): number =>
  Math.min(...(Object.values(PLAN_PRICES).filter((p) => p.key !== 'suite' && !p.flat).map((p) => p.monthlyPaise)))

export type CalculatorInput = {
  teamSize: number
  work: boolean
  muster: MusterTier | null
  orbit: boolean
  folio: boolean
  orbitSeats: number
  /** Folio firms (billing entities); the first 2 are included. */
  folioFirms?: number
  cycle: BillingCycle
}

export type Estimate = {
  /** The products picked one by one, or null when nothing is picked. */
  picked: Quote | null
  suite: Quote
  /** How much Suite saves over the picked products, per period, ex-GST (0 when it does not). */
  suiteSavesPaise: number
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))

/** Calculator: picked products vs Suite for a team, both through `quote()`. Persons ≈ team size. Yearly shows the first year (discounted). */
export function estimate(input: CalculatorInput): Estimate {
  const discount = input.cycle === 'yearly' ? YEARLY_DISCOUNT_PERCENT : 0
  const seats = clamp(input.teamSize, TEAM_MIN, TEAM_MAX)
  const folioFirms = clamp(input.folioFirms ?? FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_FIRMS, FOLIO_MAX_FIRMS)
  const anyPicked = input.work || input.muster !== null || input.orbit || input.folio
  const picked = anyPicked
    ? quote({ suite: false, work: input.work, muster: input.muster, orbit: input.orbit, folio: input.folio, seats, orbitSeats: clamp(input.orbitSeats, PLAN_PRICES.orbit.minimum, seats), folioFirms, cycle: input.cycle }, undefined, discount)
    : null
  const suite = quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats, folioFirms, cycle: input.cycle }, undefined, discount)
  const suiteSavesPaise = picked ? Math.max(0, picked.subtotalPaise - suite.subtotalPaise) : 0
  return { picked, suite, suiteSavesPaise }
}

/** Product each plan unlocks (Suite unlocks all four). */
const PLAN_PRODUCT: Record<PlanKey, ProductKey | 'suite'> = {
  work: 'work', muster_starter: 'muster', muster_business: 'muster', orbit: 'orbit', folio: 'folio', suite: 'suite',
}

/** Compare table: does a plan include a catalog feature? Muster Starter excludes Business-only features (payroll). */
export function planIncludes(plan: PlanKey, featureKey: string): boolean {
  const product = featureKey.split('.')[0]
  const unlocked = PLAN_PRODUCT[plan]
  if (unlocked !== 'suite' && unlocked !== product) return false
  if (plan === 'muster_starter' && featureByKey(featureKey)?.requires === 'muster_business') return false
  return true
}
