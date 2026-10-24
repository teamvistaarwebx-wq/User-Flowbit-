import { describe, expect, it } from 'vitest'
import { canEditDay, dayFormRows, dayTotal, initialDay, type WeekRow } from './day-form'

const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
const rows: WeekRow[] = [
  { key: 'task:1', label: 'Fix login', taskId: '1', days: { '2026-10-05': 90, '2026-10-07': 30 } },
  { key: 'project:2', label: 'Website', sub: 'WEB', days: { '2026-10-07': 120 } },
]

describe('initialDay', () => {
  it('opens on today when today is in the week', () => {
    expect(initialDay(days, '2026-10-07')).toBe('2026-10-07')
  })

  it('opens on the first day for a past or future week', () => {
    expect(initialDay(days, '2026-10-20')).toBe('2026-10-05')
    expect(initialDay(days, '2026-09-01')).toBe('2026-10-05')
  })

  it('falls back to today for an empty week', () => {
    expect(initialDay([], '2026-10-07')).toBe('2026-10-07')
  })
})

describe('dayFormRows', () => {
  it('maps every row to its minutes on the day, zero when nothing is logged', () => {
    expect(dayFormRows(rows, '2026-10-05')).toEqual([
      { key: 'task:1', label: 'Fix login', sub: undefined, taskId: '1', minutes: 90 },
      { key: 'project:2', label: 'Website', sub: 'WEB', taskId: undefined, minutes: 0 },
    ])
  })

  it('does not change the input rows', () => {
    const before = JSON.stringify(rows)
    dayFormRows(rows, '2026-10-07')
    expect(JSON.stringify(rows)).toBe(before)
  })
})

describe('dayTotal', () => {
  it('adds the day across rows', () => {
    expect(dayTotal(rows, '2026-10-07')).toBe(150)
    expect(dayTotal(rows, '2026-10-11')).toBe(0)
  })
})

describe('canEditDay', () => {
  it('allows past days and today on an editable sheet', () => {
    expect(canEditDay(true, '2026-10-06', '2026-10-07', 0)).toBe(true)
    expect(canEditDay(true, '2026-10-07', '2026-10-07', 0)).toBe(true)
  })

  it('blocks empty future days but keeps future days that already have time', () => {
    expect(canEditDay(true, '2026-10-09', '2026-10-07', 0)).toBe(false)
    expect(canEditDay(true, '2026-10-09', '2026-10-07', 30)).toBe(true)
  })

  it('blocks everything on a read-only sheet', () => {
    expect(canEditDay(false, '2026-10-06', '2026-10-07', 30)).toBe(false)
  })
})
