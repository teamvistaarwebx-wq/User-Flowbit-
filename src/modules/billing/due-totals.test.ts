import { describe, expect, it } from 'vitest'
import { dueTotals, tdsOfBill } from './due-totals'

const bill = (over: object = {}) => ({ totalPaise: 1_180_000, taxableValuePaise: 1_000_000, receivedPaise: 0, tds: null, dueDate: '2026-10-05', ...over })

describe('due bill totals', () => {
  it('sums what each due bill still asks for, net of TDS and part payments', () => {
    const totals = dueTotals([bill(), bill({ receivedPaise: 600_000 }), bill({ tds: { declared: true }, dueDate: '2026-10-20' })], '2026-10-11')
    expect(totals).toEqual({ duePaise: 1_180_000 + 580_000 + 1_160_000, dueCount: 3, overduePaise: 1_180_000 + 580_000, overdueCount: 2 })
  })

  it('treats a bill due today, or with no due date, as not overdue yet', () => {
    expect(dueTotals([bill({ dueDate: '2026-10-11' }), bill({ dueDate: null })], '2026-10-11')).toMatchObject({ overduePaise: 0, overdueCount: 0, dueCount: 2 })
  })

  it('shows the expected 2% TDS on a due bill and the recorded TDS once paid', () => {
    expect(tdsOfBill({ status: 'due', taxableValuePaise: 1_000_000, tds: { amountPaise: 0 } })).toBe(20_000)
    expect(tdsOfBill({ status: 'paid', taxableValuePaise: 1_000_000, tds: { amountPaise: 19_500 } })).toBe(19_500)
  })
})
