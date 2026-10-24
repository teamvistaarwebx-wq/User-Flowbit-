import { describe, expect, it } from 'vitest'
import { parseWhen } from '@/modules/mcp/dates'
import { parseQuickAdd } from './quick-parse'
import { dueDateFor, matchTime } from './quick-parse-dates'

// Wednesday 7 Oct 2026, 14:00 IST.
const NOW = new Date('2026-10-07T08:30:00Z')

describe('matchTime: raat / night (R3 M3)', () => {
  it.each([
    ['raat 12 baje', '00:00', true],
    ['raat 1 baje', '01:00', true],
    ['raat 2 baje', '02:00', true],
    ['raat 3 baje', '03:00', true],
    ['raat 4 baje', '04:00', true],
    ['night 1 baje', '01:00', true],
    ['1 baje raat', '01:00', true],
    ['raat 12am', '00:00', true],
    ['raat 9 baje', '21:00', false],
    ['raat 11 baje', '23:00', false],
    ['midnight', '00:00', true],
    ['12 midnight', '00:00', true],
  ])('reads "%s" as %s (next day: %s)', (text, time, nextDay) => {
    // Arrange
    const words = text.split(' ')

    // Act
    const hit = matchTime(words, 0)

    // Assert
    expect(hit).toEqual({ used: words.length, time, ...(nextDay ? { nextDay: true } : {}) })
  })

  it('keeps the evening reading for shaam and a bare hour', () => {
    expect(matchTime(['shaam', '6', 'baje'], 0)).toEqual({ used: 3, time: '18:00' })
    expect(matchTime(['5', 'baje'], 0)).toEqual({ used: 2, time: '17:00' })
    expect(matchTime(['12', 'baje'], 0)).toEqual({ used: 2, time: '12:00' })
  })
})

describe('dueDateFor', () => {
  it('moves a small-hours night time to the day after an explicit date', () => {
    expect(dueDateFor('2026-10-08', { used: 3, time: '01:00', nextDay: true }, NOW)).toBe('2026-10-09')
  })

  it('keeps an explicit date for an ordinary time', () => {
    expect(dueDateFor('2026-10-08', { used: 2, time: '17:00' }, NOW)).toBe('2026-10-08')
  })

  it('uses the next time it comes round when there is no date', () => {
    expect(dueDateFor(null, { used: 3, time: '01:00', nextDay: true }, NOW)).toBe('2026-10-08')
  })
})

describe('parseWhen: Hinglish night times (R3 M3)', () => {
  it.each([
    ['raat 12 baje', '2026-10-08', '00:00'],
    ['raat 1 baje', '2026-10-08', '01:00'],
    ['raat 3 baje', '2026-10-08', '03:00'],
    ['aaj raat 12 baje', '2026-10-08', '00:00'],
    ['aaj raat 2 baje', '2026-10-08', '02:00'],
    ['kal raat 1 baje', '2026-10-09', '01:00'],
    ['kal raat 9 baje', '2026-10-08', '21:00'],
    ['tonight 1 baje', '2026-10-08', '01:00'],
    ['midnight', '2026-10-08', '00:00'],
    ['kal midnight', '2026-10-09', '00:00'],
  ])('"%s" → %s %s', (text, date, time) => {
    expect(parseWhen(text, NOW)).toMatchObject({ date, time })
  })
})

describe('parseQuickAdd: Hinglish night times (R3 M3)', () => {
  it.each([
    ['call raat 12 baje', '2026-10-08', '00:00'],
    ['call raat 1 baje', '2026-10-08', '01:00'],
    ['call kal raat 1 baje', '2026-10-09', '01:00'],
    ['call aaj raat 2 baje', '2026-10-08', '02:00'],
    ['call kal raat 9 baje', '2026-10-08', '21:00'],
    ['call midnight', '2026-10-08', '00:00'],
  ])('"%s" → %s %s', (text, date, time) => {
    const r = parseQuickAdd(text, undefined, NOW)
    expect(r).toMatchObject({ dueDate: date, dueTime: time, title: 'call' })
  })
})
