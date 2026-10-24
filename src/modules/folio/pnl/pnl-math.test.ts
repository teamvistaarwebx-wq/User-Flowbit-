import { describe, expect, it } from 'vitest'
import { buildPnl } from './pnl-math'

const months = ['2026-08', '2026-09']
const categories = [
  { id: 'rent', name: 'Rent' },
  { id: 'soft', name: 'Software & subscriptions' },
  { id: 'idle', name: 'Travel' },
]

describe('buildPnl', () => {
  const pnl = buildPnl({
    months,
    income: [{ month: '2026-08', paise: 5_00_000_00 }, { month: '2026-09', paise: 3_00_000_00 }, { month: '2026-07', paise: 9_99_999_00 }],
    credits: [{ month: '2026-09', paise: 10_000_00 }],
    expenses: [
      { month: '2026-08', categoryId: 'rent', paise: 65_000_00 },
      { month: '2026-09', categoryId: 'rent', paise: 65_000_00 },
      { month: '2026-09', categoryId: 'soft', paise: 12_000_00 },
      { month: '2026-09', categoryId: 'gone', paise: 1_000_00 },
    ],
    categories,
    payroll: [{ month: '2026-09', paise: 2_00_000_00 }],
  })
  const byKey = (key: string) => pnl.rows.find((r) => r.key === key)

  it('nets credit notes off invoiced income and ignores months outside the range', () => {
    expect(byKey('income')?.values).toEqual([5_00_000_00, 3_00_000_00])
    expect(byKey('credits')?.values).toEqual([0, -10_000_00])
    expect(byKey('net_income')?.total).toBe(7_90_000_00)
  })
  it('lists only categories that were spent on, largest first, naming unknown ones', () => {
    expect(pnl.rows.filter((r) => r.kind === 'expense').map((r) => r.label)).toEqual(['Rent', 'Software & subscriptions', 'Uncategorised'])
  })
  it('adds salaries to costs and works out net profit and margin', () => {
    expect(byKey('salaries')?.values).toEqual([0, 2_00_000_00])
    expect(byKey('total_costs')?.values).toEqual([65_000_00, 2_78_000_00])
    expect(byKey('net')?.values).toEqual([4_35_000_00, 12_000_00])
    expect(pnl.netPaise).toBe(4_47_000_00)
    expect(pnl.marginPercent).toBe(56.6)
  })
  it('leaves salaries out entirely when payroll is not part of the view', () => {
    const noPayroll = buildPnl({ months, income: [], credits: [], expenses: [], categories, payroll: null })
    expect(noPayroll.rows.some((r) => r.kind === 'salaries')).toBe(false)
    expect(noPayroll.marginPercent).toBeNull()
  })
  it('feeds the chart one point per month', () => {
    expect(pnl.chart[1]).toEqual({ month: '2026-09', incomePaise: 2_90_000_00, costsPaise: 2_78_000_00, netPaise: 12_000_00 })
  })
})
