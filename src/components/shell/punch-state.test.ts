import { describe, expect, it } from 'vitest'
import { DEFAULT_BREAK_POLICIES } from '@/lib/break-types'
import { translator } from '@/lib/i18n'
import type { TodayState } from '@/lib/attendance-core'
import { dialView } from './punch-dial-model'
import { initialPunch, liveMinutes, predictPunch, punchReducer, shownPunch, type PunchSync } from './punch-state'

const t = translator('en')
const T0 = Date.parse('2026-10-11T07:30:00.000Z')
const MIN = 60_000

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

const onLunch = today({ state: 'break', stateSince: new Date(T0 - 10 * MIN).toISOString(), workedMinutes: 120, breakMinutes: 10, breakByType: { lunch: 10 }, breakType: 'lunch', firstIn: '2026-10-11T05:20:00.000Z', allowed: ['break_end', 'out'], status: 'present' })
const working = today({ state: 'in', stateSince: '2026-10-11T05:20:00.000Z', workedMinutes: 130, firstIn: '2026-10-11T05:20:00.000Z', allowed: ['break_start', 'out'], status: 'present' })

/** What the card's label and the dial each read from the same shown day. */
function surfaces(sync: PunchSync, now: number) {
  const shown = shownPunch(sync)
  const { worked, onBreak } = liveMinutes(shown, sync.countedAt, now)
  const dial = dialView({ today: shown, now, worked, onBreak, policies: DEFAULT_BREAK_POLICIES, dayMinutes: 540 }, t)
  return { label: shown.state, buttons: shown.allowed, dial: dial.visual.kind, timer: dial.timer }
}

const resume = (sync: PunchSync, at: number): PunchSync => punchReducer(sync, { type: 'predict', today: predictPunch(shownPunch(sync), { type: 'break_end', at, countedAt: sync.countedAt }), at })

describe('punch state behind the label and the dial', () => {
  it('moves the dial with the optimistic Resume at once, before the server answers', () => {
    // Arrange
    const sync = initialPunch(onLunch, T0)
    expect(surfaces(sync, T0).dial).toBe('break')

    // Act
    const after = resume(sync, T0 + 5_000)

    // Assert
    const view = surfaces(after, T0 + 5_000)
    expect(view.label).toBe('in')
    expect(view.dial).toBe('working')
    expect(view.buttons).toEqual(['break_start', 'out'])
    expect(after.confirmed).toBe(onLunch)
  })

  it('rolls the dial back to the lunch break together with the label when the punch fails', () => {
    // Arrange
    const pending = resume(initialPunch(onLunch, T0), T0 + 5_000)

    // Act
    const failed = punchReducer(pending, { type: 'rollback', at: T0 + 6_000 })

    // Assert
    const view = surfaces(failed, T0 + 6_000)
    expect(view.label).toBe('break')
    expect(view.dial).toBe('break')
    expect(view.buttons).toEqual(['break_end', 'out'])
    expect(failed.optimistic).toBeNull()
  })

  it("replaces the guess with the server's day once the punch succeeds", () => {
    const pending = resume(initialPunch(onLunch, T0), T0 + 5_000)
    const done = punchReducer(pending, { type: 'confirm', today: working, at: T0 + 7_000 })
    expect(done).toEqual({ confirmed: working, optimistic: null, countedAt: T0 + 7_000 })
    expect(surfaces(done, T0 + 7_000).dial).toBe('working')
  })

  it('keeps the guess shown when a stale server render lands mid-punch', () => {
    const pending = resume(initialPunch(onLunch, T0), T0 + 5_000)
    const stale = punchReducer(pending, { type: 'server', today: onLunch, at: T0 + 6_000 })
    expect(surfaces(stale, T0 + 6_000).dial).toBe('working')
  })

  it('takes a fresh server render when nothing is in flight, and ignores a rollback with no guess', () => {
    const sync = initialPunch(onLunch, T0)
    expect(shownPunch(punchReducer(sync, { type: 'server', today: working, at: T0 + MIN }))).toBe(working)
    expect(punchReducer(sync, { type: 'rollback', at: T0 + MIN })).toBe(sync)
  })
})

describe('predictPunch', () => {
  it('starts the picked break with its icon and keeps the worked minutes counted up to the click', () => {
    const next = predictPunch(working, { type: 'break_start', breakType: 'tea', at: T0 + 2 * MIN, countedAt: T0 })
    expect(next).toMatchObject({ state: 'break', breakType: 'tea', workedMinutes: 132, allowed: ['break_end', 'out'], stateSince: new Date(T0 + 2 * MIN).toISOString() })
    expect(dialView({ today: next, now: T0 + 2 * MIN, worked: 132, onBreak: 0, policies: DEFAULT_BREAK_POLICIES, dayMinutes: 540 }, t).visual).toEqual({ kind: 'break', breakType: 'tea' })
  })

  it("adds the ending break's minutes to its type on Resume", () => {
    const next = predictPunch(onLunch, { type: 'break_end', at: T0 + 3 * MIN, countedAt: T0 })
    expect(next).toMatchObject({ state: 'in', breakType: null, breakMinutes: 13, breakByType: { lunch: 13 }, workedMinutes: 120 })
  })

  it('checks out to the done dial, and checks in from a fresh day', () => {
    const out = predictPunch(working, { type: 'out', at: T0, countedAt: T0 })
    expect(out).toMatchObject({ state: 'out', lastOut: new Date(T0).toISOString(), allowed: ['in'] })
    expect(dialView({ today: out, now: T0, worked: 130, onBreak: 0, policies: DEFAULT_BREAK_POLICIES, dayMinutes: 540 }, t).visual.kind).toBe('done')
    const first = predictPunch(today(), { type: 'in', at: T0, countedAt: T0 })
    expect(first).toMatchObject({ state: 'in', firstIn: new Date(T0).toISOString(), allowed: ['break_start', 'out'] })
  })
})
