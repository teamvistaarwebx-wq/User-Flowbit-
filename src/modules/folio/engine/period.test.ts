import { describe, expect, it } from 'vitest'
import { pickFirm } from './firm'
import { monthsIn, previousPeriod, rangeLabel, resolveBoundedPeriod, resolvePeriod, throughThisMonth } from './period'

const TODAY = '2026-10-02'

describe('rangeLabel', () => {
  it('collapses a range inside one month', () => {
    expect(rangeLabel('2026-10-01', '2026-10-31')).toBe('1–31 Oct 2026')
  })
  it('keeps one year when both ends share it', () => {
    expect(rangeLabel('2026-09-01', '2026-10-02')).toBe('1 Sep – 2 Oct 2026')
  })
  it('spells both years across a year end', () => {
    expect(rangeLabel('2026-04-01', '2027-03-31')).toBe('1 Apr 2026 – 31 Mar 2027')
  })
  it('reads a single day as a date', () => {
    expect(rangeLabel('2026-10-02', '2026-10-02')).toBe('2 Oct 2026')
  })
})

describe('resolvePeriod', () => {
  it('defaults to this month with its window in words', () => {
    expect(resolvePeriod({}, TODAY)).toMatchObject({ key: 'this_month', from: '2026-10-01', to: '2026-10-31', noun: 'this month', window: '1–31 Oct 2026' })
  })
  it('resolves last month', () => {
    expect(resolvePeriod({ period: 'last_month' }, TODAY)).toMatchObject({ from: '2026-09-01', to: '2026-09-30', window: '1–30 Sep 2026' })
  })
  it('resolves this FY from 1 April', () => {
    expect(resolvePeriod({ period: 'this_fy' }, TODAY)).toMatchObject({ from: '2026-04-01', to: '2027-03-31', noun: 'in FY 2026-27', window: 'from 1 Apr 2026' })
  })
  it('resolves last FY, including in January', () => {
    expect(resolvePeriod({ period: 'last_fy' }, TODAY)).toMatchObject({ from: '2025-04-01', to: '2026-03-31', noun: 'in FY 2025-26' })
    expect(resolvePeriod({ period: 'last_fy' }, '2027-01-15')).toMatchObject({ from: '2025-04-01', to: '2026-03-31' })
  })
  it('reads custom dates and swaps them when reversed', () => {
    expect(resolvePeriod({ period: 'custom', from: '2026-09-30', to: '2026-09-01' }, TODAY)).toMatchObject({ key: 'custom', from: '2026-09-01', to: '2026-09-30' })
  })
  it('treats bare from/to (old links) as custom', () => {
    expect(resolvePeriod({ from: '2026-08-01' }, TODAY)).toMatchObject({ key: 'custom', from: '2026-08-01', to: TODAY })
  })
  it('falls back on an unknown preset', () => {
    expect(resolvePeriod({ period: 'forever' }, TODAY, 'this_fy').key).toBe('this_fy')
  })
  it('offers all time only where the page allows it', () => {
    expect(resolvePeriod({ period: 'all' }, TODAY, 'all')).toMatchObject({ key: 'all', from: null, to: null })
    expect(resolvePeriod({ period: 'all' }, TODAY, 'this_month').key).toBe('this_month')
  })
  it('bounded periods never come back open-ended', () => {
    expect(resolveBoundedPeriod({ period: 'all' }, TODAY, 'this_fy')).toMatchObject({ from: '2026-04-01', to: '2027-03-31' })
  })
})

describe('previousPeriod', () => {
  it('compares a month with the month before', () => {
    expect(previousPeriod(resolvePeriod({}, TODAY))).toMatchObject({ from: '2026-09-01', to: '2026-09-30', noun: 'last month' })
  })
  it('compares a FY with the FY before', () => {
    expect(previousPeriod(resolvePeriod({ period: 'this_fy' }, TODAY))).toMatchObject({ from: '2025-04-01', to: '2026-03-31', noun: 'FY 2025-26' })
  })
  it('has nothing to compare a custom range with', () => {
    expect(previousPeriod(resolvePeriod({ period: 'custom', from: '2026-09-03', to: '2026-09-09' }, TODAY))).toBeNull()
  })
})

describe('monthsIn', () => {
  it('lists every month the range touches', () => {
    expect(monthsIn('2026-04-01', '2026-07-15')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
  })
})

describe('pickFirm', () => {
  const firms = [
    { id: 'a1', code: 'VWX', name: 'Vistaar WebX' },
    { id: 'b2', code: 'VSL', name: 'Vistaar Solutions' },
  ]
  it('finds a firm by code in any case, or by id', () => {
    expect(pickFirm(firms, 'vsl')?.id).toBe('b2')
    expect(pickFirm(firms, 'a1')?.code).toBe('VWX')
  })
  it('is Combined when blank, unknown or there is only one firm', () => {
    expect(pickFirm(firms, null)).toBeNull()
    expect(pickFirm(firms, 'XYZ')).toBeNull()
    expect(pickFirm(firms.slice(0, 1), 'VWX')).toBeNull()
  })
})

describe('throughThisMonth', () => {
  it('stops a FY at the end of the current month', () => {
    expect(throughThisMonth({ from: '2026-04-01', to: '2027-03-31' }, TODAY)).toEqual({ from: '2026-04-01', to: '2026-10-31' })
  })
  it('leaves a past period alone', () => {
    expect(throughThisMonth({ from: '2025-04-01', to: '2026-03-31' }, TODAY)).toEqual({ from: '2025-04-01', to: '2026-03-31' })
  })
})
