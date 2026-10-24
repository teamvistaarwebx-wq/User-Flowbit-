import { describe, expect, it } from 'vitest'
import { leaveWarning, onLeaveOn, presenceFrom, presenceText } from './presence-core'

const NOW = new Date('2026-10-07T08:00:00Z')
const at = (hhmm: string) => new Date(`2026-10-07T${hhmm}:00+05:30`)

describe('presenceFrom', () => {
  it('is offline with no punches', () => {
    expect(presenceFrom(null, false, NOW)).toEqual({ state: 'out' })
  })

  it('is on leave when approved leave covers today', () => {
    expect(presenceFrom({ punches: [{ type: 'in', at: at('10:00') }] }, true, NOW).state).toBe('leave')
  })

  it('reads a leave mark on a day with no punches', () => {
    expect(presenceFrom({ punches: [], status: 'sick_leave' }, false, NOW).state).toBe('leave')
  })

  it('is checked in, then on a typed break', () => {
    expect(presenceFrom({ punches: [{ type: 'in', at: at('10:00') }] }, false, NOW).state).toBe('in')
    const onBreak = presenceFrom({ punches: [{ type: 'in', at: at('10:00') }, { type: 'break_start', at: at('13:00'), breakType: 'lunch' }] }, false, NOW)
    expect(onBreak).toEqual({ state: 'break', breakType: 'lunch' })
    expect(presenceText(onBreak)).toBe('On break · Lunch Break')
  })

  it('is offline after checking out', () => {
    expect(presenceFrom({ punches: [{ type: 'in', at: at('10:00') }, { type: 'out', at: at('13:00') }] }, false, NOW).state).toBe('out')
  })
})

describe('leave warnings', () => {
  const people = [{ id: 'a', name: 'Asha', leaveDates: ['2026-10-12'] }, { id: 'b', name: 'Bilal', leaveDates: ['2026-10-12', '2026-10-13'] }, { id: 'c', name: 'Chetan' }]

  it('finds who is on leave on the due date', () => {
    expect(onLeaveOn(people[0].leaveDates, '2026-10-12')).toBe(true)
    expect(leaveWarning(people, ['a', 'c'], '2026-10-12')).toBe('Asha is on leave that day')
    expect(leaveWarning(people, ['a', 'b'], '2026-10-12')).toBe('Asha, Bilal are on leave that day')
  })

  it('says nothing without a date or anyone away', () => {
    expect(leaveWarning(people, ['a'], null)).toBeNull()
    expect(leaveWarning(people, ['c'], '2026-10-12')).toBeNull()
  })
})
