import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BREAK_POLICIES } from '@/lib/break-types'

vi.mock('server-only', () => ({}))

const { sheetTimes } = await import('./day-sheet')

const hours = { start: '10:00', end: '19:00', halfDayHours: 4.5, graceMinutes: 15 }
const at = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00+05:30`)
const opts = (over: Partial<Parameters<typeof sheetTimes>[1]> = {}) => ({ status: 'present', isToday: true, now: at('12:16'), hours, policies: DEFAULT_BREAK_POLICIES, ...over })

describe('day sheet times', () => {
  // Checked in at 10:16; the stored minutes stop at the last punch (0 until they punch again).
  const checkedIn = { firstIn: at('10:16'), status: 'late', workedMinutes: 0, breakMinutes: 0, punches: [{ type: 'in', at: at('10:16') }] }

  it('counts someone still checked in today up to now, and says so', () => {
    expect(sheetTimes(checkedIn, opts({ status: 'late' }))).toMatchObject({ live: true, hours: { effective: 120 } })
  })

  it('keeps the stored minutes once they have checked out', () => {
    const out = { ...checkedIn, workedMinutes: 300, punches: [...checkedIn.punches, { type: 'out', at: at('15:16') }] }
    expect(sheetTimes(out, opts({ status: 'late' }))).toMatchObject({ live: false, hours: { effective: 300 } })
  })

  it('never runs a past day on to now, even without a check-out', () => {
    expect(sheetTimes(checkedIn, opts({ status: 'late', isToday: false }))).toMatchObject({ live: false, hours: { effective: 0 } })
  })

  it('gives the minutes after the office start for a late day only', () => {
    expect(sheetTimes(checkedIn, opts({ status: 'late' })).lateMinutes).toBe(16)
    expect(sheetTimes({ ...checkedIn, firstIn: at('10:14'), punches: [{ type: 'in', at: at('10:14') }] }, opts({ status: 'present' })).lateMinutes).toBeNull()
  })

  it('has nothing to show without a check-in', () => {
    expect(sheetTimes(undefined, opts())).toEqual({ hours: null, live: false, lateMinutes: null })
  })
})
