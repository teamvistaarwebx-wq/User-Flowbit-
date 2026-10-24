import { z } from 'zod'
import { FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, type Selection, type SelectionQuote, type Usage } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { discountLineDescription, FIRST_YEAR_DISCOUNT_KEY } from '@/lib/first-year-discount'
import { formatINR } from '@/lib/money'
import { extraFolioFirms, FOLIO_MAX_FIRMS, PLAN_PRICES, type BillingCycle } from '@/lib/plans'
import type { ProductKey } from '@/lib/catalog'

/**
 * Plan selections: validation, labels, and the mapping between a picker
 * selection and the stored Org.subscription fields. Pure and client-safe.
 */

export const MAX_QUANTITY = 10_000

const quantity = (min: number, unit: string) =>
  z.coerce
    .number({ error: `Enter a number of ${unit}` })
    .int('Use a whole number')
    .min(min, `The minimum is ${min} ${unit}`)
    .max(MAX_QUANTITY, `The maximum is ${MAX_QUANTITY.toLocaleString('en-IN')}`)

/** Clamps a stepper quantity into [min, max]; blanks and non-numbers fall back to the minimum. */
export function clampQuantity(value: number, min: number, max: number = MAX_QUANTITY): number {
  return Math.max(min, Math.min(max, Math.round(value) || min))
}

/**
 * Reads what was typed into a quantity field. The draft keeps digits only, so
 * the field can pass through values below the minimum (typing 15 shows 1
 * first). `value` is set only once the draft is a usable quantity; the
 * minimum is applied on blur with clampQuantity.
 */
export function readTypedQuantity(raw: string, min: number, max: number = MAX_QUANTITY): { draft: string; value: number | null } {
  const draft = raw.replace(/\D/g, '').slice(0, String(max).length)
  if (!draft) return { draft, value: null }
  const n = Number(draft)
  return { draft, value: n >= min && n <= max ? n : null }
}

/** Total Folio firms wanted (the first 2 are included). */
const folioFirms = z.coerce
  .number({ error: 'Enter a number of firms' })
  .int('Use a whole number')
  .min(FOLIO_INCLUDED_FIRMS, `Folio includes ${FOLIO_INCLUDED_FIRMS} firms; choose at least ${FOLIO_INCLUDED_FIRMS}`)
  .max(FOLIO_MAX_FIRMS, `The maximum is ${FOLIO_MAX_FIRMS} firms`)
  .optional()

export const selectionSchema = z.discriminatedUnion('plan', [
  z.object({ plan: z.literal('suite'), seats: quantity(PLAN_PRICES.suite.minimum, 'people'), folioFirms }),
  z.object({
    plan: z.literal('custom'),
    work: quantity(PLAN_PRICES.work.minimum, 'users').optional(),
    muster: z.object({ tier: z.enum(['starter', 'business']), employees: quantity(PLAN_PRICES.muster_starter.minimum, 'employees') }).optional(),
    orbit: quantity(PLAN_PRICES.orbit.minimum, 'sales users').optional(),
    folio: z.boolean().optional(),
    folioFirms,
  }),
])

export const cycleSchema = z.enum(['monthly', 'yearly'])
export const planChoiceSchema = z.object({ selection: selectionSchema, cycle: cycleSchema })
export type PlanChoice = z.infer<typeof planChoiceSchema>

export type StoredProducts = { work: boolean; muster: 'starter' | 'business' | null; orbit: boolean; folio: boolean }
/** `folioFirms` is the number of extra firms paid for (beyond the included 2). */
export type StoredQuantities = { work: number; muster: number; orbit: number; folioFirms: number }
export type SubscriptionShape = { plan: 'suite' | 'custom'; products: StoredProducts; quantities: StoredQuantities; seats: number }

/** The Org.subscription fields a selection stands for. */
export function shapeOf(selection: Selection): SubscriptionShape {
  if (selection.plan === 'suite') {
    return {
      plan: 'suite',
      products: { work: true, muster: 'business', orbit: true, folio: true },
      quantities: { work: 0, muster: 0, orbit: 0, folioFirms: extraFolioFirms(selection.folioFirms) },
      seats: selection.seats,
    }
  }
  return {
    plan: 'custom',
    products: { work: Boolean(selection.work), muster: selection.muster?.tier ?? null, orbit: Boolean(selection.orbit), folio: Boolean(selection.folio) },
    quantities: { work: selection.work ?? 0, muster: selection.muster?.employees ?? 0, orbit: selection.orbit ?? 0, folioFirms: selection.folio ? extraFolioFirms(selection.folioFirms) : 0 },
    seats: selection.work ?? 0,
  }
}

export type StoredSub = {
  plan?: string | null
  seats?: number | null
  products?: { work?: boolean | null; muster?: string | null; orbit?: boolean | null; folio?: boolean | null } | null
  quantities?: { work?: number | null; muster?: number | null; orbit?: number | null; folioFirms?: number | null } | null
}

/** Total firms for stored extras, or nothing when only the included ones are paid for. */
const firmsOf = (extra: number | null | undefined) => (extra && extra > 0 ? { folioFirms: FOLIO_INCLUDED_FIRMS + extra } : {})

/** The selection a stored paid plan stands for, or null for a trial. */
export function selectionOf(sub: StoredSub | null | undefined): Selection | null {
  if (!sub || sub.plan === 'trial') return null
  if (sub.plan === 'suite') return { plan: 'suite', seats: sub.seats ?? PLAN_PRICES.suite.minimum, ...firmsOf(sub.quantities?.folioFirms) }
  const p = sub.products ?? {}
  const q = sub.quantities ?? {}
  const tier = p.muster === 'starter' || p.muster === 'business' ? p.muster : null
  return {
    plan: 'custom',
    ...(p.work ? { work: q.work || PLAN_PRICES.work.minimum } : {}),
    ...(tier ? { muster: { tier, employees: q.muster || PLAN_PRICES.muster_starter.minimum } } : {}),
    ...(p.orbit ? { orbit: q.orbit || PLAN_PRICES.orbit.minimum } : {}),
    ...(p.folio ? { folio: true, ...firmsOf(q.folioFirms) } : {}),
  }
}

const firmsLabel = (firms: number | undefined) => (extraFolioFirms(firms) ? ` (${firms} firms)` : '')

/** "Suite, 12 people" or "Work 7 · Muster Business 12 · Folio". */
export function selectionLabel(selection: Selection): string {
  if (selection.plan === 'suite') return `Suite, ${selection.seats} people${firmsLabel(selection.folioFirms)}`
  const parts = [
    selection.work ? `Work ${selection.work}` : null,
    selection.muster ? `Muster ${selection.muster.tier === 'business' ? 'Business' : 'Starter'} ${selection.muster.employees}` : null,
    selection.orbit ? `Orbit ${selection.orbit}` : null,
    selection.folio ? `Folio${firmsLabel(selection.folioFirms)}` : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'No products'
}

export const sameSelection = (a: Selection | null, b: Selection | null) => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b))

const normalise = (s: Selection | null) => (s ? shapeOf(s) : null)

/** Products a new shape adds compared with the old one (they get switched on). */
export function addedProducts(before: StoredProducts | null, after: StoredProducts): ProductKey[] {
  const had = (p: ProductKey) => Boolean(before && (p === 'muster' ? before.muster : before[p]))
  return (['work', 'muster', 'orbit', 'folio'] as const).filter((p) => (p === 'muster' ? Boolean(after.muster) : after[p]) && !had(p))
}

/**
 * Field errors for quantities below what the workspace uses today
 * (platform spec 6.7.2). Keys match the picker's field paths.
 */
export function usageProblems(selection: Selection, usage: Usage): Record<string, string> {
  const logins = usage.members + usage.pendingInvites
  const problems: Record<string, string> = {}
  const firmsWanted = Math.max(FOLIO_INCLUDED_FIRMS, selection.folioFirms ?? FOLIO_INCLUDED_FIRMS)
  const firmProblem = usage.folioFirms != null && usage.folioFirms > firmsWanted ? `You have ${usage.folioFirms} active firms in Folio. Choose at least ${usage.folioFirms}, or deactivate some first.` : null
  if (selection.plan === 'suite') {
    const people = Math.max(usage.persons, logins)
    if (selection.seats < people) problems['selection.seats'] = `You have ${people} people. Disable some first, or choose at least ${people}.`
    if (firmProblem) problems['selection.folioFirms'] = firmProblem
    return problems
  }
  if (!selection.work && !selection.muster && !selection.orbit && !selection.folio) return { selection: 'Choose at least one product.' }
  if (selection.work && selection.work < logins) problems['selection.work'] = `You have ${logins} people who sign in. Disable some first, or choose at least ${logins}.`
  if (!selection.work) {
    const limit = Math.max(selection.muster?.employees ?? 0, selection.orbit ?? 0, selection.folio ? FOLIO_INCLUDED_USERS : 0)
    if (logins > limit) problems.selection = `${logins} people sign in to this workspace. Add Work for ${logins} users, or raise the other quantities.`
  }
  if (selection.muster && selection.muster.employees < usage.employees) problems['selection.muster.employees'] = `You have ${usage.employees} employees on payroll. Choose at least ${usage.employees}.`
  if (selection.orbit && selection.orbit < usage.orbitUsers) problems['selection.orbit'] = `${usage.orbitUsers} people can work leads and deals. Choose at least ${usage.orbitUsers}.`
  if (selection.folio && usage.folioUsers > FOLIO_INCLUDED_USERS) problems['selection.folio'] = `Folio includes ${FOLIO_INCLUDED_USERS} users and ${usage.folioUsers} people use it. Move to Suite for more.`
  if (selection.folio && firmProblem) problems['selection.folioFirms'] = firmProblem
  return problems
}

/** Defaults for the picker from today's usage. */
export function defaultSelections(usage: Usage) {
  const logins = usage.members + usage.pendingInvites
  return {
    suiteSeats: Math.max(PLAN_PRICES.suite.minimum, usage.persons, logins),
    work: Math.max(PLAN_PRICES.work.minimum, logins),
    employees: Math.max(PLAN_PRICES.muster_starter.minimum, usage.employees),
    orbit: Math.max(PLAN_PRICES.orbit.minimum, usage.orbitUsers),
    folioFirms: Math.max(FOLIO_INCLUDED_FIRMS, usage.folioFirms ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Invoice lines
// ---------------------------------------------------------------------------

export type InvoiceLine = { description: string; productKey: string; quantity: number; unitPaise: number; amountPaise: number }

const UNIT: Record<string, [string, string]> = {
  suite: ['person', 'people'],
  work: ['user', 'users'],
  muster_starter: ['employee', 'employees'],
  muster_business: ['employee', 'employees'],
  orbit: ['sales user', 'sales users'],
  folio_firm: ['firm', 'firms'],
}

/** The first-year discount as its own line, with a negative amount (taxable value = list less discount). */
function discountLine(quote: SelectionQuote): InvoiceLine[] {
  if (!quote.discountPaise) return []
  return [{ description: discountLineDescription(quote.discountPercent), productKey: FIRST_YEAR_DISCOUNT_KEY, quantity: 1, unitPaise: -quote.discountPaise, amountPaise: -quote.discountPaise }]
}

/**
 * Invoice line descriptions (platform spec 6.12.5), e.g.
 * "Flowbit Suite — 12 people × ₹149.00 per month · 1 Oct 2026 to 31 Oct 2026",
 * then the first-year discount line when the quote has one.
 */
export function invoiceLines(quote: SelectionQuote, period: { start: string; end: string }): InvoiceLine[] {
  const per = quote.cycle === 'yearly' ? 'per year' : 'per month'
  const range = `${formatDate(period.start)} to ${formatDate(period.end)}`
  const planLines = quote.lines.map((l): InvoiceLine => {
    if (l.key === 'folio') return { description: `Folio — workspace, includes ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users · ${range}`, productKey: l.key, quantity: 1, unitPaise: l.unitPaise, amountPaise: l.amountPaise }
    const [one, many] = UNIT[l.key] ?? ['unit', 'units']
    const minimum = l.minimumApplied ? ` (billed for the ${l.quantity}-${one} minimum, ${l.requested} in use)` : ''
    return {
      description: `${l.label} — ${l.quantity} ${l.quantity === 1 ? one : many} × ${formatINR(l.unitPaise, { decimals: 2 })} ${per} · ${range}${minimum}`,
      productKey: l.key,
      quantity: l.quantity,
      unitPaise: l.unitPaise,
      amountPaise: l.amountPaise,
    }
  })
  return [...planLines, ...discountLine(quote)]
}

const NBSP = '\u00A0'

/**
 * An invoice line description as the PDF can print it: the PDF font has no ₹
 * or → glyph (stored descriptions use both), so ₹ becomes "Rs." like the
 * amount columns and → becomes "to". Dates ("1 Oct 2026") are kept on one line.
 */
export function printableLine(description: string): string {
  return description
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/\s*→\s*/g, ' to ')
    .replace(/\b(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})\b/g, `$1${NBSP}$2${NBSP}$3`)
}

export const cycleLabel = (cycle: BillingCycle | string) => (cycle === 'yearly' ? 'Yearly' : 'Monthly')
