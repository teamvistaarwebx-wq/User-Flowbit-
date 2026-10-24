import { describe, expect, it } from 'vitest'
import { costByClient, fillMonths, healthCounts, hourlyCostPaise, lastMonths, marginOf, minutesByClient, newSince, retainerUse, topBy } from './dashboard-math'
import { clientHealth, latest } from './health'

const TODAY = '2026-10-09'

describe('client health', () => {
  it('is healthy with nothing overdue and recent contact', () => {
    expect(clientHealth({ overduePaise: 0, oldestOverdueDue: null, lastTouchAt: new Date('2026-10-01T10:00:00Z'), today: TODAY })).toBe('good')
  })
  it('needs attention when anything is overdue or the client went quiet for a month', () => {
    expect(clientHealth({ overduePaise: 5_000_00, oldestOverdueDue: '2026-09-25', lastTouchAt: new Date('2026-10-05'), today: TODAY })).toBe('watch')
    expect(clientHealth({ overduePaise: 0, oldestOverdueDue: null, lastTouchAt: new Date('2026-08-20'), today: TODAY })).toBe('watch')
  })
  it('is at risk when overdue past 60 days, quiet past 90 days or never touched', () => {
    expect(clientHealth({ overduePaise: 1, oldestOverdueDue: '2026-07-01', lastTouchAt: new Date('2026-10-08'), today: TODAY })).toBe('at_risk')
    expect(clientHealth({ overduePaise: 0, oldestOverdueDue: null, lastTouchAt: new Date('2026-06-01'), today: TODAY })).toBe('at_risk')
    expect(clientHealth({ overduePaise: 0, oldestOverdueDue: null, lastTouchAt: null, today: TODAY })).toBe('at_risk')
  })
  it('picks the latest of mixed dates and ignores blanks', () => {
    expect(latest(null, '2026-09-01', new Date('2026-09-15T00:00:00Z'), undefined)?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
    expect(latest(null, undefined)).toBeNull()
  })
})

describe('dashboard metrics on fixtures', () => {
  it('lists the last 12 months ending this month and fills gaps with 0', () => {
    const months = lastMonths(TODAY, 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2025-11')
    expect(months[11]).toBe('2026-10')
    expect(fillMonths([{ month: '2026-10', n: 3 }, { month: '2025-11', n: 1 }], months)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3])
  })
  it('counts clients per health level', () => {
    const fixtures = [
      { overduePaise: 0, oldestOverdueDue: null, lastTouchAt: new Date('2026-10-08'), today: TODAY },
      { overduePaise: 0, oldestOverdueDue: null, lastTouchAt: new Date('2026-10-02'), today: TODAY },
      { overduePaise: 100, oldestOverdueDue: '2026-10-01', lastTouchAt: new Date('2026-10-08'), today: TODAY },
      { overduePaise: 100, oldestOverdueDue: '2026-05-01', lastTouchAt: new Date('2026-10-08'), today: TODAY },
    ]
    expect(healthCounts(fixtures)).toEqual({ good: 2, watch: 1, at_risk: 1 })
  })
  it('ranks top clients by value and drops zero rows', () => {
    const rows = [{ name: 'B', value: 500 }, { name: 'A', value: 500 }, { name: 'C', value: 0 }, { name: 'D', value: 900 }]
    expect(topBy(rows, 2).map((r) => r.name)).toEqual(['D', 'A'])
  })
  it('computes the "new" window start', () => {
    expect(newSince(TODAY, 30)).toBe('2026-09-09')
  })
})

describe('hours and margin', () => {
  it('turns annual CTC into an hourly cost over 176 hours a month', () => {
    expect(hourlyCostPaise(12_00_000_00)).toBe(Math.round(12_00_000_00 / 12 / 176))
    expect(hourlyCostPaise(0)).toBe(0)
  })
  it('maps time to clients through projects, then tasks', () => {
    const minutes = minutesByClient(
      [{ projectId: 'p1', minutes: 60 }, { taskId: 't1', minutes: 30 }, { projectId: 'p-other', minutes: 45 }, { projectId: 'p1', taskId: 't1', minutes: 15 }],
      new Map([['p1', 'c1']]),
      new Map([['t1', 'c2']]),
    )
    expect(Object.fromEntries(minutes)).toEqual({ c1: 75, c2: 30 })
  })
  it('costs each member at their own rate and computes margin', () => {
    const cost = costByClient([{ client: 'c1', memberId: 'm1', minutes: 120 }, { client: 'c1', memberId: 'm2', minutes: 60 }], new Map([['m1', 500_00], ['m2', 1_000_00]]))
    expect(cost.get('c1')).toBe(2_000_00)
    expect(marginOf(10_000_00, 2_000_00)).toEqual({ revenuePaise: 10_000_00, costPaise: 2_000_00, marginPaise: 8_000_00, pct: 80 })
    expect(marginOf(0, 500).pct).toBeNull()
  })
  it('measures retainer use only when the retainer sets hours', () => {
    expect(retainerUse(600, 20)).toBe(50)
    expect(retainerUse(600, null)).toBeNull()
  })
})
