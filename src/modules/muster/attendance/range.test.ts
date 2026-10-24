import { describe, expect, it } from 'vitest'
import { istInstant } from '@/lib/dates'
import { checkInCurve, minusMonths, presentSeries, resolveRange, tallyCells } from './range'
import type { Cell } from './register'

const TODAY = '2026-10-02'
const cell = (date: string, status: Cell['status']): Cell => ({ date, status, pay: 1, source: 'override' })

describe('resolveRange', () => {
  it('maps the presets to trailing windows ending today', () => {
    expect(resolveRange({ range: 'today' }, TODAY)).toMatchObject({ start: TODAY, end: TODAY, bucket: 'hour' })
    expect(resolveRange({ range: '1m' }, TODAY)).toMatchObject({ start: '2026-09-03', end: TODAY, bucket: 'day' })
    expect(resolveRange({ range: '6m' }, TODAY)).toMatchObject({ start: '2026-04-03', bucket: 'week' })
    expect(resolveRange({ range: '1y' }, TODAY)).toMatchObject({ start: '2025-10-03', bucket: 'week' })
  })

  it('falls back to one month for an unknown range', () => {
    expect(resolveRange({ range: 'forever' }, TODAY)).toMatchObject({ key: '1m', start: '2026-09-03' })
  })

  it('reads a custom range, swapping reversed dates and stopping at today', () => {
    expect(resolveRange({ range: 'custom', from: '2026-09-30', to: '2026-09-01' }, TODAY)).toMatchObject({ start: '2026-09-01', end: '2026-09-30', bucket: 'day' })
    const future = resolveRange({ range: 'custom', from: '2026-09-15', to: '2026-12-31' }, TODAY)
    expect(future).toMatchObject({ end: TODAY })
    expect(future.problem).toContain('stops today')
  })

  it('caps a custom range at 366 days and picks a coarser bucket for long ranges', () => {
    const r = resolveRange({ range: 'custom', from: '2024-01-01', to: '2026-09-30' }, TODAY)
    expect(r.start).toBe('2025-09-30')
    expect(r.bucket).toBe('month')
    expect(r.problem).toContain('at most 366 days')
    expect(resolveRange({ range: 'custom', from: '2026-06-01', to: '2026-09-30' }, TODAY).bucket).toBe('week')
  })

  it('asks for both dates when a custom range is incomplete or not a real date', () => {
    expect(resolveRange({ range: 'custom', from: '2026-02-30', to: '2026-03-10' }, TODAY).problem).toContain('Pick a start')
  })
})

describe('minusMonths', () => {
  it('clamps to the end of shorter months, including leap years', () => {
    expect(minusMonths('2026-03-31', 1)).toBe('2026-02-28')
    expect(minusMonths('2024-03-31', 1)).toBe('2024-02-29')
    expect(minusMonths('2026-01-15', 3)).toBe('2025-10-15')
  })
})

describe('tallyCells', () => {
  it('counts working person-days only and half days as half attended', () => {
    const t = tallyCells([
      cell('2026-09-01', 'present'),
      cell('2026-09-01', 'late'),
      cell('2026-09-01', 'work_from_home'),
      cell('2026-09-01', 'absent'),
      cell('2026-09-01', 'sick_leave'),
      cell('2026-09-01', 'half_day'),
      cell('2026-09-06', 'weekoff'),
      cell('2026-09-02', 'na'),
      cell('2026-10-05', 'upcoming'),
    ])
    expect(t).toMatchObject({ personDays: 6, present: 1, late: 1, wfh: 1, absent: 1, onLeave: 1, halfDays: 1 })
    expect(t.presentPct).toBe(58.3)
  })

  it('returns zero, not NaN, when nothing counts', () => {
    expect(tallyCells([cell('2026-09-06', 'weekoff')]).presentPct).toBe(0)
  })
})

describe('presentSeries', () => {
  it('groups by week from Monday and skips days with no working day', () => {
    const rows = [
      { cells: [cell('2026-09-28', 'present'), cell('2026-09-29', 'absent'), cell('2026-10-04', 'weekoff'), cell('2026-10-05', 'present')] },
      { cells: [cell('2026-09-28', 'present'), cell('2026-09-29', 'present'), cell('2026-10-04', 'weekoff'), cell('2026-10-05', 'absent')] },
    ]
    expect(presentSeries(rows, 'week')).toEqual([{ label: '28 Sep', value: 75 }, { label: '5 Oct', value: 50 }])
    expect(presentSeries(rows, 'day').map((p) => p.label)).toEqual(['28 Sep', '29 Sep', '5 Oct'])
    expect(presentSeries(rows, 'month')).toEqual([{ label: 'Sep 26', value: 75 }, { label: 'Oct 26', value: 50 }])
  })
})

describe('checkInCurve', () => {
  it('counts people in by each hour, up to now', () => {
    const firstIns = ['09:40', '09:58', '10:20', '11:05'].map((t) => istInstant(TODAY, t))
    const points = checkInCurve(firstIns, { start: '10:00', end: '19:00' }, istInstant(TODAY, '11:30'))
    expect(points.map((p) => p.label)).toEqual(['8 am', '9 am', '10 am', '11 am', '12 pm'])
    expect(points.map((p) => p.value)).toEqual([0, 0, 2, 3, 4])
  })
})
