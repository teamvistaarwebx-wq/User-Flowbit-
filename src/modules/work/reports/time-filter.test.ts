import { describe, expect, it } from 'vitest'
import { cutToLimit, reportTimeFilter } from './time-filter'

describe('reportTimeFilter', () => {
  it('leaves out running timers and rejected time by default', () => {
    expect(reportTimeFilter(false)).toEqual({ isRunning: false, status: { $ne: 'rejected' } })
  })

  it('keeps only approved time when asked', () => {
    expect(reportTimeFilter(true)).toEqual({ isRunning: false, status: 'approved' })
  })
})

describe('cutToLimit', () => {
  it('keeps every row at or under the limit', () => {
    expect(cutToLimit([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], truncated: false })
  })

  it('drops the extra row and flags truncation above the limit', () => {
    expect(cutToLimit([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], truncated: true })
  })
})
