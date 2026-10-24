import { describe, expect, it } from 'vitest'
import { computeDay } from './attendance-core'
import { addBreakMinutes, addDayHours, breakEntries, breakRefusal, breakUsage, cleanBreakMinutes, dayHours, DEFAULT_BREAK_POLICIES, mergeBreakPolicies, NO_HOURS, paidBreakMinutes, payableMinutes, storedBreakMinutes } from './break-types'

const at = (hhmm: string) => new Date(`2026-10-09T${hhmm}:00+05:30`)

describe('break policies', () => {
  it('defaults: Lunch unpaid 45, Power Nap paid 20, Tea/Coffee paid 30, Personal/Rest unpaid 30', () => {
    expect(DEFAULT_BREAK_POLICIES).toEqual({
      lunch: { paid: false, limitMinutes: 45 },
      power_nap: { paid: true, limitMinutes: 20 },
      tea: { paid: true, limitMinutes: 30 },
      personal: { paid: false, limitMinutes: 30 },
    })
  })

  it('merges stored settings and keeps the default for bad values', () => {
    const merged = mergeBreakPolicies({ lunch: { paid: true, limitMinutes: 60 }, tea: { paid: 'yes', limitMinutes: 2 }, power_nap: { limitMinutes: 999 } })
    expect(merged.lunch).toEqual({ paid: true, limitMinutes: 60 })
    expect(merged.tea).toEqual(DEFAULT_BREAK_POLICIES.tea)
    expect(merged.power_nap).toEqual(DEFAULT_BREAK_POLICIES.power_nap)
    expect(mergeBreakPolicies(null)).toEqual(DEFAULT_BREAK_POLICIES)
  })
})

describe('paid and unpaid hours', () => {
  it('pays only paid types, each up to its daily limit', () => {
    // Tea 40 of 30 paid → 30; nap 10 of 20 → 10; lunch and personal unpaid; untyped never paid.
    expect(paidBreakMinutes({ tea: 40, power_nap: 10, lunch: 45, personal: 20, other: 15 }, DEFAULT_BREAK_POLICIES)).toBe(40)
  })

  it('payable = effective (worked) + paid breaks', () => {
    expect(payableMinutes(420, { tea: 25, lunch: 45 }, DEFAULT_BREAK_POLICIES)).toBe(445)
    expect(payableMinutes(420, {}, DEFAULT_BREAK_POLICIES)).toBe(420)
  })

  it('follows the workspace settings', () => {
    const policies = mergeBreakPolicies({ lunch: { paid: true, limitMinutes: 30 } })
    expect(payableMinutes(400, { lunch: 45 }, policies)).toBe(430)
  })
})

describe('daily limits', () => {
  it('reports used, left and over per type', () => {
    const usage = breakUsage({ tea: 35, lunch: 10 }, DEFAULT_BREAK_POLICIES)
    expect(usage.find((u) => u.type === 'tea')).toEqual({ type: 'tea', used: 35, limit: 30, left: 0, over: 5, paid: true })
    expect(usage.find((u) => u.type === 'lunch')).toEqual({ type: 'lunch', used: 10, limit: 45, left: 35, over: 0, paid: false })
  })

  it('refuses a new break of a type whose limit is used up, allows the others', () => {
    expect(breakRefusal('power_nap', { power_nap: 20 }, DEFAULT_BREAK_POLICIES)).toMatch(/20 min of Power Nap/)
    expect(breakRefusal('power_nap', { power_nap: 19 }, DEFAULT_BREAK_POLICIES)).toBeNull()
    expect(breakRefusal('tea', { power_nap: 20 }, DEFAULT_BREAK_POLICIES)).toBeNull()
  })
})

describe('computeDay with break types', () => {
  it('splits break minutes by the type on each break_start', () => {
    const day = computeDay(
      {
        punches: [
          { type: 'in', at: at('10:00') },
          { type: 'break_start', at: at('13:00'), breakType: 'lunch' },
          { type: 'break_end', at: at('13:40') },
          { type: 'break_start', at: at('16:00'), breakType: 'tea' },
          { type: 'break_end', at: at('16:15') },
          { type: 'break_start', at: at('17:00') },
          { type: 'break_end', at: at('17:05') },
          { type: 'out', at: at('19:00') },
        ],
      },
      undefined,
      at('20:00'),
    )
    expect(day.breakByType).toEqual({ lunch: 40, tea: 15, other: 5 })
    expect(day.breakMinutes).toBe(60)
    expect(day.workedMinutes).toBe(480)
    expect(day.breakType).toBeNull()
    expect(payableMinutes(day.workedMinutes, day.breakByType, DEFAULT_BREAK_POLICIES)).toBe(495)
  })

  it('counts an open break up to now under its type', () => {
    const day = computeDay({ punches: [{ type: 'in', at: at('10:00') }, { type: 'break_start', at: at('12:00'), breakType: 'power_nap' }] }, undefined, at('12:25'))
    expect(day.state).toBe('break')
    expect(day.breakType).toBe('power_nap')
    expect(day.breakByType).toEqual({ power_nap: 25 })
    // 25 min nap, paid up to 20.
    expect(payableMinutes(day.workedMinutes, day.breakByType, DEFAULT_BREAK_POLICIES)).toBe(140)
  })

  it('treats an unknown stored type as untyped', () => {
    const day = computeDay({ punches: [{ type: 'in', at: at('10:00') }, { type: 'break_start', at: at('11:00'), breakType: 'smoke' }, { type: 'break_end', at: at('11:10') }] }, undefined, at('11:10'))
    expect(day.breakByType).toEqual({ other: 10 })
  })
})

describe('helpers', () => {
  it('adds per-type minutes without changing the inputs', () => {
    const a = { tea: 10 }
    expect(addBreakMinutes(a, { tea: 5, lunch: 30 })).toEqual({ tea: 15, lunch: 30 })
    expect(a).toEqual({ tea: 10 })
  })

  it('keeps only positive, rounded minutes for storage', () => {
    expect(cleanBreakMinutes({ tea: 10.4, lunch: 0, other: 2.6 })).toEqual({ tea: 10, other: 3 })
  })
})

describe('stored days', () => {
  it('reads per-type minutes, or an old day as untyped break time', () => {
    expect(storedBreakMinutes({ breakMinutes: 30, breakByType: { lunch: 30, junk: 5 } })).toEqual({ lunch: 30 })
    expect(storedBreakMinutes({ breakMinutes: 25 })).toEqual({ other: 25 })
    expect(storedBreakMinutes({})).toEqual({})
  })

  it('gives effective and payable hours and adds days up', () => {
    const a = dayHours({ workedMinutes: 400, breakByType: { tea: 20, lunch: 45 } }, DEFAULT_BREAK_POLICIES)
    expect(a).toEqual({ effective: 400, payable: 420, breaks: { tea: 20, lunch: 45 } })
    const b = dayHours({ workedMinutes: 300, breakMinutes: 10 }, DEFAULT_BREAK_POLICIES)
    expect(addDayHours(addDayHours(NO_HOURS, a), b)).toEqual({ effective: 700, payable: 720, breaks: { tea: 20, lunch: 45, other: 10 } })
    expect(breakEntries({ other: 10, lunch: 45 })).toEqual([['lunch', 45], ['other', 10]])
  })
})
