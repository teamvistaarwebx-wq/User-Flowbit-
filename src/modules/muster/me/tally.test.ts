import { describe, expect, it } from 'vitest'
import { attendanceTally } from './tally'

describe('My attendance bar (R1 2.9)', () => {
  it('counts half days apart from late days, and leaves assumed days out', () => {
    const cells = [{ status: 'present' }, { status: 'late' }, { status: 'half_day' }, { status: 'paid_half_day' }, { status: 'absent' }, { status: 'present', assumed: true }]
    expect(attendanceTally(cells)).toEqual({ onTime: 1, late: 1, halfDay: 2, absent: 1 })
  })
})
