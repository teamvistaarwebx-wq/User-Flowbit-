import { describe, expect, it } from 'vitest'
import { PLAN_PRICES } from '@/lib/plans'
import { PLAN_CARDS, estimate, firstPeriodUnitPrice, planIncludes, lowestMonthly, minimumNote, minimumPrice, rupees, unitPrice } from './pricing'

describe('unitPrice and minimumPrice', () => {
  it('reads monthly prices straight from the plan table', () => {
    expect(unitPrice('work', 'monthly')).toBe(PLAN_PRICES.work.monthlyPaise)
    expect(rupees(unitPrice('suite', 'monthly'))).toBe('₹149')
  })

  it('lists a year at 10 months (2 months free) and shows the first year at 50% off', () => {
    expect(rupees(unitPrice('orbit', 'yearly'))).toBe('₹1,490')
    expect(rupees(unitPrice('folio', 'yearly'))).toBe('₹3,990')
    expect(rupees(firstPeriodUnitPrice('suite', 'yearly'))).toBe('₹745')
    expect(firstPeriodUnitPrice('suite', 'monthly')).toBe(PLAN_PRICES.suite.monthlyPaise)
  })

  it('applies the per-plan minimum, and Folio is flat', () => {
    expect(rupees(minimumPrice('work', 'monthly'))).toBe('₹295')
    expect(rupees(minimumPrice('muster_business', 'monthly'))).toBe('₹790')
    expect(rupees(minimumPrice('folio', 'monthly'))).toBe('₹399')
  })
})

describe('minimumNote', () => {
  it('names the unit and the smallest bill', () => {
    expect(minimumNote('suite', 'monthly')).toBe('Minimum 10 people (₹1,490 a month)')
    expect(minimumNote('orbit', 'yearly')).toBe('Minimum 2 sales users (₹1,490 the first year)')
    expect(minimumNote('folio', 'monthly')).toBe('Flat per workspace (₹399 a month)')
  })
})

describe('plan cards', () => {
  it('cover every priced plan exactly once', () => {
    expect(PLAN_CARDS.map((c) => c.key).sort()).toEqual(Object.keys(PLAN_PRICES).sort())
  })

  it('quote "from ₹39" as the lowest per-unit price', () => {
    expect(rupees(lowestMonthly())).toBe('₹39')
  })
})

describe('estimate', () => {
  const base = { teamSize: 20, work: false, muster: null, orbit: false, folio: false, orbitSeats: 2, cycle: 'monthly' as const }

  it('returns only Suite when nothing is picked', () => {
    const result = estimate(base)
    expect(result.picked).toBeNull()
    expect(result.suite.subtotalPaise).toBe(20 * 14_900)
    expect(result.suiteSavesPaise).toBe(0)
  })

  it('shows Suite savings when buying all four separately costs more', () => {
    const result = estimate({ ...base, work: true, muster: 'business', orbit: true, folio: true })
    // 20 × 59 + 20 × 79 + 2 × 149 + 399 = 3,457; Suite 20 × 149 = 2,980
    expect(result.picked?.subtotalPaise).toBe(345_700)
    expect(result.suiteSavesPaise).toBe(47_700)
  })

  it('reports no saving when a single product is cheaper than Suite', () => {
    const result = estimate({ ...base, work: true })
    expect(result.picked?.subtotalPaise).toBe(20 * 5_900)
    expect(result.suiteSavesPaise).toBe(0)
  })

  it('clamps team size to the slider range and Orbit seats to the team', () => {
    const result = estimate({ ...base, teamSize: 400, orbit: true, orbitSeats: 999 })
    expect(result.suite.lines[0].quantity).toBe(150)
    expect(result.picked?.lines[0].quantity).toBe(150)
  })

  it('adds 18% GST on top of the discounted first year', () => {
    const result = estimate({ ...base, cycle: 'yearly' })
    expect(result.suite.discountPaise).toBe(result.suite.listSubtotalPaise / 2)
    expect(result.suite.gstPaise).toBe(Math.round(result.suite.subtotalPaise * 0.18))
  })

  it('shows monthly at the list price', () => {
    expect(estimate({ ...base, cycle: 'monthly' }).suite.discountPaise).toBe(0)
  })
})

describe('planIncludes', () => {
  it('limits each product plan to its own features', () => {
    expect(planIncludes('work', 'work.tasks')).toBe(true)
    expect(planIncludes('work', 'folio.invoices')).toBe(false)
  })

  it('keeps payroll out of Muster Starter but in Business and Suite', () => {
    expect(planIncludes('muster_starter', 'muster.payroll')).toBe(false)
    expect(planIncludes('muster_starter', 'muster.leave')).toBe(true)
    expect(planIncludes('muster_business', 'muster.payroll')).toBe(true)
    expect(planIncludes('suite', 'muster.payroll')).toBe(true)
  })
})
