import { describe, expect, it } from 'vitest'
import { alertKey, alertTitle } from './alert-text'
import { callTodayReason, healthOf, healthScoreDay, THRESHOLDS, windowDays, type UsageRow } from './health'
import { mergeTimeline, usageDigest } from './timeline'

const TODAY = '2026-11-20'
const day = (back: number) => new Date(Date.UTC(2026, 10, 20 - back)).toISOString().slice(0, 10)
const users = (n: number, back: number, kind: UsageRow['kind'] = 'login'): UsageRow[] => Array.from({ length: n }, (_, i) => ({ day: day(back), kind, userId: `u${i}`, count: 1 }))
const many = (kind: UsageRow['kind'], count: number, back = 1): UsageRow[] => [{ day: day(back), kind, userId: 'u0', count }]
const attendanceDays = (n: number): UsageRow[] => Array.from({ length: n }, (_, i) => ({ day: day(i), kind: 'attendance_marked' as const, userId: 'hr', count: 4 }))

describe('health windows', () => {
  it('counts today and the days before it', () => {
    expect([...windowDays(TODAY, 3)]).toEqual(['2026-11-20', '2026-11-19', '2026-11-18'])
  })
})

describe('health signals (spec 7.3 thresholds)', () => {
  it('active people: 3+ people on 5 of the last 7 days', () => {
    const five = [0, 1, 2, 3, 4].flatMap((b) => users(3, b))
    expect(healthOf(five, TODAY).signals.activePeople).toEqual({ value: 5, target: 5, formed: true })
    const four = [0, 1, 2, 3].flatMap((b) => users(3, b))
    expect(healthOf(four, TODAY).signals.activePeople.formed).toBe(false)
    const twoPeople = [0, 1, 2, 3, 4, 5].flatMap((b) => users(2, b))
    expect(healthOf(twoPeople, TODAY).signals.activePeople.value).toBe(0)
    const outsideWeek = [7, 8, 9, 10, 11].flatMap((b) => users(3, b))
    expect(healthOf(outsideWeek, TODAY).signals.activePeople.value).toBe(0)
  })

  it('Muster: attendance on 10+ of the last 14 days', () => {
    expect(healthOf(attendanceDays(10), TODAY).signals.muster.formed).toBe(true)
    expect(healthOf(attendanceDays(9), TODAY).signals.muster).toEqual({ value: 9, target: THRESHOLDS.muster.days, formed: false })
  })

  it('Folio 5+ invoices, Work 20+ task moves, Orbit 10+ leads touched', () => {
    expect(healthOf(many('invoice_issued', 5), TODAY).signals.folio.formed).toBe(true)
    expect(healthOf(many('invoice_issued', 4), TODAY).signals.folio.formed).toBe(false)
    expect(healthOf([...many('task_created', 12), ...many('task_moved', 8, 3)], TODAY).signals.work.formed).toBe(true)
    expect(healthOf(many('task_moved', 19), TODAY).signals.work.formed).toBe(false)
    expect(healthOf(many('lead_touched', 10), TODAY).signals.orbit.formed).toBe(true)
    expect(healthOf(many('lead_touched', 10, 31), TODAY).signals.orbit.formed).toBe(false)
  })
})

describe('health score', () => {
  const habit = [0, 1, 2, 3, 4].flatMap((b) => users(3, b))
  it('is Green with active people and one product habit', () => {
    expect(healthOf([...habit, ...many('invoice_issued', 5)], TODAY).score).toBe('green')
  })
  it('is Amber with some use but no full habit', () => {
    expect(healthOf(habit, TODAY).score).toBe('amber')
    expect(healthOf(many('invoice_issued', 5, 20), TODAY).score).toBe('amber')
    expect(healthOf(users(1, 2), TODAY).score).toBe('amber')
  })
  it('is Red with nothing this week (limit hits and Upgrade clicks do not count as use)', () => {
    expect(healthOf([], TODAY).score).toBe('red')
    expect(healthOf(users(1, 10), TODAY).score).toBe('red')
    expect(healthOf(many('limit_hit', 3), TODAY).score).toBe('red')
  })
})

describe('Call today', () => {
  const base = { health: 'amber' as const, seats: 3, accountType: 'trial', daysLeft: null, inMetrics: true, live: true }
  it('lists Red accounts with more than 5 seats', () => {
    expect(callTodayReason({ ...base, health: 'red', seats: 6 })).toBe('red_big')
    expect(callTodayReason({ ...base, health: 'red', seats: 5 })).toBeNull()
  })
  it('uses the Console Free seats as the Red threshold when given', () => {
    expect(callTodayReason({ ...base, health: 'red', seats: 6, redSeats: 8 })).toBeNull()
    expect(callTodayReason({ ...base, health: 'red', seats: 9, redSeats: 8 })).toBe('red_big')
  })
  it('lists Free accounts in their last 30 days', () => {
    expect(callTodayReason({ ...base, accountType: 'free', daysLeft: 30 })).toBe('free_ending')
    expect(callTodayReason({ ...base, accountType: 'free', daysLeft: 31 })).toBeNull()
  })
  it('leaves out Internal, Test and dead workspaces', () => {
    expect(callTodayReason({ ...base, health: 'red', seats: 9, inMetrics: false })).toBeNull()
    expect(callTodayReason({ ...base, health: 'red', seats: 9, live: false })).toBeNull()
  })
})

describe('sales alerts', () => {
  it('words the alert and keys it once a day', () => {
    expect(alertTitle('upgrade_clicked', 'Acme')).toBe('Acme clicked Upgrade')
    expect(alertTitle('limit_hit', 'Acme', { limit: 'seats' })).toBe('Acme hit the Free plan’s 5 people')
    expect(alertTitle('limit_hit', 'Acme', { limit: 'mystery' })).toBe('Acme hit a plan limit')
    expect(alertKey('limit_hit', 'o1', '2026-11-20')).toBe('limit_hit:o1:2026-11-20')
  })
})

describe('account timeline', () => {
  it('folds a day of usage into one line, biggest first', () => {
    const [item] = usageDigest([{ day: '2026-11-19', kind: 'login', count: 3 }, { day: '2026-11-19', kind: 'task_moved', count: 14 }, { day: '2026-11-19', kind: 'login', count: 1 }])
    expect(item.title).toBe('14 tasks moved · 4 sign-ins')
    expect(item.kind).toBe('usage')
  })
  it('merges sources newest first and caps the list', () => {
    const a = { at: new Date('2026-11-01'), kind: 'signup' as const, title: 'signed up' }
    const b = { at: new Date('2026-11-05'), kind: 'payment' as const, title: 'paid' }
    const c = { at: new Date('2026-11-03'), kind: 'import' as const, title: 'imported' }
    expect(mergeTimeline([[a], [b, c]]).map((i) => i.title)).toEqual(['paid', 'imported', 'signed up'])
    expect(mergeTimeline([[a, b, c]], 2)).toHaveLength(2)
  })
})

describe('health is scored as of yesterday (R3 L-26b)', () => {
  it('ends every window on the last full IST day', () => {
    // Arrange
    const today = '2026-10-11'

    // Act
    const day = healthScoreDay(today)
    const week = windowDays(day, 7)

    // Assert
    expect(day).toBe('2026-10-10')
    expect(week.has('2026-10-11')).toBe(false)
    expect(week.has('2026-10-04')).toBe(true)
  })
})
