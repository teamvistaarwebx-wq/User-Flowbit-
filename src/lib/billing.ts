import { accountTypeOf, FREE_SEAT_LIMIT, isHouseAccount } from '@/lib/account-types'
import { daysBetween, IST_OFFSET_MINUTES, isoDateIST } from '@/lib/dates'
import {
  effectiveStatus,
  extraFolioFirms,
  FOLIO_EXTRA_FIRM_PAISE,
  FOLIO_INCLUDED_FIRMS,
  FOLIO_INCLUDED_USERS,
  GST_PERCENT,
  monthlyPriceOf,
  PLAN_PRICES,
  YEARLY_MONTHS,
  type BillingCycle,
  type PriceOverrides,
  type SubscriptionLike,
} from '@/lib/plans'
import { firstYearDiscountPaise } from '@/lib/first-year-discount'

export { FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS }

/**
 * Subscription billing math (platform spec 6.3, 6.4, 6.11, 6.12). Pure and
 * client-safe, so the plan picker's live summary and the server agree to the
 * paisa. Money is integer paise.
 */

// ---------------------------------------------------------------------------
// Pricing a selection
// ---------------------------------------------------------------------------

/** `folioFirms` is the total firms wanted with Folio (Suite includes Folio); the first 2 are included. */
export type Selection =
  | { plan: 'suite'; seats: number; folioFirms?: number }
  | { plan: 'custom'; work?: number; muster?: { tier: 'starter' | 'business'; employees: number }; orbit?: number; folio?: boolean; folioFirms?: number }

export type SelectionLineKey = 'suite' | 'work' | 'muster_starter' | 'muster_business' | 'orbit' | 'folio' | 'folio_firm'

export type SelectionLine = {
  key: SelectionLineKey
  label: string
  /** Billed quantity (after the minimum). */
  quantity: number
  /** What was asked for, before the minimum. */
  requested: number
  minimumApplied: boolean
  /** Per unit per period (x12 for yearly). */
  unitPaise: number
  amountPaise: number
}

export type SelectionQuote = {
  lines: SelectionLine[]
  monthlySubtotalPaise: number
  /** The list price for the period: the monthly subtotal, or x12 for yearly. Ex-GST. What a renewal pays. */
  periodAmountPaise: number
  cycle: BillingCycle
  months: 1 | 12
  /** First-year discount on a yearly plan (lib/first-year-discount): the percentage applied, 0 when none. */
  discountPercent: number
  /** The discount in paise (0 when none). */
  discountPaise: number
  /** What this invoice is taxed on: the period amount less the discount. Ex-GST. */
  taxablePaise: number
  /** Yearly with the first-year discount: what it saves against list. 0 otherwise. */
  yearlySavingsPaise: number
  /** Suite price per month for `persons`, present only when it is <= the custom monthly subtotal. */
  suiteComparisonPaise?: number
}

const LABELS: Record<SelectionLineKey, string> = {
  suite: 'Flowbit Suite',
  work: 'Flowbit Work',
  muster_starter: 'Muster Starter',
  muster_business: 'Muster Business',
  orbit: 'Orbit',
  folio: 'Folio',
  folio_firm: 'Extra Folio firms',
}

function firmLine(firms: number | undefined, cycle: BillingCycle): SelectionLine | null {
  const quantity = extraFolioFirms(firms)
  if (!quantity) return null
  const unitPaise = FOLIO_EXTRA_FIRM_PAISE * (cycle === 'yearly' ? YEARLY_MONTHS : 1)
  return { key: 'folio_firm', label: LABELS.folio_firm, quantity, requested: quantity, minimumApplied: false, unitPaise, amountPaise: unitPaise * quantity }
}

function selectionLine(key: Exclude<SelectionLineKey, 'folio_firm'>, requested: number, cycle: BillingCycle, prices?: PriceOverrides): SelectionLine {
  const price = PLAN_PRICES[key]
  const asked = Math.max(0, Math.ceil(requested))
  const quantity = price.flat ? 1 : Math.max(price.minimum, asked)
  const unitPaise = monthlyPriceOf(key, prices) * (cycle === 'yearly' ? YEARLY_MONTHS : 1)
  return { key, label: LABELS[key], quantity, requested: price.flat ? 1 : asked, minimumApplied: !price.flat && quantity > asked, unitPaise, amountPaise: unitPaise * quantity }
}

/** True when a custom selection picks nothing ("Choose at least one product"). */
export const isEmptySelection = (s: Selection) =>
  s.plan === 'custom' && !s.work && !s.muster && !s.orbit && !s.folio

/**
 * The price of a plan selection. `persons` (billable people today) drives the
 * Suite hint on custom selections; `prices` are the Console's prices
 * (lib/plan-config), PLAN_PRICES when absent. `discountPercent` is the
 * first-year discount the caller found applies (lib/first-year-discount); it
 * counts on yearly plans only. GST comes from `subscriptionInvoiceTotals` on
 * `quoteTaxLines`.
 */
export function quoteSelection(selection: Selection, cycle: BillingCycle, opts: { persons?: number; prices?: PriceOverrides; discountPercent?: number } = {}): SelectionQuote {
  const withFolio = selection.plan === 'suite' || Boolean(selection.folio)
  const { prices } = opts
  const products: (SelectionLine | null)[] =
    selection.plan === 'suite'
      ? [selectionLine('suite', selection.seats, cycle, prices)]
      : [
          selection.work ? selectionLine('work', selection.work, cycle, prices) : null,
          selection.muster ? selectionLine(selection.muster.tier === 'business' ? 'muster_business' : 'muster_starter', selection.muster.employees, cycle, prices) : null,
          selection.orbit ? selectionLine('orbit', selection.orbit, cycle, prices) : null,
          selection.folio ? selectionLine('folio', 1, cycle, prices) : null,
        ]
  const lines = [...products, withFolio ? firmLine(selection.folioFirms, cycle) : null].filter((l): l is SelectionLine => l !== null)
  const periodAmountPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0)
  const monthlySubtotalPaise = cycle === 'yearly' ? periodAmountPaise / YEARLY_MONTHS : periodAmountPaise
  const suite = selection.plan === 'custom' && opts.persons != null ? selectionLine('suite', opts.persons, 'monthly', prices).amountPaise : undefined
  const discountPaise = cycle === 'yearly' ? firstYearDiscountPaise(periodAmountPaise, opts.discountPercent ?? 0) : 0
  return {
    lines,
    monthlySubtotalPaise,
    periodAmountPaise,
    cycle,
    months: cycle === 'yearly' ? 12 : 1,
    discountPercent: discountPaise ? (opts.discountPercent ?? 0) : 0,
    discountPaise,
    taxablePaise: periodAmountPaise - discountPaise,
    yearlySavingsPaise: discountPaise,
    ...(suite != null && suite <= monthlySubtotalPaise ? { suiteComparisonPaise: suite } : {}),
  }
}

/** The amounts GST is worked out on: the plan lines, then the discount as a negative line. */
export const quoteTaxLines = (quote: Pick<SelectionQuote, 'lines' | 'discountPaise'>): { amountPaise: number }[] =>
  quote.discountPaise ? [...quote.lines, { amountPaise: -quote.discountPaise }] : quote.lines

// ---------------------------------------------------------------------------
// GST on Flowbit's invoices
// ---------------------------------------------------------------------------

/**
 * How GST applies to one of Flowbit's own bills. 'no_gst': Flowbit has no
 * GSTIN yet (FLOWBIT_GSTIN unset), so no GST is charged and the document is
 * not a tax invoice (owner decision D8, 11 Oct 2026; docs/qa/CA-QUESTIONS.md).
 */
export type SupplyType = 'intra_state' | 'inter_state' | 'no_gst'

/** What the supply type needs to know about the supplier (lib/env FlowbitSupplier fits). */
export type SupplierTaxStatus = Readonly<{ stateCode2: string | null | undefined; gstin: string | null | undefined }>

/** "incl. 18% GST", or "no GST" while Flowbit has no GSTIN: for Razorpay plan names and short labels. */
export const taxWords = (chargeGst: boolean) => (chargeGst ? `incl. ${GST_PERCENT}% GST` : 'no GST')

/** True when the bill carries GST (Flowbit is registered). */
export const chargesGst = (supplyType: SupplyType | string) => supplyType === 'intra_state' || supplyType === 'inter_state'

/**
 * No GST without a supplier GSTIN. Otherwise intra-state only when both states
 * are known and equal; IGST otherwise (the recoverable mistake).
 */
export function supplyTypeFor(supplier: SupplierTaxStatus, customerState: string | null | undefined): SupplyType {
  if (!supplier.gstin?.trim()) return 'no_gst'
  const supplierState = supplier.stateCode2
  return supplierState && customerState && supplierState.toUpperCase() === customerState.toUpperCase() ? 'intra_state' : 'inter_state'
}

export type TaxedLine = { amountPaise: number; taxPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }

export type InvoiceTotals = {
  lines: TaxedLine[]
  taxableValuePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  taxPaise: number
  roundOffPaise: number
  totalPaise: number
}

function taxLine(amountPaise: number, supplyType: SupplyType): TaxedLine {
  if (!chargesGst(supplyType)) return { amountPaise, taxPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }
  const tax = Math.round((amountPaise * GST_PERCENT) / 100)
  if (supplyType === 'inter_state') return { amountPaise, taxPaise: tax, cgstPaise: 0, sgstPaise: 0, igstPaise: tax }
  const half = Math.round(tax / 2)
  const level = Math.min(half, tax - half)
  return { amountPaise, taxPaise: level * 2, cgstPaise: level, sgstPaise: level, igstPaise: 0 }
}

/**
 * 18% GST per line; intra-state halves are levelled to the smaller one so
 * CGST always equals SGST. A discount line (a negative amount, e.g. the
 * first-year discount) lowers the taxable value, and GST is then worked out
 * once on the discounted value. The total is rounded to the rupee once.
 */
export function subscriptionInvoiceTotals(lines: { amountPaise: number }[], supplyType: SupplyType): InvoiceTotals {
  const discounted = lines.some((l) => l.amountPaise < 0)
  const net = lines.reduce((sum, l) => sum + l.amountPaise, 0)
  const taxed = discounted ? [taxLine(Math.max(0, net), supplyType)] : lines.map((l) => taxLine(l.amountPaise, supplyType))
  const sum = (pick: (l: TaxedLine) => number) => taxed.reduce((acc, l) => acc + pick(l), 0)
  const taxableValuePaise = sum((l) => l.amountPaise)
  const taxPaise = sum((l) => l.taxPaise)
  const beforeRounding = taxableValuePaise + taxPaise
  const totalPaise = Math.round(beforeRounding / 100) * 100
  return {
    lines: taxed,
    taxableValuePaise,
    cgstPaise: sum((l) => l.cgstPaise),
    sgstPaise: sum((l) => l.sgstPaise),
    igstPaise: sum((l) => l.igstPaise),
    taxPaise,
    roundOffPaise: totalPaise - beforeRounding,
    totalPaise,
  }
}

// ---------------------------------------------------------------------------
// Periods and proration
// ---------------------------------------------------------------------------

/**
 * Adds 1 month (monthly) or 12 (yearly) on the IST calendar, clamping the day:
 * 31 Jan + 1 month = 28/29 Feb, and 1 Oct 00:00 IST + 1 month = 1 Nov 00:00 IST.
 */
export function addPeriod(start: Date, cycle: BillingCycle): Date {
  const months = cycle === 'yearly' ? 12 : 1
  const offsetMs = IST_OFFSET_MINUTES * 60_000
  const target = new Date(start.getTime() + offsetMs)
  const day = target.getUTCDate()
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return new Date(target.getTime() - offsetMs)
}

export type Proration = { remainingDays: number; totalDays: number; amountPaise: number }

/**
 * One-off charge for an increase mid-period, in IST days:
 * round((new - old) x remaining / total). Ex-GST; <= 0 means not an increase.
 */
export function prorate(input: { oldAmountPaise: number; newAmountPaise: number; periodStart: Date; periodEnd: Date; now?: Date }): Proration {
  const today = isoDateIST(input.now ?? new Date())
  const end = isoDateIST(input.periodEnd)
  const totalDays = Math.max(1, daysBetween(isoDateIST(input.periodStart), end))
  const remainingDays = Math.min(totalDays, Math.max(0, daysBetween(today, end)))
  return { remainingDays, totalDays, amountPaise: Math.round(((input.newAmountPaise - input.oldAmountPaise) * remainingDays) / totalDays) }
}

// ---------------------------------------------------------------------------
// Capacity (seat limits)
// ---------------------------------------------------------------------------

/** Usage counts derived from the collections every time (never a stored counter). */
export type Usage = {
  /** Active members. */
  members: number
  /** Unaccepted, unexpired invites. */
  pendingInvites: number
  /** Muster employees in an on-payroll status. */
  employees: number
  /** Active members and pending invites whose permissions include 'leads.write' or 'deals.write' (Orbit sales users). */
  orbitUsers: number
  /** Active members and pending invites holding any Folio permission (folio.read included). */
  folioUsers: number
  /** Active members plus on-payroll employees without an active member, counted once. */
  persons: number
  /** Active Folio firms (billing entities). Absent = not counted. */
  folioFirms?: number
}

export type CapacityKey = 'logins' | 'persons' | 'seats' | 'employees' | 'orbit' | 'folio' | 'firms'
export type CapacityRow = { key: CapacityKey; label: string; used: number; limit: number | null; ok: boolean }

type CapacitySub = SubscriptionLike & { quantities?: { work?: number | null; muster?: number | null; orbit?: number | null; folioFirms?: number | null } | null }

const firmLimit = (sub: CapacitySub) => FOLIO_INCLUDED_FIRMS + Math.max(0, sub.quantities?.folioFirms ?? 0)

const row = (key: CapacityKey, label: string, used: number, limit: number | null): CapacityRow => ({ key, label, used, limit, ok: limit == null || used <= limit })

/** Rows that hold the workspace's seat count ('People'); the first one found is the seat limit. */
export const SEAT_ROW_KEYS: readonly CapacityKey[] = ['seats', 'persons', 'logins']

/**
 * Free plan seats (console spec 2): the higher of logins (members and pending
 * invites) and on-payroll Muster employees. Employee self-service counts as an
 * employee, not a login, so the two are not added together.
 */
export const billableSeats = (usage: Pick<Usage, 'members' | 'pendingInvites' | 'employees'>) => Math.max(usage.members + usage.pendingInvites, usage.employees)

/**
 * One row per limit the plan imposes. Internal and Test workspaces, and a
 * running trial, have no seat limits: the rows only report usage. Free has one
 * 5-seat limit (during and after its 6 months). An expired trial with no plan
 * bought has no seats: the same rows, limit 0. Free keeps Folio's included firms.
 */
export function capacity(sub: CapacitySub, usage: Usage, now = new Date(), freeSeats: number = FREE_SEAT_LIMIT): CapacityRow[] {
  const logins = usage.members + usage.pendingInvites
  const type = accountTypeOf(sub)
  if (type === 'free') {
    const firms = usage.folioFirms != null ? [row('firms', 'Folio firms', usage.folioFirms, FOLIO_INCLUDED_FIRMS)] : []
    return [row('seats', 'People', billableSeats(usage), freeSeats), ...firms]
  }
  if (isHouseAccount(type) || effectiveStatus(sub, now).status === 'trialing') {
    return [row('logins', 'People', logins, null), row('employees', 'Muster employees', usage.employees, null)]
  }
  if (sub.plan === 'trial') return [row('logins', 'People', logins, 0), row('employees', 'Muster employees', usage.employees, 0)]
  const firms = usage.folioFirms != null ? [row('firms', 'Folio firms', usage.folioFirms, firmLimit(sub))] : []
  if (sub.plan === 'suite') {
    const seats = sub.seats ?? 0
    return [row('persons', 'People', Math.max(usage.persons, logins), seats), ...firms]
  }
  const q = sub.quantities ?? {}
  const p = sub.products ?? {}
  const rows: CapacityRow[] = []
  const loginLimit = p.work ? (q.work ?? 0) : Math.max(q.muster ?? 0, q.orbit ?? 0, p.folio ? FOLIO_INCLUDED_USERS : 0)
  rows.push(row('logins', p.work ? 'Work users' : 'People who sign in', logins, loginLimit))
  if (p.muster) rows.push(row('employees', 'Muster employees', usage.employees, q.muster ?? 0))
  if (p.orbit) rows.push(row('orbit', 'Orbit sales users', usage.orbitUsers, q.orbit ?? 0))
  if (p.folio) rows.push(row('folio', 'Folio users', usage.folioUsers, FOLIO_INCLUDED_USERS), ...firms)
  return rows
}
