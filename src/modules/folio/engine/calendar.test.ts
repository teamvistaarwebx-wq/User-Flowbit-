import { describe, expect, test } from 'vitest'
import { addDays, daysInMonth, isIsoDate, makeIsoDate, parseIsoDate, toIsoDate } from './calendar'

describe('isIsoDate', () => {
  test('accepts a real calendar date', () => {
    expect(isIsoDate('2026-10-01')).toBe(true)
  })

  test('rejects other shapes and impossible dates', () => {
    expect(isIsoDate('01-10-2026')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})

describe('parseIsoDate / toIsoDate', () => {
  test('parses to a UTC midnight', () => {
    expect(parseIsoDate('2026-10-01').toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  test('round-trips without shifting the day', () => {
    expect(toIsoDate(parseIsoDate('2027-03-31'))).toBe('2027-03-31')
  })

  test('throws on a malformed date', () => {
    expect(() => parseIsoDate('nope')).toThrow()
  })
})

describe('daysInMonth', () => {
  test('knows month lengths, including leap February', () => {
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
  })
})

describe('makeIsoDate / addDays', () => {
  test('builds a padded date', () => {
    expect(makeIsoDate(2026, 4, 1)).toBe('2026-04-01')
  })

  test('adds days across a month and a year end', () => {
    expect(addDays('2026-10-25', 10)).toBe('2026-11-04')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })
})

describe('isIsoDate strictness', () => {
  test('refuses dates that do not exist', () => {
    expect(isIsoDate('2026-99-99')).toBe(false)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('abc')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true)
  })
})
