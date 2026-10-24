import { describe, expect, it } from 'vitest'
import { addDays, dayBoundsIST, daysBetween, formatWorkWeek, fiscalYear, formatDate, formatDateTime, formatDuration, greeting, isoDateIST, istInstant, minutesOfDayIST, monthRange, shiftMonth, startOfWeek, weekday, workingDaysBetween } from './dates'

describe('dates (Asia/Kolkata)', () => {
  it('takes the IST calendar date of an instant', () => {
    expect(isoDateIST(new Date('2026-10-01T19:00:00Z'))).toBe('2026-10-02')
    expect(isoDateIST(new Date('2026-10-01T18:00:00Z'))).toBe('2026-10-01')
  })

  it('round-trips IST wall-clock times', () => {
    const at = istInstant('2026-10-01', '10:30')
    expect(at.toISOString()).toBe('2026-10-01T05:00:00.000Z')
    expect(minutesOfDayIST(at)).toBe(630)
  })

  it('formats like "20 Jul 2026"', () => {
    expect(formatDate('2026-07-20')).toBe('20 Jul 2026')
    expect(formatDate('2026-07-20', { withWeekday: true })).toBe('Mon, 20 Jul 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('2026-10-01T20:08:00.000Z')).toBe('2 Oct 2026')
    expect(formatDate('not-a-dateTx')).toBe('—')
    expect(formatDateTime(new Date('2026-07-20T10:15:00Z'))).toBe('20 Jul 2026, 3:45 pm')
  })

  it('does date-only arithmetic across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
    expect(weekday('2026-10-01')).toBe(4)
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28')
  })

  it('gives month ranges and shifts', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28', days: 28 })
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('counts working days with a Mon-Sat week and holidays', () => {
    expect(workingDaysBetween('2026-10-01', '2026-10-07')).toBe(6)
    expect(workingDaysBetween('2026-10-01', '2026-10-07', [1, 2, 3, 4, 5])).toBe(5)
    expect(workingDaysBetween('2026-10-01', '2026-10-07', [1, 2, 3, 4, 5, 6], ['2026-10-02'])).toBe(5)
    expect(workingDaysBetween('2026-10-07', '2026-10-01')).toBe(0)
  })

  it('names the Indian fiscal year', () => {
    expect(fiscalYear('2026-10-01')).toBe('2026-27')
    expect(fiscalYear('2027-03-31')).toBe('2026-27')
    expect(fiscalYear('2027-04-01')).toBe('2027-28')
  })

  it('greets by IST hour and formats durations', () => {
    expect(greeting(istInstant('2026-10-01', '09:00'))).toBe('Good morning')
    expect(greeting(istInstant('2026-10-01', '14:00'))).toBe('Good afternoon')
    expect(greeting(istInstant('2026-10-01', '20:00'))).toBe('Good evening')
    expect(formatDuration(173)).toBe('2h 53m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(120)).toBe('2h')
  })
})

describe('work week and IST day bounds', () => {
  it('formats workWeek in getDay numbering (0 = Sunday)', () => {
    expect(formatWorkWeek([1, 2, 3, 4, 5, 6])).toBe('Mon–Sat')
    expect(formatWorkWeek([1, 2, 3, 4, 5])).toBe('Mon–Fri')
    expect(formatWorkWeek([1, 3, 5])).toBe('Mon, Wed, Fri')
    expect(formatWorkWeek([0, 6])).toBe('Sat, Sun')
  })

  it('gives IST midnight to midnight as instants', () => {
    const { start, end } = dayBoundsIST('2026-10-01')
    expect(start.toISOString()).toBe('2026-09-30T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-10-01T18:30:00.000Z')
  })
})

describe('formatDate with a locale (R2 18.3)', () => {
  it('keeps the English form without a locale', () => {
    // Arrange, Act
    const text = formatDate('2026-10-10', { withWeekday: true })

    // Assert
    expect(text).toBe('Sat, 10 Oct 2026')
  })

  it('prints Hindi month and weekday names for hi-IN, on the IST day', () => {
    // Arrange
    const lateEveningUtc = new Date('2026-10-09T20:00:00Z') // 10 Oct, 01:30 IST

    // Act
    const text = formatDate(lateEveningUtc, { withWeekday: true, locale: 'hi-IN' })

    // Assert
    expect(text).toContain('शनि')
    expect(text).toContain('10')
    expect(text).toContain('2026')
    expect(text).not.toContain('Oct')
  })

  it('drops the year for the short form', () => {
    // Arrange, Act
    const text = formatDate('2026-10-10', { short: true, locale: 'hi-IN' })

    // Assert
    expect(text).not.toContain('2026')
  })
})
