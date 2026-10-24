import { describe, expect, it } from 'vitest'
import { completion, healthDrivers, healthLevel, healthScore, projectHealth, ringShares, timeElapsed, timelineSummary } from './health'

const TODAY = '2026-10-01'
const counts = (total: number, completed: number, overdue = 0, blocked = 0, inProgress = 0) => ({ total, completed, overdue, blocked, inProgress })

describe('progress', () => {
  it('is completed / total, rounded', () => {
    expect(completion(counts(20, 15))).toBe(75)
    expect(completion(counts(3, 1))).toBe(33)
    expect(completion(counts(0, 0))).toBe(0)
  })

  it('splits the ring into done, in progress and blocked shares', () => {
    expect(ringShares(counts(10, 5, 0, 1, 3))).toEqual({ done: 50, inProgress: 30, blocked: 10 })
  })
})

describe('health score', () => {
  it('is neutral (75, on track) with no tasks', () => {
    expect(projectHealth(counts(0, 0), {}, TODAY)).toEqual({ score: 75, health: 'on_track' })
  })

  it('scores a finished project 100 (the reference bug scored it 70)', () => {
    expect(healthScore(counts(10, 10), {}, TODAY)).toBe(100)
  })

  it('scores the reference example (20 tasks, 15 done, 3 overdue, 1 blocked) as on track', () => {
    // 30 + 25.5 + 19 + 10 = 84.5 -> 85
    expect(healthScore(counts(20, 15, 3, 1), {}, TODAY)).toBe(85)
    expect(healthLevel(85)).toBe('on_track')
  })

  it('drops when the schedule is behind', () => {
    const dates = { startDate: '2026-09-01', endDate: '2026-10-11' }
    // 75% of time used, 10% done -> behind by 55 pts -> schedule 0
    const behind = healthScore(counts(10, 1), dates, TODAY)
    const onPace = healthScore(counts(10, 8), dates, TODAY)
    expect(behind).toBe(Math.round(4 + 30 + 20))
    expect(onPace).toBe(Math.round(32 + 30 + 20 + 10))
  })

  it('maps scores to levels at 80 and 60', () => {
    expect(healthLevel(80)).toBe('on_track')
    expect(healthLevel(79)).toBe('at_risk')
    expect(healthLevel(60)).toBe('at_risk')
    expect(healthLevel(59)).toBe('off_track')
  })

  it('goes off track with many overdue and blocked tasks', () => {
    expect(projectHealth(counts(10, 1, 6, 4), {}, TODAY).health).toBe('off_track')
  })
})

describe('timeline', () => {
  it('clamps elapsed time between 0 and 100', () => {
    expect(timeElapsed({ startDate: '2026-09-01', endDate: '2026-10-31' }, TODAY)).toBe(50)
    expect(timeElapsed({ startDate: '2026-11-01', endDate: '2026-12-01' }, TODAY)).toBe(0)
    expect(timeElapsed({ startDate: '2026-08-01', endDate: '2026-09-01' }, TODAY)).toBe(100)
    expect(timeElapsed({ startDate: '2026-08-01' }, TODAY)).toBeNull()
  })

  it('says how many days are left or over', () => {
    expect(timelineSummary({ startDate: '2026-09-01', endDate: '2026-10-13' }, TODAY)?.label).toBe('12 days left')
    expect(timelineSummary({ startDate: '2026-09-01', endDate: '2026-09-26' }, TODAY)?.label).toBe('5 days over')
    expect(timelineSummary({ startDate: '2026-09-01', endDate: TODAY }, TODAY)?.label).toBe('Due today')
  })

  it('describes the drivers in words', () => {
    expect(healthDrivers(counts(10, 4, 3, 1), { startDate: '2026-09-01', endDate: '2026-10-31' }, TODAY)).toEqual(['3 overdue tasks', '1 blocked', '50% of time used, 40% done'])
  })
})
