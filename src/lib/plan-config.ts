import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { PLAN_PRICES, TRIAL_DAYS, type PlanKey } from '@/lib/plans'
import { DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT, MAX_FIRST_YEAR_DISCOUNT_PERCENT } from '@/lib/first-year-discount'

/**
 * The prices and limits staff edit in Console → Settings (console spec 7.2),
 * as the product reads them. Pure and client-safe: server code loads the
 * stored settings once per request (modules/console/plan-config) and passes
 * this object to the pure plan functions; anything that gets no config uses
 * DEFAULT_PLAN_CONFIG, the lib/plans and lib/account-types constants.
 *
 * Prices apply to quotes, checkouts and new bills only. An issued invoice or
 * a due bill keeps the amounts it was created with.
 */

export type PlanPrices = Readonly<Record<PlanKey, number>>

export type PlanConfig = Readonly<{
  /** Ex-GST, per unit per month, in paise. */
  prices: PlanPrices
  freeSeats: number
  freeMonths: number
  trialDays: number
  salesExtensionDays: number
  /** Free setups by the Flowbit team per week (yearly customers only, console spec 9). */
  setupsPerWeek: number
  /** Percent off a workspace's first yearly invoice (console spec 2; lib/first-year-discount). 0 switches it off. */
  yearlyDiscountPercent: number
}>

/** Upper bounds that catch a typo in the Console (a price of ₹1 crore, 10,000 trial days). */
const MAX_PRICE_PAISE = 10_000_000
const MAX_DAYS = 366
const MAX_MONTHS = 36
const MAX_SEATS = 1_000

/** A whole number in [min, max], else the fallback. */
const within = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback

const DEFAULT_PRICES: PlanPrices = Object.fromEntries(Object.values(PLAN_PRICES).map((p) => [p.key, p.monthlyPaise])) as Record<PlanKey, number>

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  prices: DEFAULT_PRICES,
  freeSeats: FREE_SEAT_LIMIT,
  freeMonths: FREE_MONTHS,
  trialDays: TRIAL_DAYS,
  salesExtensionDays: 15,
  setupsPerWeek: 5,
  yearlyDiscountPercent: DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT,
}

/**
 * The unit prices locked on a subscription, bill or pending change
 * (`unitPrices`), read back from Mixed storage: only known plan keys with a
 * whole, non-negative paise value. Missing means the subscription was bought
 * before prices became editable, at the lib/plans prices.
 */
export function lockedPrices(stored: unknown): PlanPrices {
  const value = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return Object.fromEntries((Object.keys(DEFAULT_PRICES) as PlanKey[]).map((key) => [key, within(value[key], 0, MAX_PRICE_PAISE, DEFAULT_PRICES[key])])) as Record<PlanKey, number>
}

/** The stored Console settings this reads (lib/console/settings-defaults ConsoleSettingsValues). */
export type PlanSettingsSource = Readonly<{
  /** Rupees ex-GST per unit per month, by plan key. */
  prices: Readonly<Record<string, number>>
  limits: Readonly<{ freeSeats: number; freeMonths: number; trialDays: number; salesExtensionDays: number; setupsPerWeek: number; yearlyDiscountPercent?: number }>
}>

/**
 * The plan config from the Console settings, each value checked, with the
 * default for anything missing or out of range. A Free plan needs at least
 * one seat and one month, and a trial at least one day, or nobody could sign up.
 */
export function planConfigFrom(settings: PlanSettingsSource | null | undefined): PlanConfig {
  if (!settings) return DEFAULT_PLAN_CONFIG
  const base = DEFAULT_PLAN_CONFIG
  const prices = Object.fromEntries(
    (Object.keys(base.prices) as PlanKey[]).map((key) => {
      const rupees = settings.prices?.[key]
      const paise = typeof rupees === 'number' && Number.isFinite(rupees) ? Math.round(rupees * 100) : NaN
      return [key, within(paise, 0, MAX_PRICE_PAISE, base.prices[key])]
    }),
  ) as Record<PlanKey, number>
  const l = settings.limits ?? ({} as PlanSettingsSource['limits'])
  return {
    prices,
    freeSeats: within(l.freeSeats, 1, MAX_SEATS, base.freeSeats),
    freeMonths: within(l.freeMonths, 1, MAX_MONTHS, base.freeMonths),
    trialDays: within(l.trialDays, 1, MAX_DAYS, base.trialDays),
    salesExtensionDays: within(l.salesExtensionDays, 1, MAX_DAYS, base.salesExtensionDays),
    setupsPerWeek: within(l.setupsPerWeek, 0, 1_000, base.setupsPerWeek),
    yearlyDiscountPercent: within(l.yearlyDiscountPercent, 0, MAX_FIRST_YEAR_DISCOUNT_PERCENT, base.yearlyDiscountPercent),
  }
}
