import { describe, expect, it } from 'vitest'
import { DEFAULT_BREAK_POLICIES } from '@/lib/break-types'
import { translator } from '@/lib/i18n'
import type { TodayState } from '@/lib/attendance-core'
import {
  BREAK_WARN_AT,
  DEFAULT_WORKDAY_MINUTES,
  MORPH_MS,
  breakRing,
  dialMotion,
  dialRing,
  dialStatus,
  dialView,
  dialVisual,
  formatDialTime,
  minutesSince,
  prefersReducedMotion,
  workRing,
  workdayMinutes,
} from './punch-dial-model'

const t = translator('en')

const today = (over: Partial<TodayState> = {}): TodayState => ({
  date: '2026-10-11',
  state: 'out',
  stateSince: null,
  workedMinutes: 0,
  breakMinutes: 0,
  breakByType: {},
  breakType: null,
  payableMinutes: 0,
  firstIn: null,
  lastOut: null,
  allowed: ['in'],
  locked: false,
  status: 'absent',
  ...over,
})

describe('dialVisual: punches to the dial picture', () => {
  it('is idle before the first check-in', () => {
    expect(dialVisual(today())).toEqual({ kind: 'idle' })
  })

  it('is the running clock while checked in', () => {
    expect(dialVisual(today({ state: 'in', firstIn: '2026-10-11T04:30:00Z' }))).toEqual({ kind: 'working' })
  })

  it('is the break type while on a break, untyped breaks as "other"', () => {
    expect(dialVisual(today({ state: 'break', breakType: 'power_nap' }))).toEqual({ kind: 'break', breakType: 'power_nap' })
    expect(dialVisual(today({ state: 'break', breakType: null }))).toEqual({ kind: 'break', breakType: 'other' })
  })

  it('is done once checked out for the day', () => {
    expect(dialVisual(today({ state: 'out', firstIn: '2026-10-11T04:30:00Z', lastOut: '2026-10-11T13:30:00Z' }))).toEqual({ kind: 'done' })
  })
})

describe('ring maths', () => {
  it('reads the workday from office hours, with a 9 hour fallback', () => {
    expect(workdayMinutes({ start: '09:30', end: '18:30' })).toBe(540)
    expect(workdayMinutes({ start: '10:00', end: '14:00' })).toBe(240)
    expect(workdayMinutes({ start: '22:00', end: '06:00' })).toBe(DEFAULT_WORKDAY_MINUTES)
    expect(workdayMinutes(null)).toBe(DEFAULT_WORKDAY_MINUTES)
  })

  it('fills the work ring toward the workday and stops at full', () => {
    expect(workRing(270, 540)).toEqual({ progress: 0.5, tone: 'work' })
    expect(workRing(700, 540).progress).toBe(1)
    expect(workRing(-5, 540).progress).toBe(0)
    expect(workRing(10, 0).progress).toBe(1)
  })

  it('fills the break ring against the daily limit: calm, amber near it, red past it', () => {
    expect(breakRing(15, 45)).toEqual({ progress: 1 / 3, tone: 'break' })
    expect(breakRing(45 * BREAK_WARN_AT, 45).tone).toBe('warn')
    expect(breakRing(45, 45)).toEqual({ progress: 1, tone: 'warn' })
    expect(breakRing(46, 45)).toEqual({ progress: 1, tone: 'over' })
  })

  it('leaves the ring empty for a break with no limit', () => {
    expect(breakRing(30, null)).toEqual({ progress: 0, tone: 'break' })
  })

  it('maps each visual to its ring', () => {
    const input = { workedMinutes: 135, dayMinutes: 540, breakUsedMinutes: 18, policies: DEFAULT_BREAK_POLICIES }
    expect(dialRing({ kind: 'working' }, input)).toEqual({ progress: 0.25, tone: 'work' })
    expect(dialRing({ kind: 'break', breakType: 'power_nap' }, input)).toEqual({ progress: 0.9, tone: 'warn' })
    expect(dialRing({ kind: 'break', breakType: 'other' }, input).progress).toBe(0)
    expect(dialRing({ kind: 'done' }, input)).toEqual({ progress: 1, tone: 'done' })
    expect(dialRing({ kind: 'idle' }, input)).toEqual({ progress: 0, tone: 'none' })
  })
})

describe('timer formatting', () => {
  it('pads hours and minutes', () => {
    expect(formatDialTime(0)).toBe('00H 00MIN')
    expect(formatDialTime(432)).toBe('07H 12MIN')
    expect(formatDialTime(12.9)).toBe('00H 12MIN')
    expect(formatDialTime(61 * 60)).toBe('61H 00MIN')
  })

  it('never shows a negative or broken time', () => {
    expect(formatDialTime(-3)).toBe('00H 00MIN')
    expect(formatDialTime(Number.NaN)).toBe('00H 00MIN')
  })

  it('counts minutes since a start time', () => {
    const now = Date.parse('2026-10-11T08:12:30Z')
    expect(minutesSince('2026-10-11T08:00:00Z', now)).toBe(12.5)
    expect(minutesSince(null, now)).toBe(0)
    expect(minutesSince('2026-10-11T09:00:00Z', now)).toBe(0)
  })
})

describe('status line', () => {
  const ring = { progress: 0.2, tone: 'break' as const }

  it('reads the break type and minutes', () => {
    expect(dialStatus({ kind: 'break', breakType: 'lunch' }, { workedMinutes: 0, breakMinutes: 12.4, ring }, t)).toBe('On break: Lunch Break, 12 minutes')
    expect(dialStatus({ kind: 'break', breakType: 'tea' }, { workedMinutes: 0, breakMinutes: 1, ring }, t)).toBe('On break: Tea/Coffee Break, 1 minute')
  })

  it('says when a break is past its limit', () => {
    expect(dialStatus({ kind: 'break', breakType: 'tea' }, { workedMinutes: 0, breakMinutes: 33, ring: { progress: 1, tone: 'over' } }, t)).toContain('over the daily limit')
  })

  it('reads worked time while working and once done, and idle before check-in', () => {
    expect(dialStatus({ kind: 'working' }, { workedMinutes: 432, breakMinutes: 0, ring }, t)).toBe('Checked in, 7 h 12 min worked')
    expect(dialStatus({ kind: 'done' }, { workedMinutes: 480, breakMinutes: 0, ring }, t)).toBe('Checked out, 8 h 0 min worked today')
    expect(dialStatus({ kind: 'idle' }, { workedMinutes: 0, breakMinutes: 0, ring }, t)).toBe('Not checked in yet')
  })

  it('has Hindi strings', () => {
    expect(dialStatus({ kind: 'idle' }, { workedMinutes: 0, breakMinutes: 0, ring }, translator('hi'))).not.toBe('Not checked in yet')
  })
})

describe('dialView: the card from live punch counts', () => {
  const now = Date.parse('2026-10-11T08:12:00Z')

  it('shows the running break timer and its ring against the limit, including minutes since render', () => {
    const state = today({ state: 'break', breakType: 'lunch', stateSince: '2026-10-11T08:00:00Z', breakMinutes: 20, breakByType: { lunch: 20 }, workedMinutes: 180, allowed: ['break_end', 'out'] })
    const view = dialView({ today: state, now, worked: 180, onBreak: 22, policies: DEFAULT_BREAK_POLICIES, dayMinutes: 540 }, t)
    expect(view.visual).toEqual({ kind: 'break', breakType: 'lunch' })
    expect(view.timer).toBe('00H 12MIN')
    expect(view.ring.progress).toBeCloseTo(22 / 45)
    expect(view.status).toBe('On break: Lunch Break, 12 minutes')
  })

  it('shows worked time and stops the hands at check-out once done', () => {
    const state = today({ firstIn: '2026-10-11T04:00:00Z', lastOut: '2026-10-11T07:30:00Z', workedMinutes: 210 })
    const view = dialView({ today: state, now, worked: 210, onBreak: 0, policies: DEFAULT_BREAK_POLICIES, dayMinutes: 540 }, t)
    expect(view.timer).toBe('03H 30MIN')
    expect(view.handsAt).toBe(Date.parse('2026-10-11T07:30:00Z'))
    expect(view.ring).toEqual({ progress: 1, tone: 'done' })
  })

  it('keeps the hands on now while working', () => {
    const view = dialView({ today: today({ state: 'in', firstIn: '2026-10-11T04:00:00Z' }), now, worked: 252, onBreak: 0, policies: DEFAULT_BREAK_POLICIES, dayMinutes: 540 }, t)
    expect(view.handsAt).toBe(now)
    expect(view.timer).toBe('04H 12MIN')
  })
})

describe('reduced motion', () => {
  it('morphs with a spring and loops in full motion', () => {
    expect(dialMotion(false)).toMatchObject({ morphMs: MORPH_MS, loops: true })
    expect(MORPH_MS).toBeGreaterThanOrEqual(400)
    expect(MORPH_MS).toBeLessThanOrEqual(600)
  })

  it('swaps at once with no loops when reduced', () => {
    expect(dialMotion(true)).toEqual({ morphMs: 0, loops: false, ease: 'linear' })
  })

  it("puts the user's Appearance choice over the OS setting", () => {
    expect(prefersReducedMotion('reduce', false)).toBe(true)
    expect(prefersReducedMotion('full', true)).toBe(false)
    expect(prefersReducedMotion('system', true)).toBe(true)
    expect(prefersReducedMotion(undefined, false)).toBe(false)
  })
})

describe('the running break label (R1 2.8)', () => {
  it('counts the current break, not the whole day', async () => {
    const { currentBreakMinutes } = await import('./punch-dial-model')
    const started = Date.parse('2026-10-11T07:00:00Z')
    expect(currentBreakMinutes({ state: 'break', stateSince: new Date(started).toISOString() }, started + 12 * 60_000)).toBe(12)
    expect(currentBreakMinutes({ state: 'in', stateSince: new Date(started).toISOString() }, started + 12 * 60_000)).toBe(0)
  })
})
