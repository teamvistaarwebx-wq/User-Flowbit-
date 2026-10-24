import { describe, expect, it } from 'vitest'
import { MAX_PRINTED_BARS, columnTotals, describeBars, describeTrend, printsBarValues } from './describe'

const rupees = (v: number) => `₹${v}`

describe('describeBars', () => {
  it('names a single series, the span and the highest bar', () => {
    // Arrange
    const labels = ['Jan', 'Feb', 'Mar']
    // Act
    const text = describeBars(labels, [{ name: 'New clients', data: [1, 4, 2] }], String)
    // Assert
    expect(text).toBe('Bar chart of New clients, 3 bars, Jan to Mar. Highest: Feb, 4.')
  })

  it('lists several series and uses the column total', () => {
    const text = describeBars(['Q1', 'Q2'], [{ name: 'Invoiced', data: [10, 5] }, { name: 'Collected', data: [2, 9] }], rupees, true)
    expect(text).toBe('Bar chart of Invoiced and Collected, stacked, 2 bars, Q1 to Q2. Highest total: Q2, ₹14.')
  })

  it('handles an empty chart', () => {
    expect(describeBars([], [], String)).toBe('Bar chart with no data')
  })
})

describe('columnTotals', () => {
  it('treats missing points as zero', () => {
    expect(columnTotals(['a', 'b'], [{ name: 'x', data: [1] }, { name: 'y', data: [2, 3] }])).toEqual([3, 3])
  })
})

describe('printsBarValues', () => {
  it('prints for a single series up to the limit', () => {
    expect(printsBarValues(MAX_PRINTED_BARS, 1)).toBe(true)
    expect(printsBarValues(MAX_PRINTED_BARS + 1, 1)).toBe(false)
  })

  it('prints totals for stacked series but not for grouped ones', () => {
    expect(printsBarValues(6, 2, true)).toBe(true)
    expect(printsBarValues(6, 2, false)).toBe(false)
  })
})

describe('describeTrend', () => {
  it('gives start, end, low and high', () => {
    expect(describeTrend([3, 2, 9, 5], rupees)).toBe('Trend over 4 points: from ₹3 to ₹5, low ₹2, high ₹9.')
  })

  it('handles no data', () => {
    expect(describeTrend([])).toBe('No trend data')
  })
})
