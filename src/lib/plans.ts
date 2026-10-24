import { accountTypeOf, FREE_SEAT_LIMIT, freeEndsAt, isHouseAccount } from '@/lib/account-types'
import { featureByKey, PRODUCT_KEYS, type FeatureKey, type ProductKey } from '@/lib/catalog'
import { firstYearDiscountPaise } from '@/lib/first-year-discount'

/**
 * Plans, entitlements and pricing (SPEC section 4). Pure functions, safe on
 * the client (the pricing page uses `quote`). Money is integer paise.
 */

export const TRIAL_DAYS = 15
export const READ_ONLY_DAYS = 30
export const GST_PERCENT = 18
/**
 * Yearly list price = 10 x monthly ("2 months free"; owner decision D1, 11 Oct
 * 2026). The first yearly invoice also gets the first-year discount on top
 * (lib/first-year-discount, 50% by default): 20 on Suite pay ₹14,900 in year 1
 * and ₹29,800 at each renewal, ex-GST.
 */
export const YEARLY_MONTHS = 10
/** Days a past-due subscription keeps full access before going read-only. */
export const PAST_DUE_GRACE_DAYS = 7
/** Months of the year a yearly plan does not charge for ("2 months free"). */
export const YEARLY_FREE_MONTHS = 12 - YEARLY_MONTHS

/**
 * The one sentence every page uses for yearly pricing (D1): "Yearly plans cost
 * 10 months' price (2 months free), and your first year is 50% off on top.
 * Monthly plans pay the list price." Without a discount the second clause goes.
 */
export function yearlyPricingCopy(discountPercent: number): string {
  const base = `Yearly plans cost ${YEARLY_MONTHS} months’ price (${YEARLY_FREE_MONTHS} months free)`
  const offer = discountPercent > 0 ? `, and your first year is ${discountPercent}% off on top` : ''
  return `${base}${offer}. Monthly plans pay the list price.`
}
/** Folio's flat price covers this many firms (billing entities) and users. */
export const FOLIO_INCLUDED_FIRMS = 2
export const FOLIO_INCLUDED_USERS = 3
/** Each Folio firm beyond the included ones, ex-GST per month, in paise. */
export const FOLIO_EXTRA_FIRM_PAISE = 19_900
/** Upper bound for firms on one workspace (validation). */
export const FOLIO_MAX_FIRMS = 200
const DAY_MS = 86_400_000

export type MusterTier = 'starter' | 'business'
export type BillingCycle = 'monthly' | 'yearly'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'

export type ProductTrialLike = { product: string; startedAt?: Date | string | null; endsAt: Date | string }

export type SubscriptionLike = {
  status: SubscriptionStatus | string
  plan: 'trial' | 'suite' | 'custom' | string
  /** lib/account-types; absent on workspaces created before the field existed. */
  accountType?: string | null
  products?: { work?: boolean | null; muster?: MusterTier | string | null; orbit?: boolean | null; folio?: boolean | null } | null
  seats?: number | null
  /** Extra Folio firms paid for, beyond FOLIO_INCLUDED_FIRMS. */
  quantities?: { folioFirms?: number | null; [product: string]: number | null | undefined } | null
  /** One-time product trials started before 11 Oct 2026 (no longer offered; read until they end). */
  productTrials?: readonly ProductTrialLike[] | null
  cycle?: BillingCycle | string | null
  trialEndsAt?: Date | string | null
  currentPeriodStart?: Date | string | null
  currentPeriodEnd?: Date | string | null
  pastDueSince?: Date | string | null
  endedAt?: Date | string | null
  /** When the workspace's one 15-day trial began (signup trial or "Start trial" from Free); set = used (lib/lifecycle). */
  trialStartedAt?: Date | string | null
  /** End of the 6-month Free window, kept while a trial runs so trimming to 5 can return to Free. */
  freeEndsAt?: Date | string | null
  /** Comped / Partner: when the free or custom price ends. */
  compedUntil?: Date | string | null
  /** An offline payment awaits bank verification: full access until then (modules/billing, 7 days). */
  provisionalUntil?: Date | string | null
  /** Paid add-ons switched on by Flowbit (lib/addons): 'portal', 'meetings_ai'. */
  addOns?: readonly string[] | null
}

export type OrgLike = {
  subscription?: SubscriptionLike | null
  enabledProducts?: readonly string[] | null
  disabled?: boolean | null
  deletedAt?: Date | string | null
  /** Signup time: the Free window of a workspace that signed up as a trial runs from here. */
  createdAt?: Date | string | null
  /** 'deleted' once the lifecycle job has removed the workspace's data (a tombstone). */
  status?: string | null
}

// ---------------------------------------------------------------------------
// Price table
// ---------------------------------------------------------------------------

export type PlanKey = 'work' | 'muster_starter' | 'muster_business' | 'orbit' | 'folio' | 'suite'

export type PlanPrice = {
  key: PlanKey
  label: string
  unit: 'user' | 'employee' | 'sales user' | 'workspace' | 'person'
  /** Ex-GST, per unit per month, in paise. */
  monthlyPaise: number
  minimum: number
  flat?: boolean
  note: string
}

export const PLAN_PRICES: Record<PlanKey, PlanPrice> = {
  work: { key: 'work', label: 'Work', unit: 'user', monthlyPaise: 5_900, minimum: 5, note: 'Minimum 5 users' },
  muster_starter: { key: 'muster_starter', label: 'Muster Starter', unit: 'employee', monthlyPaise: 3_900, minimum: 10, note: 'People, attendance, leave, claims, letters. No payroll.' },
  muster_business: { key: 'muster_business', label: 'Muster Business', unit: 'employee', monthlyPaise: 7_900, minimum: 10, note: 'Everything in Starter plus payroll with PF, ESI and PT.' },
  orbit: { key: 'orbit', label: 'Orbit', unit: 'sales user', monthlyPaise: 14_900, minimum: 2, note: 'Minimum 2 sales users' },
  folio: { key: 'folio', label: 'Folio', unit: 'workspace', monthlyPaise: 39_900, minimum: 1, flat: true, note: `Flat per workspace: ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users included` },
  suite: { key: 'suite', label: 'Suite (all four)', unit: 'person', monthlyPaise: 14_900, minimum: 10, note: 'Work, Muster Business, Orbit and Folio for everyone' },
}

export type PlanSelection = {
  suite: boolean
  work: boolean
  muster: MusterTier | null
  orbit: boolean
  folio: boolean
  /** People on the plan (users for Work, employees for Muster, people for Suite). */
  seats: number
  /** Sales users for Orbit; defaults to `seats`. */
  orbitSeats?: number
  /** Folio firms (billing entities) wanted, with Folio or Suite; defaults to the included 2. */
  folioFirms?: number
  cycle: BillingCycle
}

/** Price lines: a plan, or the per-firm Folio add-on. */
export type QuoteLineKey = PlanKey | 'folio_firm'
export type QuoteLine = { key: QuoteLineKey; label: string; unit: string; quantity: number; unitPaise: number; amountPaise: number }

export type Quote = {
  lines: QuoteLine[]
  /** The lines added up: the list price for the period (what a yearly renewal pays). */
  listSubtotalPaise: number
  /** First-year discount on a yearly quote (0 when none). */
  discountPaise: number
  discountPercent: number
  /** What is charged: the list subtotal less the discount. GST is on this. */
  subtotalPaise: number
  gstPaise: number
  totalPaise: number
  cycle: BillingCycle
  /** Subtotal expressed per month (yearly / 12), for "₹x/mo" labels. */
  perMonthPaise: number
}

const cycleMultiplier = (cycle: BillingCycle) => (cycle === 'yearly' ? YEARLY_MONTHS : 1)

/** Price overrides per plan key (paise per unit per month), from Console settings (lib/plan-config). */
export type PriceOverrides = Readonly<Partial<Record<PlanKey, number>>>

/** The monthly price of a plan key: the Console override when given, else PLAN_PRICES. */
export const monthlyPriceOf = (key: PlanKey, prices?: PriceOverrides): number => prices?.[key] ?? PLAN_PRICES[key].monthlyPaise

function line(key: PlanKey, requested: number, cycle: BillingCycle, prices?: PriceOverrides): QuoteLine {
  const price = PLAN_PRICES[key]
  const quantity = price.flat ? 1 : Math.max(Math.ceil(requested), price.minimum)
  const unitPaise = monthlyPriceOf(key, prices) * cycleMultiplier(cycle)
  return { key, label: price.label, unit: price.unit, quantity, unitPaise, amountPaise: unitPaise * quantity }
}

export const gstOn = (paise: number) => Math.round((paise * GST_PERCENT) / 100)

/** Firms beyond the included ones for a wanted total (never negative). */
export const extraFolioFirms = (firms: number | null | undefined) => Math.max(0, Math.ceil(firms ?? FOLIO_INCLUDED_FIRMS) - FOLIO_INCLUDED_FIRMS)

function firmLine(firms: number | undefined, cycle: BillingCycle): QuoteLine | null {
  const quantity = extraFolioFirms(firms)
  if (!quantity) return null
  const unitPaise = FOLIO_EXTRA_FIRM_PAISE * cycleMultiplier(cycle)
  return { key: 'folio_firm', label: 'Extra Folio firms', unit: 'firm', quantity, unitPaise, amountPaise: unitPaise * quantity }
}

/**
 * The price of a selection. Yearly = 10 x monthly, less `discountPercent` on a
 * first yearly plan (lib/first-year-discount). GST 18% on the discounted value.
 */
export function quote(selection: PlanSelection, prices?: PriceOverrides, discountPercent = 0): Quote {
  const seats = Math.max(1, selection.seats)
  const withFolio = selection.suite || selection.folio
  const products: (QuoteLine | null)[] = selection.suite
    ? [line('suite', seats, selection.cycle, prices)]
    : [
        selection.work ? line('work', seats, selection.cycle, prices) : null,
        selection.muster ? line(selection.muster === 'business' ? 'muster_business' : 'muster_starter', seats, selection.cycle, prices) : null,
        selection.orbit ? line('orbit', selection.orbitSeats ?? seats, selection.cycle, prices) : null,
        selection.folio ? line('folio', 1, selection.cycle, prices) : null,
      ]
  const lines = [...products, withFolio ? firmLine(selection.folioFirms, selection.cycle) : null].filter((l): l is QuoteLine => l !== null)

  const listSubtotalPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0)
  const discountPaise = selection.cycle === 'yearly' ? firstYearDiscountPaise(listSubtotalPaise, discountPercent) : 0
  const subtotalPaise = listSubtotalPaise - discountPaise
  const gstPaise = gstOn(subtotalPaise)
  return {
    lines,
    listSubtotalPaise,
    discountPaise,
    discountPercent: discountPaise ? discountPercent : 0,
    subtotalPaise,
    gstPaise,
    totalPaise: subtotalPaise + gstPaise,
    cycle: selection.cycle,
    perMonthPaise: selection.cycle === 'yearly' ? Math.round(subtotalPaise / 12) : subtotalPaise,
  }
}

/** How much Suite saves over buying all four separately for the same team. */
export function suiteSavings(seats: number, cycle: BillingCycle): number {
  const separate = quote({ suite: false, work: true, muster: 'business', orbit: true, folio: true, seats, cycle })
  const suite = quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats, cycle })
  return Math.max(0, separate.subtotalPaise - suite.subtotalPaise)
}

// ---------------------------------------------------------------------------
// Trial, access and entitlement
// ---------------------------------------------------------------------------

const toDate = (value: Date | string | null | undefined) => (value ? new Date(value) : null)

/** The Console's trial, Free seat and Free month settings (lib/plan-config); constants when absent. */
export type NewSubscriptionLimits = Readonly<{ trialDays?: number; freeSeats?: number; freeMonths?: number }>

/** Subscription for a brand-new workspace: 15-day trial of everything. */
export function newTrialSubscription(now = new Date(), limits: NewSubscriptionLimits = {}) {
  return {
    status: 'trialing' as const,
    plan: 'trial' as const,
    products: { work: true, muster: 'business' as const, orbit: true, folio: true },
    seats: 10,
    quantities: { work: 0, muster: 0, orbit: 0 },
    cycle: 'monthly' as const,
    trialEndsAt: new Date(now.getTime() + (limits.trialDays ?? TRIAL_DAYS) * DAY_MS),
    amountPaise: 0,
    cancelAtPeriodEnd: false,
  }
}

/** A brand-new Trial workspace: the trial counts as the workspace's one trial (lib/lifecycle trialStartRefusal). */
export function newSignupTrialSubscription(now = new Date(), limits: NewSubscriptionLimits = {}) {
  return { ...newTrialSubscription(now, limits), accountType: 'trial' as const, trialStartedAt: now, freeEndsAt: freeEndsAt(now, limits.freeMonths) }
}

/**
 * Subscription for a new Free workspace (console spec 2): the trial's shape
 * (every product, no plan bought) with 5 seats, running for 6 months.
 */
export function newFreeSubscription(now = new Date(), limits: NewSubscriptionLimits = {}) {
  const ends = freeEndsAt(now, limits.freeMonths)
  return { ...newTrialSubscription(now, limits), seats: limits.freeSeats ?? FREE_SEAT_LIMIT, trialEndsAt: ends, freeEndsAt: ends, accountType: 'free' as const }
}

/**
 * True while the workspace trial (or the Free window) is running. Derived from
 * the dates: a trial past `trialEndsAt` is over even if the stored status still
 * says 'trialing', so an expired trial never counts as unlimited.
 */
export function isTrial(org: OrgLike, now = new Date()): boolean {
  return effectiveStatus(org.subscription, now).status === 'trialing'
}

/** Internal and Test workspaces: never billed, every product, no seat limits, never read-only. AI and Meetings AI keep the trial's caps (lib/ai-caps, lib/meeting-caps; B30). */
export const isHouseOrg = (org: OrgLike) => isHouseAccount(accountTypeOf(org.subscription))

/** Whole days left in the trial (0 on the last day's end), or null when not trialing. */
export function trialDaysLeft(org: OrgLike, now = new Date()): number | null {
  if (!isTrial(org, now)) return null
  const ends = toDate(org.subscription?.trialEndsAt)
  if (!ends) return null
  return Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS))
}

export type EffectiveStatus = { status: SubscriptionStatus; since?: Date }

const after = (date: Date | null, now: Date) => Boolean(date && now.getTime() >= date.getTime())

/**
 * The status as of `now`, derived from what is stored (platform spec 6.5):
 * a trial past its end is 'expired'; an active plan past its period end with
 * no renewal recorded is 'past_due'; a canceled plan past its period end is
 * 'expired'. `since` is when the derived state began. Never trust the stored
 * status alone: a missed webhook must not grant or remove access.
 */
export function effectiveStatus(sub: SubscriptionLike | null | undefined, now = new Date()): EffectiveStatus {
  if (!sub) return { status: 'expired', since: now }
  const trialEnds = toDate(sub.trialEndsAt)
  const periodEnds = toDate(sub.currentPeriodEnd)
  switch (sub.status) {
    case 'trialing':
      return after(trialEnds, now) ? { status: 'expired', since: trialEnds! } : { status: 'trialing' }
    case 'active':
      return after(periodEnds, now) ? { status: 'past_due', since: periodEnds! } : { status: 'active' }
    case 'past_due':
      return { status: 'past_due', since: toDate(sub.pastDueSince) ?? periodEnds ?? now }
    case 'canceled':
      return periodEnds && !after(periodEnds, now) ? { status: 'canceled' } : { status: 'expired', since: periodEnds ?? now }
    default:
      return { status: 'expired', since: toDate(sub.endedAt) ?? periodEnds ?? trialEnds ?? now }
  }
}

export type AccessState = 'full' | 'read_only' | 'blocked'

/**
 * What still opens while a workspace is blocked (B14): the routes that pass
 * `allowBlocked` (app/app/settings/{subscription,billing,billing/wallet,export,
 * security,profile/notifications}). The one wording for banners, the FAQ, the
 * Terms and the manual.
 */
export const BLOCKED_OPEN_PAGES = 'Settings → Plan & billing and Export, plus each person’s own Security and Notifications settings'

/** When read-only started (or starts) for this subscription, or null while it has full access. */
export function readOnlyFrom(sub: SubscriptionLike | null | undefined, now: Date): Date | null {
  const eff = effectiveStatus(sub, now)
  if (eff.status === 'past_due') {
    const graceEnds = new Date((eff.since ?? now).getTime() + PAST_DUE_GRACE_DAYS * DAY_MS)
    return now.getTime() < graceEnds.getTime() ? null : graceEnds
  }
  if (eff.status === 'expired') return eff.since ?? now
  return null
}

/**
 * Subscription-level access: full while trialing, active, canceled-in-period
 * or past due within the 7-day grace; read-only for 30 days after that; then
 * blocked (only BLOCKED_OPEN_PAGES open).
 */
export function accessLevel(sub: SubscriptionLike | null | undefined, now = new Date()): AccessState {
  const provisional = toDate(sub?.provisionalUntil)
  if (provisional && provisional.getTime() > now.getTime()) return 'full'
  const from = readOnlyFrom(sub, now)
  if (!from) return 'full'
  return (now.getTime() - from.getTime()) / DAY_MS < READ_ONLY_DAYS ? 'read_only' : 'blocked'
}

/** Workspace access: `accessLevel` of its subscription; disabled or deleted workspaces are blocked. */
export function accessState(org: OrgLike, now = new Date()): AccessState {
  if (org.disabled || org.deletedAt) return 'blocked'
  if (isHouseOrg(org)) return 'full'
  return accessLevel(org.subscription, now)
}

export const READ_ONLY_MESSAGE = 'Your trial has ended — choose a plan to keep editing'
export const READ_ONLY_SUBSCRIPTION_MESSAGE = 'Your subscription has ended — choose a plan to keep editing'
export const READ_ONLY_FREE_MESSAGE = 'Your free months have ended — choose a plan to keep editing'

/** The refusal for writes while read-only: Free, trial or subscription wording by what ended. */
export function readOnlyMessage(org: OrgLike): string {
  const sub = org.subscription
  if (accountTypeOf(sub) === 'free') return READ_ONLY_FREE_MESSAGE
  return !sub || sub.plan === 'trial' || sub.status === 'trialing' ? READ_ONLY_MESSAGE : READ_ONLY_SUBSCRIPTION_MESSAGE
}

/** Whole days of read-only access left, or null while access is full. */
export function readOnlyDaysLeft(org: OrgLike, now = new Date()): number | null {
  const from = readOnlyFrom(org.subscription, now)
  if (!from) return null
  return Math.max(0, Math.ceil(READ_ONLY_DAYS - (now.getTime() - from.getTime()) / DAY_MS))
}

/**
 * Product trials (a paid plan trying one product it has not bought) are no
 * longer offered (owner decision D2, 11 Oct 2026): the only trial is the
 * 15-day trial, once per business (lib/lifecycle). Trials already started
 * keep running to their end, so these readers stay.
 */

/** The product's trial record, if the workspace ever started one. */
export const productTrialOf = (org: OrgLike, product: ProductKey) => org.subscription?.productTrials?.find((t) => t.product === product) ?? null

/** True while a one-time product trial is running. */
export function inProductTrial(org: OrgLike, product: ProductKey, now = new Date()): boolean {
  const trial = productTrialOf(org, product)
  return Boolean(trial && new Date(trial.endsAt).getTime() > now.getTime())
}

/** Whole days left in a running product trial, or null. */
export function productTrialDaysLeft(org: OrgLike, product: ProductKey, now = new Date()): number | null {
  const trial = productTrialOf(org, product)
  if (!trial || !inProductTrial(org, product, now)) return null
  return Math.max(1, Math.ceil((new Date(trial.endsAt).getTime() - now.getTime()) / DAY_MS))
}

/** The Muster tier the workspace has (trial, Internal and Test = business), or null without Muster. */
export function musterTier(org: OrgLike, now = new Date()): MusterTier | null {
  if (isTrial(org, now) || isHouseOrg(org) || inProductTrial(org, 'muster', now)) return 'business'
  const tier = org.subscription?.products?.muster
  return tier === 'starter' || tier === 'business' ? tier : null
}

/** Sold to the workspace: the trial, Internal, Test and Suite include everything; a running product trial includes that product. */
export function entitled(org: OrgLike, product: ProductKey, now = new Date()): boolean {
  if (isTrial(org, now) || isHouseOrg(org) || org.subscription?.plan === 'suite' || inProductTrial(org, product, now)) return true
  const products = org.subscription?.products
  if (!products) return false
  if (product === 'muster') return musterTier(org, now) !== null
  return Boolean(products[product])
}

/** Switched on by the workspace. An empty list means everything. */
export function enabled(org: OrgLike, product: ProductKey): boolean {
  const list = org.enabledProducts
  return !list || list.length === 0 || list.includes(product)
}

/** Entitled AND enabled: the check every gate uses. */
export const has = (org: OrgLike, product: ProductKey, now = new Date()) => entitled(org, product, now) && enabled(org, product)

/** Product keys the workspace can use right now. */
export const activeProducts = (org: OrgLike, now = new Date()): ProductKey[] => PRODUCT_KEYS.filter((p) => has(org, p, now))

/** Feature-level gate: product available plus tier requirement (payroll needs Muster Business). */
export function hasFeature(org: OrgLike, featureKey: FeatureKey, now = new Date()): boolean {
  const product = featureKey.split('.')[0] as ProductKey
  if (!(PRODUCT_KEYS as readonly string[]).includes(product) || !has(org, product, now)) return false
  const feature = featureByKey(featureKey)
  if (feature?.requires === 'muster_business') return musterTier(org, now) === 'business'
  return true
}

/** Folio firms the plan allows: the included 2 on Free, unlimited in a trial and on Internal/Test, included + paid extras otherwise, 0 without Folio. */
export function folioFirmLimit(org: OrgLike, now = new Date()): number {
  if (accountTypeOf(org.subscription) === 'free') return FOLIO_INCLUDED_FIRMS
  if (isTrial(org, now) || isHouseOrg(org) || inProductTrial(org, 'folio', now)) return Number.POSITIVE_INFINITY
  if (!entitled(org, 'folio', now)) return 0
  return FOLIO_INCLUDED_FIRMS + Math.max(0, org.subscription?.quantities?.folioFirms ?? 0)
}

