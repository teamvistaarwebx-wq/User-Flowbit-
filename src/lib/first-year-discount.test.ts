import { describe, expect, it } from 'vitest'
import { quoteSelection, quoteTaxLines, subscriptionInvoiceTotals } from './billing'
import {
  cleanDiscountPercent,
  firstYearDiscountPaise,
  firstYearDiscountPercent,
  FIRST_YEAR_DISCOUNT_KEY,
  isPaidYearlyInvoice,
  listValueOf,
} from './first-year-discount'
import { planConfigFrom } from './plan-config'
import { quote, YEARLY_MONTHS } from './plans'
import { mergeConsoleSettings } from './console/settings-defaults'
import { invoiceLines } from '@/modules/subscription/selection'

const suite10 = { plan: 'suite' as const, seats: 10 }
const paidYearly = { status: 'paid', kind: 'subscription', cycle: 'yearly', periodStart: '2026-01-01', periodEnd: '2026-12-31' }
const paidMonthly = { status: 'paid', kind: 'subscription', cycle: 'monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31' }

describe('firstYearDiscountPaise (R2 17.1)', () => {
  it('rounds half a paisa up and never exceeds the amount', () => {
    // Arrange / Act / Assert
    expect(firstYearDiscountPaise(1_001, 50)).toBe(501)
    expect(firstYearDiscountPaise(1_000, 33)).toBe(330)
    expect(firstYearDiscountPaise(1_788_000, 50)).toBe(894_000)
  })

  it('gives nothing for 0, a fraction or anything outside 0–90', () => {
    expect(firstYearDiscountPaise(1_000, 0)).toBe(0)
    expect(firstYearDiscountPaise(1_000, 12.5)).toBe(0)
    expect(firstYearDiscountPaise(1_000, 95)).toBe(0)
    expect(cleanDiscountPercent(-5)).toBe(0)
    expect(cleanDiscountPercent(90)).toBe(90)
  })
})

describe('quoteSelection with the first-year discount', () => {
  it('prices yearly at 10 months and takes 50% off as its own amount', () => {
    // Act
    const q = quoteSelection(suite10, 'yearly', { discountPercent: 50 })
    // Assert
    expect(YEARLY_MONTHS).toBe(10)
    expect(q.periodAmountPaise).toBe(1_490_000)
    expect(q).toMatchObject({ discountPercent: 50, discountPaise: 745_000, taxablePaise: 745_000, yearlySavingsPaise: 745_000 })
  })

  it('charges 20 on Suite ₹14,900 in year 1 and ₹29,800 at renewal, ex-GST (owner decision D1)', () => {
    // Arrange
    const twenty = { plan: 'suite' as const, seats: 20 }
    // Act
    const firstYear = quoteSelection(twenty, 'yearly', { discountPercent: 50 })
    const renewal = quoteSelection(twenty, 'yearly', { discountPercent: firstYearDiscountPercent({ cycle: 'yearly', percent: 50, past: [paidYearly] }) })
    // Assert
    expect(firstYear.taxablePaise).toBe(1_490_000)
    expect(renewal.taxablePaise).toBe(2_980_000)
    expect(renewal.discountPaise).toBe(0)
    expect(quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats: 20, cycle: 'yearly' }, undefined, 50).subtotalPaise).toBe(1_490_000)
  })

  it('leaves monthly plans at the list price', () => {
    const q = quoteSelection(suite10, 'monthly', { discountPercent: 50 })
    expect(q).toMatchObject({ periodAmountPaise: 149_000, discountPaise: 0, discountPercent: 0, taxablePaise: 149_000 })
    expect(quoteTaxLines(q)).toHaveLength(1)
  })

  it('charges the list price when the setting is 0 (switched off)', () => {
    const q = quoteSelection(suite10, 'yearly', { discountPercent: 0 })
    expect(q).toMatchObject({ discountPaise: 0, taxablePaise: 1_490_000 })
  })
})

describe('GST on the discounted value', () => {
  it('works out CGST and SGST on the taxable value after the discount', () => {
    // Arrange
    const q = quoteSelection(suite10, 'yearly', { discountPercent: 50 })
    // Act
    const totals = subscriptionInvoiceTotals(quoteTaxLines(q), 'intra_state')
    // Assert: 18% of 7,450 = 1,341; total 8,791, no round-off
    expect(totals).toMatchObject({ taxableValuePaise: 745_000, cgstPaise: 67_050, sgstPaise: 67_050, taxPaise: 134_100, totalPaise: 879_100, roundOffPaise: 0 })
  })

  it('taxes the net once, not each line (no paisa drift from the discount line)', () => {
    // Per line this would be 181 - 90 = 91 paise of IGST; on the net 501 it is 90.
    const totals = subscriptionInvoiceTotals([{ amountPaise: 1_003 }, { amountPaise: -502 }], 'inter_state')
    expect(totals).toMatchObject({ taxableValuePaise: 501, igstPaise: 90, taxPaise: 90 })
  })

  it('keeps per-line GST when there is no discount', () => {
    const totals = subscriptionInvoiceTotals([{ amountPaise: 1_003 }, { amountPaise: 1_003 }], 'inter_state')
    expect(totals.taxPaise).toBe(362)
  })
})

describe('first year or renewal', () => {
  it('discounts a yearly plan when the workspace never paid for a year', () => {
    expect(firstYearDiscountPercent({ cycle: 'yearly', percent: 50, past: [] })).toBe(50)
    expect(firstYearDiscountPercent({ cycle: 'yearly', percent: 50, past: [paidMonthly, paidMonthly] })).toBe(50)
  })

  it('charges a renewal (an earlier paid yearly invoice) the list price', () => {
    expect(firstYearDiscountPercent({ cycle: 'yearly', percent: 50, past: [paidMonthly, paidYearly] })).toBe(0)
  })

  it('never discounts monthly, and ignores cancelled, due and upgrade invoices', () => {
    expect(firstYearDiscountPercent({ cycle: 'monthly', percent: 50, past: [] })).toBe(0)
    const notCounted = [{ ...paidYearly, status: 'cancelled' }, { ...paidYearly, status: 'due' }, { ...paidYearly, kind: 'upgrade' }]
    expect(firstYearDiscountPercent({ cycle: 'yearly', percent: 50, past: notCounted })).toBe(50)
  })

  it('reads older invoices without a cycle by their period or their discount line', () => {
    expect(isPaidYearlyInvoice({ status: 'paid', kind: 'subscription', periodStart: '2025-04-01', periodEnd: '2026-03-31' })).toBe(true)
    expect(isPaidYearlyInvoice({ status: 'paid', kind: 'subscription', periodStart: '2026-03-01', periodEnd: '2026-03-31' })).toBe(false)
    expect(isPaidYearlyInvoice({ status: 'paid', lines: [{ productKey: FIRST_YEAR_DISCOUNT_KEY }] })).toBe(true)
  })

  it('gives 0 when the Console setting is 0', () => {
    expect(firstYearDiscountPercent({ cycle: 'yearly', percent: 0, past: [] })).toBe(0)
  })
})

describe('list value and settings', () => {
  it('adds the plan lines back without the discount line', () => {
    const lines = [{ productKey: 'suite', amountPaise: 1_788_000 }, { productKey: FIRST_YEAR_DISCOUNT_KEY, amountPaise: -894_000 }]
    expect(listValueOf(lines)).toBe(1_788_000)
  })

  it('reads the Console percentage, 50 by default, and rejects values above 90', () => {
    const limits = { freeSeats: 5, freeMonths: 6, trialDays: 15, salesExtensionDays: 15, setupsPerWeek: 5 }
    expect(planConfigFrom({ prices: {}, limits }).yearlyDiscountPercent).toBe(50)
    expect(planConfigFrom({ prices: {}, limits: { ...limits, yearlyDiscountPercent: 0 } }).yearlyDiscountPercent).toBe(0)
    expect(planConfigFrom({ prices: {}, limits: { ...limits, yearlyDiscountPercent: 91 } }).yearlyDiscountPercent).toBe(50)
  })

  it('shows the discount on the marketing quote and taxes the discounted subtotal', () => {
    const q = quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats: 20, cycle: 'yearly' }, undefined, 50)
    expect(q).toMatchObject({ listSubtotalPaise: 2_980_000, discountPaise: 1_490_000, subtotalPaise: 1_490_000, gstPaise: 268_200, perMonthPaise: 124_167 })
  })
})

describe('invoice lines and stored settings', () => {
  it('adds the discount as a separate negative line after the plan lines', () => {
    const q = quoteSelection(suite10, 'yearly', { discountPercent: 50 })
    const lines = invoiceLines(q, { start: '2026-10-11', end: '2027-10-10' })
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({ productKey: FIRST_YEAR_DISCOUNT_KEY, quantity: 1, unitPaise: -745_000, amountPaise: -745_000 })
    expect(lines[1].description).toBe('First-year discount on yearly plans (50% off)')
    expect(subscriptionInvoiceTotals(lines, 'inter_state')).toMatchObject({ taxableValuePaise: 745_000, igstPaise: 134_100 })
  })

  it('has no discount line on a renewal', () => {
    const lines = invoiceLines(quoteSelection(suite10, 'yearly'), { start: '2027-10-11', end: '2028-10-10' })
    expect(lines.map((l) => l.productKey)).toEqual(['suite'])
  })

  it('keeps a stored percentage of 0–90 and replaces anything else with 50', () => {
    const base = mergeConsoleSettings(null).limits
    expect(base.yearlyDiscountPercent).toBe(50)
    expect(mergeConsoleSettings({ limits: { ...base, yearlyDiscountPercent: 0 } }).limits.yearlyDiscountPercent).toBe(0)
    expect(mergeConsoleSettings({ limits: { ...base, yearlyDiscountPercent: 120 } }).limits.yearlyDiscountPercent).toBe(50)
  })
})
