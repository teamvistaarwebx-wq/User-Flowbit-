import { describe, expect, it } from 'vitest'
import { istInstant } from '@/lib/dates'
import { DEFAULT_QUIET_HOURS } from './preferences'
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, isQuietAt, nextDigestAt, nextRetryAt, planEmail, quietEndsAt, snoozeUntil } from './timing'

const at = (date: string, time: string) => istInstant(date, time)
const plain = { urgent: false, emailMode: 'instant' as const }
const comments = { urgent: false, emailMode: 'hourly' as const }

describe('quiet hours (default 21:00–08:00 IST)', () => {
  it('wraps past midnight', () => {
    expect(isQuietAt(at('2026-10-08', '20:59'), DEFAULT_QUIET_HOURS)).toBe(false)
    expect(isQuietAt(at('2026-10-08', '21:00'), DEFAULT_QUIET_HOURS)).toBe(true)
    expect(isQuietAt(at('2026-10-09', '02:00'), DEFAULT_QUIET_HOURS)).toBe(true)
    expect(isQuietAt(at('2026-10-09', '08:00'), DEFAULT_QUIET_HOURS)).toBe(false)
  })

  it('supports a same-day window and ignores a disabled or empty one', () => {
    const lunch = { enabled: true, start: '13:00', end: '14:00' }
    expect(isQuietAt(at('2026-10-08', '13:30'), lunch)).toBe(true)
    expect(isQuietAt(at('2026-10-08', '14:30'), lunch)).toBe(false)
    expect(isQuietAt(at('2026-10-08', '23:00'), { ...DEFAULT_QUIET_HOURS, enabled: false })).toBe(false)
    expect(isQuietAt(at('2026-10-08', '10:00'), { enabled: true, start: '10:00', end: '10:00' })).toBe(false)
  })

  it('ends the next morning at 08:00 for a late-evening instant, the same morning after midnight', () => {
    expect(quietEndsAt(at('2026-10-08', '22:15'), DEFAULT_QUIET_HOURS)).toEqual(at('2026-10-09', '08:00'))
    expect(quietEndsAt(at('2026-10-09', '01:00'), DEFAULT_QUIET_HOURS)).toEqual(at('2026-10-09', '08:00'))
  })
})

describe('digest slots', () => {
  it('hourly goes out at the next top of the hour', () => {
    expect(nextDigestAt(at('2026-10-08', '10:20'), 'hourly')).toEqual(at('2026-10-08', '11:00'))
    expect(nextDigestAt(at('2026-10-08', '11:00'), 'hourly')).toEqual(at('2026-10-08', '12:00'))
  })

  it('end-of-day goes out at 18:00 IST, or tomorrow once that has passed', () => {
    expect(nextDigestAt(at('2026-10-08', '09:00'), 'daily')).toEqual(at('2026-10-08', '18:00'))
    expect(nextDigestAt(at('2026-10-08', '18:30'), 'daily')).toEqual(at('2026-10-09', '18:00'))
  })
})

describe('planEmail', () => {
  const base = { digest: 'off' as const, quiet: DEFAULT_QUIET_HOURS, snoozeUntil: null }

  it('sends now during the day', () => {
    expect(planEmail({ ...base, now: at('2026-10-08', '11:00'), group: plain })).toEqual({ kind: 'now' })
  })

  it('holds an email that arrives in quiet hours until they end, batched', () => {
    expect(planEmail({ ...base, now: at('2026-10-08', '23:00'), group: plain })).toEqual({ kind: 'digest', at: at('2026-10-09', '08:00'), reason: 'quiet_hours' })
  })

  it('batches comments hourly even when the person has no digest', () => {
    expect(planEmail({ ...base, now: at('2026-10-08', '10:10'), group: comments })).toEqual({ kind: 'digest', at: at('2026-10-08', '11:00'), reason: 'digest' })
  })

  it('moves a digest slot that lands in quiet hours to the morning', () => {
    expect(planEmail({ ...base, now: at('2026-10-08', '20:30'), group: comments })).toEqual({ kind: 'digest', at: at('2026-10-09', '08:00'), reason: 'digest' })
  })

  it('batches every non-urgent email into the end-of-day digest when chosen', () => {
    expect(planEmail({ ...base, digest: 'daily', now: at('2026-10-08', '10:00'), group: plain })).toEqual({ kind: 'digest', at: at('2026-10-08', '18:00'), reason: 'digest' })
  })

  it('skips while snoozed, but urgent mail always goes now', () => {
    const snoozed = { ...base, snoozeUntil: at('2026-10-08', '12:00'), now: at('2026-10-08', '11:00') }
    expect(planEmail({ ...snoozed, group: plain })).toEqual({ kind: 'skip', reason: 'snoozed' })
    expect(planEmail({ ...snoozed, group: { urgent: true, emailMode: 'instant' } })).toEqual({ kind: 'now' })
    expect(planEmail({ ...base, now: at('2026-10-08', '23:30'), group: { urgent: true, emailMode: 'instant' } })).toEqual({ kind: 'now' })
  })

  it('ignores quiet hours when they do not apply to the person', () => {
    expect(planEmail({ ...base, quiet: null, now: at('2026-10-08', '23:00'), group: plain })).toEqual({ kind: 'now' })
  })
})

describe('retry backoff', () => {
  const now = new Date('2026-10-08T05:00:00Z')

  it('retries after 1 m, 5 m, 30 m and 2 h, then gives up', () => {
    expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000])
    expect(nextRetryAt(1, now)).toEqual(new Date(now.getTime() + 60_000))
    expect(nextRetryAt(2, now)).toEqual(new Date(now.getTime() + 300_000))
    expect(nextRetryAt(3, now)).toEqual(new Date(now.getTime() + 1_800_000))
    expect(nextRetryAt(4, now)).toEqual(new Date(now.getTime() + 7_200_000))
    expect(nextRetryAt(5, now)).toBeNull()
    expect(MAX_ATTEMPTS).toBe(5)
  })

  it('has no retry before any attempt', () => {
    expect(nextRetryAt(0, now)).toBeNull()
  })
})

describe('snoozeUntil', () => {
  const now = at('2026-10-08', '10:00')
  it('covers an hour, the rest of today, or until a date', () => {
    expect(snoozeUntil('1h', now)).toEqual(at('2026-10-08', '11:00'))
    expect(snoozeUntil('today', now)).toEqual(at('2026-10-09', '00:00'))
    expect(snoozeUntil('date', now, '2026-10-12')).toEqual(at('2026-10-12', '00:00'))
    expect(() => snoozeUntil('date', now, 'soon')).toThrow()
  })
})
