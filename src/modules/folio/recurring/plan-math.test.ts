import { describe, expect, test } from 'vitest'
import { allocatedOf, milestoneAmount, milestoneIssues } from './plan-math'

const total = 80_000_000

describe('milestoneAmount', () => {
  test('a share of the value', () => {
    expect(milestoneAmount(total, { percentOfTotal: 25, amountPaise: null })).toBe(20_000_000)
  })

  test('a flat amount wins, and zero is not treated as absent', () => {
    expect(milestoneAmount(total, { percentOfTotal: null, amountPaise: 0 })).toBe(0)
    expect(milestoneAmount(total, { amountPaise: 5_000_000 })).toBe(5_000_000)
  })
})

describe('milestoneIssues', () => {
  test('accepts phases that fit the value', () => {
    expect(milestoneIssues(total, [{ position: 1, name: 'A', percentOfTotal: 25 }, { position: 2, name: 'B', amountPaise: 10_000_000 }])).toBeNull()
  })

  test('two phases cannot share a position', () => {
    expect(milestoneIssues(total, [{ position: 1, name: 'A', percentOfTotal: 10 }, { position: 1, name: 'B', percentOfTotal: 10 }])).toMatch(/position/)
  })

  test('a phase needs exactly one of share and amount', () => {
    expect(milestoneIssues(total, [{ position: 1, name: 'A' }])).toMatch(/Phase "A"/)
    expect(milestoneIssues(total, [{ position: 1, name: 'A', percentOfTotal: 5, amountPaise: 5 }])).toMatch(/not both/)
  })

  test('refuses more than 100% or more than the value', () => {
    expect(milestoneIssues(total, [{ position: 1, name: 'A', percentOfTotal: 60 }, { position: 2, name: 'B', percentOfTotal: 50 }])).toMatch(/100%/)
    expect(milestoneIssues(total, [{ position: 1, name: 'A', amountPaise: total + 1 }])).toMatch(/plan value/)
  })

  test('ignores cancelled phases in the sums', () => {
    expect(milestoneIssues(total, [{ position: 1, name: 'A', percentOfTotal: 90 }, { position: 2, name: 'B', percentOfTotal: 50, status: 'cancelled' }])).toBeNull()
  })
})

describe('allocatedOf', () => {
  test('reports the covered share and amount', () => {
    expect(allocatedOf(total, [{ position: 1, name: 'A', percentOfTotal: 25 }, { position: 2, name: 'B', percentOfTotal: 40 }])).toEqual({ percent: 65, amountPaise: 52_000_000 })
  })
})
