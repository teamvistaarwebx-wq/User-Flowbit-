import { describe, expect, it } from 'vitest'
import { addMonthsClamped, completedService, formatService } from './tenure'

const ymd = (from: string, until: string) => {
  const s = completedService(from, until)
  return [s.years, s.months, s.days]
}

describe('completedService', () => {
  it('counts exact years and months from the joining date', () => {
    expect(ymd('2024-08-01', '2026-10-02')).toEqual([2, 2, 1])
    expect(formatService(completedService('2024-08-01', '2026-10-02'))).toBe('2 years 2 months')
    expect(ymd('2024-08-01', '2026-08-01')).toEqual([2, 0, 0])
    expect(ymd('2024-08-02', '2026-08-01')).toEqual([1, 11, 30])
  })

  it('completes a month on the last day of a shorter month', () => {
    expect(ymd('2025-01-31', '2025-02-28')).toEqual([0, 1, 0])
    expect(ymd('2025-01-31', '2025-02-27')).toEqual([0, 0, 27])
    expect(ymd('2025-01-31', '2025-03-01')).toEqual([0, 1, 1])
    expect(ymd('2025-01-31', '2025-03-31')).toEqual([0, 2, 0])
    expect(ymd('2024-05-31', '2024-06-30')).toEqual([0, 1, 0])
  })

  it('handles leap years', () => {
    expect(ymd('2024-01-31', '2024-02-29')).toEqual([0, 1, 0])
    expect(ymd('2024-02-29', '2025-02-28')).toEqual([1, 0, 0])
    expect(ymd('2024-02-29', '2028-02-28')).toEqual([3, 11, 30])
    expect(ymd('2024-02-29', '2028-02-29')).toEqual([4, 0, 0])
    expect(ymd('2023-03-01', '2024-02-29')).toEqual([0, 11, 28])
  })

  it('is zero on or before the joining date and counts days under a month', () => {
    expect(ymd('2026-10-02', '2026-10-02')).toEqual([0, 0, 0])
    expect(ymd('2026-10-05', '2026-10-02')).toEqual([0, 0, 0])
    expect(formatService(completedService('2026-09-01', '2026-09-20'))).toBe('19 days')
  })
})

describe('addMonthsClamped', () => {
  it('clamps forwards and backwards across year ends', () => {
    expect(addMonthsClamped('2025-12-31', 2)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-15', -3)).toBe('2025-10-15')
  })
})
