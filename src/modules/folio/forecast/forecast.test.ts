import { describe, expect, it } from 'vitest'
import { buildForecast, forecastMonths, forecastTotal, retainerDates, type ForecastRetainer } from './forecast'

const TODAY = '2026-10-02'

const retainer = (over: Partial<ForecastRetainer> = {}): ForecastRetainer => ({
  id: 'r1',
  name: 'Growth Retainer',
  clientId: 'c1',
  entityId: 'e1',
  amountPaise: 1_25_000_00,
  gstRatePercent: 18,
  frequency: 'monthly',
  billingDay: 1,
  startDate: '2026-04-01',
  issuedDates: ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'],
  ...over,
})

describe('forecastMonths', () => {
  it('starts with the current month', () => {
    expect(forecastMonths(TODAY, 3)).toEqual(['2026-10', '2026-11', '2026-12'])
  })
})

describe('retainerDates', () => {
  it('lists the billing dates after the last issued invoice', () => {
    expect(retainerDates(retainer(), '2026-12')).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
  })
  it('still counts a period whose draft is not issued yet', () => {
    // An October draft exists but only issued dates are passed in, so October stays expected.
    expect(retainerDates(retainer(), '2026-10')).toEqual(['2026-10-01'])
  })
  it('stops at the end date and skips a paused stretch', () => {
    expect(retainerDates(retainer({ endDate: '2026-11-15' }), '2027-03')).toEqual(['2026-10-01', '2026-11-01'])
    expect(retainerDates(retainer({ resumeFrom: '2026-11-01' }), '2026-12')).toEqual(['2026-11-01', '2026-12-01'])
  })
  it('bills quarterly retainers once a quarter', () => {
    expect(retainerDates(retainer({ frequency: 'quarterly', issuedDates: ['2026-07-01'] }), '2027-03')).toEqual(['2026-10-01', '2027-01-01'])
  })
})

describe('buildForecast', () => {
  const f = buildForecast({
    today: TODAY,
    months: 3,
    retainers: [retainer(), retainer({ id: 'r2', name: 'Social', clientId: 'c2', entityId: 'e2', amountPaise: 25_000_00, gstRatePercent: 0, issuedDates: ['2026-08-01'] })],
    milestones: [
      { id: 'm1', label: 'Replatform · UAT', clientId: 'c3', entityId: 'e1', amountPaise: 2_00_000_00, gstRatePercent: 18, dueOn: '2026-11-20' },
      { id: 'm2', label: 'Replatform · Launch', clientId: 'c3', entityId: 'e1', amountPaise: 80_000_00, gstRatePercent: 18, dueOn: null },
      { id: 'm3', label: 'Later', clientId: 'c3', entityId: 'e1', amountPaise: 1_00_000_00, gstRatePercent: 18, dueOn: '2027-06-01' },
    ],
  })

  it('puts a missed period into the current month and flags it late', () => {
    const late = f.lines.filter((l) => l.late)
    expect(late.map((l) => [l.sourceId, l.date, l.month])).toEqual([['r2', '2026-09-01', '2026-10']])
  })
  it('totals each month by source, before GST', () => {
    expect(f.byMonth.map((m) => m.totalPaise)).toEqual([1_25_000_00 + 2 * 25_000_00, 1_25_000_00 + 25_000_00 + 2_00_000_00, 1_25_000_00 + 25_000_00])
    expect(f.byMonth[1].milestonePaise).toBe(2_00_000_00)
    expect(f.byMonth[0].gstPaise).toBe(22_500_00)
  })
  it('keeps undated milestones out of the months and drops ones beyond the horizon', () => {
    expect(f.unscheduled.map((l) => l.sourceId)).toEqual(['m2'])
    expect(f.lines.some((l) => l.sourceId === 'm3')).toBe(false)
  })
  it('groups by firm and by client, largest first', () => {
    expect(f.byFirm.map((g) => g.id)).toEqual(['e1', 'e2'])
    expect(f.byClient[0]).toMatchObject({ id: 'c1', totalPaise: 3 * 1_25_000_00 })
  })
  it('sums the first n months', () => {
    expect(forecastTotal(f, 1)).toBe(f.byMonth[0].totalPaise)
    expect(forecastTotal(f)).toBe(f.byMonth.reduce((s, m) => s + m.totalPaise, 0))
  })
})
