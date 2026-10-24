import { describe, expect, it } from 'vitest'
import { dayRoom, formatHM, formatTimer, hoursDecimal, isLongTimer, parseDuration, timerMinutes } from './format'

describe('formatTimer', () => {
  it('pads hours, minutes and seconds', () => {
    expect(formatTimer(7503)).toBe('02:05:03')
    expect(formatTimer(0)).toBe('00:00:00')
  })
})

describe('formatHM', () => {
  it('shows h:mm and can blank zero', () => {
    expect(formatHM(90)).toBe('1:30')
    expect(formatHM(0, true)).toBe('')
    expect(formatHM(5)).toBe('0:05')
  })
})

describe('parseDuration', () => {
  it.each([
    ['1h 30m', 90],
    ['90m', 90],
    ['1:30', 90],
    ['1.5', 90],
    ['2h', 120],
    ['45 min', 45],
    ['', 0],
  ])('reads %s as %d minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes)
  })
  it('refuses nonsense and more than a day', () => {
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('25h')).toBeNull()
  })
})

describe('timerMinutes', () => {
  it('rounds to the nearest minute with a floor of 1', () => {
    const start = new Date('2026-10-01T04:30:00Z')
    expect(timerMinutes(start, new Date('2026-10-01T04:30:20Z'))).toBe(1)
    expect(timerMinutes(start, new Date('2026-10-01T05:15:40Z'))).toBe(46)
  })
})

describe('hoursDecimal', () => {
  it('gives two decimals', () => expect(hoursDecimal(125)).toBe('2.08'))
})

describe('isLongTimer', () => {
  // 10:00 IST on 7 Oct 2026.
  const start = new Date('2026-10-07T04:30:00Z')
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

  it('is false for a normal session on the same day', () => {
    expect(isLongTimer(start, after(90))).toBe(false)
    expect(isLongTimer(start, after(600))).toBe(false)
  })

  it('is true above 10 hours', () => {
    expect(isLongTimer(start, after(601))).toBe(true)
  })

  it('is true once the timer runs past IST midnight, even when short', () => {
    // 23:30 IST to 00:30 IST next day.
    const late = new Date('2026-10-07T18:00:00Z')
    expect(isLongTimer(late, new Date(late.getTime() + 60 * 60_000))).toBe(true)
  })
})

describe('dayRoom', () => {
  it('leaves what is left of 24 h, never below zero', () => {
    expect(dayRoom(0)).toBe(1440)
    expect(dayRoom(1200)).toBe(240)
    expect(dayRoom(1500)).toBe(0)
  })
})
