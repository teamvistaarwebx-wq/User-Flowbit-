import { describe, expect, it } from 'vitest'
import { addPeriod, capacity, chargesGst, prorate, quoteSelection, quoteTaxLines, subscriptionInvoiceTotals, supplyTypeFor, taxWords, type Usage } from './billing'

const totals = (periodAmountPaise: number, supply: 'intra_state' | 'inter_state' = 'intra_state') => subscriptionInvoiceTotals([{ amountPaise: periodAmountPaise }], supply)

describe('quoteSelection (platform spec 6.3 worked examples)', () => {
  it('prices Suite 12 monthly and yearly', () => {
    const monthly = quoteSelection({ plan: 'suite', seats: 12 }, 'monthly')
    expect(monthly.periodAmountPaise).toBe(178_800)
    expect(totals(178_800)).toMatchObject({ taxPaise: 32_184, totalPaise: 211_000, roundOffPaise: 16 })
    const yearly = quoteSelection({ plan: 'suite', seats: 12 }, 'yearly')
    expect(yearly.lines[0]).toMatchObject({ quantity: 12, unitPaise: 149_000 })
    expect(yearly.periodAmountPaise).toBe(1_788_000)
    expect(yearly.months).toBe(12)
    expect(yearly.yearlySavingsPaise).toBe(0)
    expect(totals(2_145_600)).toMatchObject({ taxPaise: 386_208, totalPaise: 2_531_800, roundOffPaise: -8 })
  })

  it('applies and flags minimums', () => {
    const suite8 = quoteSelection({ plan: 'suite', seats: 8 }, 'monthly')
    expect(suite8.lines[0]).toMatchObject({ quantity: 10, requested: 8, minimumApplied: true })
    expect(totals(suite8.periodAmountPaise)).toMatchObject({ totalPaise: 175_800, roundOffPaise: -20 })
    const work3 = quoteSelection({ plan: 'custom', work: 3 }, 'monthly')
    expect(work3.periodAmountPaise).toBe(29_500)
    expect(totals(29_500).totalPaise).toBe(34_800)
    const starter = quoteSelection({ plan: 'custom', muster: { tier: 'starter', employees: 10 } }, 'monthly')
    expect(starter.lines[0]).toMatchObject({ key: 'muster_starter', minimumApplied: false })
    expect(totals(starter.periodAmountPaise).totalPaise).toBe(46_000)
  })

  it('shows the Suite hint only when Suite is cheaper or equal', () => {
    const big = quoteSelection({ plan: 'custom', work: 12, muster: { tier: 'business', employees: 12 }, orbit: 2, folio: true }, 'monthly', { persons: 12 })
    expect(big.periodAmountPaise).toBe(235_300)
    expect(totals(big.periodAmountPaise)).toMatchObject({ totalPaise: 277_700, roundOffPaise: 46 })
    expect(big.suiteComparisonPaise).toBe(178_800)
    const small = quoteSelection({ plan: 'custom', work: 7, muster: { tier: 'business', employees: 12 }, folio: true }, 'monthly', { persons: 12 })
    expect(small.periodAmountPaise).toBe(176_000)
    expect(totals(small.periodAmountPaise).totalPaise).toBe(207_700)
    expect(small.suiteComparisonPaise).toBeUndefined()
  })
})

describe('subscriptionInvoiceTotals', () => {
  it('levels CGST and SGST and uses IGST across states', () => {
    expect(totals(28_839)).toMatchObject({ cgstPaise: 2_595, sgstPaise: 2_595, taxPaise: 5_190, totalPaise: 34_000, roundOffPaise: -29 })
    expect(totals(28_839, 'inter_state')).toMatchObject({ igstPaise: 5_191, totalPaise: 34_000, roundOffPaise: -30 })
  })

  it('falls back to inter-state when a state is unknown', () => {
    const gstin = '23ABCDE1234F1Z5'
    expect(supplyTypeFor({ stateCode2: 'MP', gstin }, 'mp')).toBe('intra_state')
    expect(supplyTypeFor({ stateCode2: 'MP', gstin }, 'MH')).toBe('inter_state')
    expect(supplyTypeFor({ stateCode2: null, gstin }, 'MP')).toBe('inter_state')
  })
})

describe('no GST while Flowbit has no GSTIN (owner decision D8)', () => {
  it('is no_gst without a supplier GSTIN, whatever the states', () => {
    expect(supplyTypeFor({ stateCode2: 'MP', gstin: null }, 'MP')).toBe('no_gst')
    expect(supplyTypeFor({ stateCode2: 'MP', gstin: '  ' }, 'MH')).toBe('no_gst')
    expect(chargesGst('no_gst')).toBe(false)
    expect(chargesGst('intra_state')).toBe(true)
    expect(taxWords(false)).toBe('no GST')
    expect(taxWords(true)).toBe('incl. 18% GST')
  })

  it('charges no GST line and totals the plan value, rounded to the rupee', () => {
    // Arrange: Suite 10 monthly, ₹1,490
    const q = quoteSelection({ plan: 'suite', seats: 10 }, 'monthly')
    // Act
    const t = subscriptionInvoiceTotals(q.lines, 'no_gst')
    // Assert
    expect(t).toMatchObject({ taxableValuePaise: 149_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0, totalPaise: 149_000, roundOffPaise: 0 })
  })

  it('keeps the first-year discount and still adds no GST', () => {
    const q = quoteSelection({ plan: 'suite', seats: 20 }, 'yearly', { discountPercent: 50 })
    const t = subscriptionInvoiceTotals(quoteTaxLines(q), 'no_gst')
    expect(t).toMatchObject({ taxableValuePaise: 1_490_000, taxPaise: 0, totalPaise: 1_490_000 })
  })
})

describe('periods and proration', () => {
  it('clamps month ends', () => {
    expect(addPeriod(new Date('2026-01-31T00:00:00Z'), 'monthly').toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(addPeriod(new Date('2026-10-01T00:00:00Z'), 'yearly').toISOString().slice(0, 10)).toBe('2027-10-01')
    // IST midnight on the 1st (18:30 UTC the day before) ends at IST midnight on the next 1st.
    expect(addPeriod(new Date('2026-09-30T18:30:00Z'), 'monthly').toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(addPeriod(new Date('2026-01-30T20:00:00Z'), 'monthly').toISOString()).toBe('2026-02-27T20:00:00.000Z')
  })

  it('prorates Suite 10 -> 14 on 17 Oct for the rest of October', () => {
    const p = prorate({
      oldAmountPaise: 149_000,
      newAmountPaise: 208_600,
      periodStart: new Date('2026-09-30T18:30:00Z'),
      periodEnd: new Date('2026-10-31T18:30:00Z'),
      now: new Date('2026-10-17T06:00:00Z'),
    })
    expect(p).toEqual({ remainingDays: 15, totalDays: 31, amountPaise: 28_839 })
  })
})

describe('capacity', () => {
  const usage: Usage = { members: 12, pendingInvites: 2, employees: 20, orbitUsers: 3, folioUsers: 4, persons: 15 }
  const NOW = new Date('2026-10-10T00:00:00Z')

  it('has no limits during the trial', () => {
    const rows = capacity({ status: 'trialing', plan: 'trial', trialEndsAt: new Date('2026-10-16T00:00:00Z') }, usage, NOW)
    expect(rows.every((r) => r.limit === null && r.ok)).toBe(true)
  })

  it('gives Free one 5-seat row (max of logins and employees) and the 2 included Folio firms', () => {
    const sub = { status: 'trialing', plan: 'trial', accountType: 'free', trialEndsAt: new Date('2027-04-01T00:00:00Z') }
    expect(capacity(sub, { ...usage, members: 3, pendingInvites: 1, employees: 2, folioFirms: 1 }, NOW)).toEqual([
      { key: 'seats', label: 'People', used: 4, limit: 5, ok: true },
      { key: 'firms', label: 'Folio firms', used: 1, limit: 2, ok: true },
    ])
    expect(capacity(sub, { ...usage, members: 1, pendingInvites: 0, employees: 6 }, NOW)[0]).toMatchObject({ used: 6, ok: false })
  })

  it('gives an expired trial no seats instead of unlimited ones', () => {
    const rows = capacity({ status: 'trialing', plan: 'trial', trialEndsAt: new Date('2026-10-01T00:00:00Z') }, usage, NOW)
    expect(rows.map((r) => [r.key, r.limit, r.ok])).toEqual([
      ['logins', 0, false],
      ['employees', 0, false],
    ])
  })

  it('has no limits on Internal and Test workspaces', () => {
    const rows = capacity({ status: 'expired', plan: 'trial', accountType: 'test' }, usage, NOW)
    expect(rows.every((r) => r.limit === null)).toBe(true)
  })

  it('limits Suite people by seats', () => {
    expect(capacity({ status: 'active', plan: 'suite', seats: 14 }, usage, NOW)).toEqual([{ key: 'persons', label: 'People', used: 15, limit: 14, ok: false }])
  })

  it('checks each custom product', () => {
    const rows = capacity({ status: 'active', plan: 'custom', products: { work: true, muster: 'business', orbit: true, folio: true }, quantities: { work: 15, muster: 20, orbit: 2 } }, usage, NOW)
    expect(rows.map((r) => [r.key, r.limit, r.ok])).toEqual([
      ['logins', 15, true],
      ['employees', 20, true],
      ['orbit', 2, false],
      ['folio', 3, false],
    ])
  })

  it('limits Folio firms to the included 2 plus paid extras', () => {
    const sub = { status: 'active', plan: 'custom', products: { work: true, muster: null, orbit: false, folio: true }, quantities: { work: 15, folioFirms: 1 } }
    expect(capacity(sub, { ...usage, folioFirms: 4 }, NOW).find((r) => r.key === 'firms')).toEqual({ key: 'firms', label: 'Folio firms', used: 4, limit: 3, ok: false })
    expect(capacity({ status: 'active', plan: 'suite', seats: 20 }, { ...usage, folioFirms: 2 }, NOW).find((r) => r.key === 'firms')).toMatchObject({ limit: 2, ok: true })
  })
})

describe('quoteSelection firms', () => {
  it('adds ₹199 per extra firm per month, x10 yearly, on Folio or Suite only', () => {
    expect(quoteSelection({ plan: 'custom', folio: true, folioFirms: 2 }, 'monthly').lines.map((l) => l.key)).toEqual(['folio'])
    const monthly = quoteSelection({ plan: 'custom', folio: true, folioFirms: 5 }, 'monthly')
    expect(monthly.lines[1]).toMatchObject({ key: 'folio_firm', quantity: 3, unitPaise: 19_900, amountPaise: 59_700 })
    expect(monthly.periodAmountPaise).toBe(39_900 + 59_700)
    expect(quoteSelection({ plan: 'suite', seats: 10, folioFirms: 3 }, 'yearly').lines[1]).toMatchObject({ key: 'folio_firm', quantity: 1, amountPaise: 199_000 })
    expect(quoteSelection({ plan: 'custom', work: 5, folioFirms: 9 }, 'monthly').lines.map((l) => l.key)).toEqual(['work'])
  })
})
