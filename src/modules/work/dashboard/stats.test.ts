import { describe, expect, it } from 'vitest'
import { addDays, istInstant } from '@/lib/dates'
import { cellsAttendance, monthAttendance } from './attendance'
import { currentCounts, dailySeries, fromStatGroups, percentChange, rollingDelta, snapshotDelta, statGroupStage, statWindow, type StatGroupRow, type StatTask } from './stats'

const TODAY = '2026-10-01'

describe('dailySeries', () => {
  const tasks = [
    { status: 'done', completedAt: istInstant('2026-09-30', '15:00'), startedAt: istInstant('2026-09-28', '11:00') },
    { status: 'in_progress', startedAt: istInstant('2026-09-29', '10:00') },
    { status: 'todo', dueDate: '2026-09-29' },
  ]
  const s = dailySeries(tasks, TODAY, 5)

  it('counts completions on the IST day they happened', () => {
    expect(s.completed).toEqual([0, 0, 0, 1, 0])
  })

  it('counts a task in progress from its start until completion', () => {
    // 27, 28, 29, 30 Sep, 1 Oct
    expect(s.inProgress).toEqual([0, 1, 2, 1, 1])
  })

  it('counts open tasks as overdue from the day after their due date', () => {
    expect(s.overdue).toEqual([0, 0, 0, 1, 1])
  })
})

describe('deltas', () => {
  it('uses max(then, 1) as the base', () => {
    expect(percentChange(4, 0)).toBe(400)
    expect(percentChange(3, 4)).toBe(-25)
  })

  it('compares today with 7 days ago, or two rolling weeks', () => {
    expect(snapshotDelta([2, 0, 0, 0, 0, 0, 0, 3])).toBe(50)
    expect(snapshotDelta([1, 2])).toBeNull()
    expect(rollingDelta([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2])).toBe(100)
  })
})

describe('currentCounts', () => {
  it('counts in review as in progress and only last-7-day completions', () => {
    const c = currentCounts(
      [
        { status: 'in_review' },
        { status: 'in_progress' },
        { status: 'todo', dueDate: '2026-09-20' },
        { status: 'done', dueDate: '2026-09-20', completedAt: istInstant('2026-09-28') },
        { status: 'done', completedAt: istInstant('2026-09-01') },
      ],
      TODAY,
    )
    expect(c).toEqual({ inProgress: 2, overdue: 1, completed: 1 })
  })
})

describe('currentCounts window', () => {
  it('counts completions in the same 7 calendar days as the sparkline', () => {
    // 25 Sep 17:15 is outside 26 Sep-2 Oct even though it is within 7×24 h of 2 Oct 10:00.
    const tasks = [{ status: 'done', completedAt: istInstant('2026-09-25', '17:15') }, { status: 'done', completedAt: istInstant('2026-09-26', '09:00') }]
    const c = currentCounts(tasks, '2026-10-02')
    const s = dailySeries(tasks, '2026-10-02')
    expect(c.completed).toBe(1)
    expect(s.completed.slice(-7).reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('weighted rows', () => {
  it('counts a row with n as n tasks', () => {
    const one = { status: 'in_progress', dueDate: '2026-09-20', startedAt: istInstant('2026-09-29') }
    const c = currentCounts([{ ...one, n: 3 }], TODAY)
    const s = dailySeries([{ ...one, n: 3 }], TODAY, 3)
    expect(c).toEqual({ inProgress: 3, overdue: 3, completed: 0 })
    expect(s.inProgress).toEqual([3, 3, 3])
    expect(s).toEqual(dailySeries([one, one, one], TODAY, 3))
  })
})

describe('grouped stats (statGroupStage)', () => {
  const span = statWindow(TODAY)

  /** JS mirror of statGroupStage's grouping, to check that grouping never changes a number. */
  const bucket = (v: Date | null) => {
    if (!(v instanceof Date)) return null
    const i = span.bounds.findIndex((b) => v < b)
    return i === -1 ? span.bounds.length - 1 : i - 1
  }
  const dueKey = (d: string | null) => (typeof d !== 'string' || d === '' ? null : d < span.first ? addDays(span.first, -1) : d >= TODAY ? TODAY : d)
  function group(tasks: { status: string; dueDate: string | null; completedAt: Date | null; startedAt: Date | null }[]): StatGroupRow[] {
    const rows = new Map<string, StatGroupRow>()
    for (const t of tasks) {
      const _id = { status: t.status, due: dueKey(t.dueDate), done: bucket(t.completedAt), started: bucket(t.startedAt) }
      const key = JSON.stringify(_id)
      const row = rows.get(key) ?? { _id, n: 0 }
      row.n += 1
      rows.set(key, row)
    }
    return [...rows.values()]
  }

  // Every edge: before, inside and after the window, exactly on and 1 ms around each boundary, and missing values.
  const instants: (Date | null)[] = [null]
  for (let d = -25; d <= 3; d++) for (const time of ['00:00', '09:30', '23:59']) instants.push(istInstant(addDays(TODAY, d), time))
  for (const b of span.bounds) instants.push(b, new Date(b.getTime() - 1), new Date(b.getTime() + 1))
  const dues: (string | null)[] = [null, '']
  for (let d = -25; d <= 3; d++) dues.push(addDays(TODAY, d))
  const statuses = ['todo', 'in_progress', 'in_review', 'blocked', 'done']

  let seed = 7
  const pick = <T,>(list: T[]) => list[(seed = (seed * 1103515245 + 12345) % 2147483648) % list.length]
  const tasks = Array.from({ length: 600 }, () => ({ status: pick(statuses), dueDate: pick(dues), completedAt: pick(instants), startedAt: pick(instants) }))
  const grouped = fromStatGroups(group(tasks), span)

  it('gives the same series and counts as the tasks themselves', () => {
    expect(grouped.length).toBeLessThan(tasks.length)
    expect(dailySeries(grouped, TODAY)).toEqual(dailySeries(tasks as StatTask[], TODAY))
    expect(currentCounts(grouped, TODAY)).toEqual(currentCounts(tasks as StatTask[], TODAY))
  })

  it('buckets dates by the same boundaries the stats use', () => {
    expect(span.bounds).toHaveLength(15)
    expect(span.bounds[0]).toEqual(istInstant(span.first))
    expect(span.bounds[14]).toEqual(istInstant(addDays(TODAY, 1)))
    const done = statGroupStage(span).$group._id.done as { $cond: [unknown, { $switch: { branches: { then: number }[]; default: number } }, null] }
    expect(done.$cond[1].$switch.branches.map((b) => b.then)).toEqual(Array.from({ length: 15 }, (_, i) => i - 1))
    expect(done.$cond[1].$switch.default).toBe(14)
  })
})

describe('monthAttendance', () => {
  const MON_SAT = [1, 2, 3, 4, 5, 6]
  it('derives absent days, skips today without a record and splits late from half day', () => {
    const rows = [
      { date: '2026-09-28', status: 'present', firstIn: istInstant('2026-09-28', '09:50') },
      { date: '2026-09-29', status: 'late', firstIn: istInstant('2026-09-29', '10:40') },
      { date: '2026-09-25', status: 'half_day', firstIn: istInstant('2026-09-25', '09:55') },
      { date: '2026-09-24', status: 'leave' },
    ]
    const m = monthAttendance(rows, '2026-09', '2026-09-30', MON_SAT)
    // Mon-Sat working days 1-29 Sep 2026 = 25 (30 Sep is today with no record); 1 leave -> 24 counted
    expect(m.leave).toBe(1)
    expect(m.onTime).toBe(1)
    expect(m.late).toBe(1)
    expect(m.halfDay).toBe(1)
    expect(m.base).toBe(24)
    expect(m.absent).toBe(21)
    expect(m.marks['2026-09-30']).toBeUndefined()
    expect(m.marks['2026-09-27']).toBeUndefined()
    expect(m.marks['2026-09-28']).toEqual({ tone: 'success', label: 'On time' })
  })

  it('is empty for future months', () => {
    expect(monthAttendance([], '2026-11', TODAY, MON_SAT).base).toBe(0)
  })

  it('leaves days before the member joined blank', () => {
    const m = monthAttendance([], '2026-10', '2026-10-03', MON_SAT, '2026-10-03')
    expect(m.absent).toBe(0)
    expect(m.marks).toEqual({})
  })

  it('does not count work from home, sick leave or a paid half day as absent', () => {
    const rows = [
      { date: '2026-10-01', status: 'work_from_home', firstIn: istInstant('2026-10-01', '09:50') },
      { date: '2026-10-02', status: 'sick_leave' },
      { date: '2026-10-03', status: 'paid_half_day', firstIn: istInstant('2026-10-03', '09:55') },
    ]
    const m = monthAttendance(rows, '2026-10', '2026-10-04', MON_SAT)
    expect(m).toMatchObject({ onTime: 1, leave: 1, halfDay: 1, absent: 0, base: 2 })
    expect(m.marks['2026-10-01']).toEqual({ tone: 'success', label: 'Work from home' })
  })
})

describe('cellsAttendance', () => {
  it('counts recorded days like My attendance and shows assumed days without counting them', () => {
    const m = cellsAttendance(
      [
        { date: '2026-10-01', status: 'present', pay: 1, source: 'policy', assumed: true },
        { date: '2026-10-02', status: 'holiday', pay: 1, source: 'calendar', note: 'Gandhi Jayanti' },
        { date: '2026-10-03', status: 'half_day', pay: 0.5, source: 'punch' },
        { date: '2026-10-05', status: 'upcoming', pay: 0, source: 'none' },
      ],
      '2026-10',
      '2026-10-03',
    )
    expect(m).toMatchObject({ onTime: 0, halfDay: 1, absent: 0, base: 1 })
    expect(m.marks['2026-10-01'].label).toBe('Present (not marked yet)')
    expect(m.marks['2026-10-02'].label).toBe('Gandhi Jayanti')
    expect(m.marks['2026-10-05']).toBeUndefined()
  })
})
