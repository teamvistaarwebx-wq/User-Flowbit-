import { describe, expect, it } from 'vitest'
import { checkAttendanceRows, importSummary, mapColumns, parseStatus, type ImportContext } from './import'

const ctx: ImportContext = {
  employees: new Map([
    ['vw-0001', { id: 'e1', code: 'VW-0001', name: 'Aditi Sharma', joinDate: '2021-09-06' }],
    ['vw-0019', { id: 'e2', code: 'VW-0019', name: 'Siddharth Rao', joinDate: '2026-08-17' }],
    ['vw-0013', { id: 'e3', code: 'VW-0013', name: 'Manish Yadav', joinDate: '2024-01-08', exitDate: '2026-09-15' }],
  ]),
  lockedMonths: new Set(['2026-09']),
  today: '2026-10-02',
}
const { columns } = mapColumns(['code', 'date', 'status', 'in', 'out', 'note'])
const row = (line: number, values: Record<string, string>) => ({ line, values: { code: '', date: '', status: '', in: '', out: '', note: '', ...values } })
const check = (...rows: ReturnType<typeof row>[]) => checkAttendanceRows(rows, columns, ctx)

describe('mapColumns', () => {
  it('accepts common header names and reports the rest', () => {
    const m = mapColumns(['employee_code', 'date', 'remarks', 'check_in', 'shift'])
    expect(m.columns).toMatchObject({ code: 'employee_code', note: 'remarks', in: 'check_in' })
    expect(m.ignored).toEqual(['shift'])
    expect(mapColumns(['status']).missing).toEqual(['code', 'date'])
  })
})

describe('parseStatus', () => {
  it('reads the short codes HR uses', () => {
    expect(parseStatus('P')).toBe('present')
    expect(parseStatus('wfh')).toBe('work_from_home')
    expect(parseStatus('Sick leave')).toBe('sick_leave')
    expect(parseStatus('HD')).toBe('paid_half_day')
    expect(parseStatus('UHD')).toBe('half_day')
    expect(parseStatus('xyz')).toBeNull()
  })
})

describe('checkAttendanceRows', () => {
  it('accepts a valid row and keeps the times', () => {
    const [r] = check(row(2, { code: 'vw-0001', date: '2026-10-01', status: 'P', in: '9:55', out: '19:05' }))
    expect(r.errors).toEqual([])
    expect(r.record).toEqual({ employeeId: 'e1', date: '2026-10-01', status: 'present', in: '09:55', out: '19:05', note: undefined })
  })

  it('works out the status from the times when it is blank', () => {
    expect(check(row(2, { code: 'VW-0001', date: '2026-10-01', in: '10:40', out: '19:10' }))[0].record?.status).toBe('late')
    expect(check(row(2, { code: 'VW-0001', date: '2026-10-01', in: '10:00', out: '13:00' }))[0].record?.status).toBe('half_day')
  })

  it('refuses days before joining, after leaving, in the future or in a locked month', () => {
    expect(check(row(2, { code: 'VW-0019', date: '2026-08-10', status: 'P' }))[0].errors.join(' ')).toContain('joined on 17 Aug 2026')
    expect(check(row(2, { code: 'VW-0013', date: '2026-10-01', status: 'P' }))[0].errors.join(' ')).toContain('left on 15 Sep 2026')
    expect(check(row(2, { code: 'VW-0001', date: '2026-10-03', status: 'P' }))[0].errors.join(' ')).toContain('not happened')
    expect(check(row(2, { code: 'VW-0001', date: '2026-09-10', status: 'P' }))[0].errors.join(' ')).toContain('September 2026 is locked')
  })

  it('names bad codes, statuses, dates and times', () => {
    const [r] = check(row(2, { code: 'VW-9999', date: '2026-13-01', status: 'Maybe', in: '25:00' }))
    expect(r.errors).toEqual(expect.arrayContaining([expect.stringContaining('No employee has the code VW-9999'), expect.stringContaining('YYYY-MM-DD'), expect.stringContaining('"Maybe" is not a status'), expect.stringContaining('in time as HH:MM')]))
    expect(r.record).toBeUndefined()
  })

  it('needs a status or an in time, and an out time after the in time', () => {
    expect(check(row(2, { code: 'VW-0001', date: '2026-10-01' }))[0].errors.join(' ')).toContain('Give a status')
    expect(check(row(2, { code: 'VW-0001', date: '2026-10-01', status: 'P', in: '18:00', out: '10:00' }))[0].errors.join(' ')).toContain('before the in time')
  })

  it('flags the same person and day twice on both lines', () => {
    const rows = check(row(2, { code: 'VW-0001', date: '2026-10-01', status: 'P' }), row(3, { code: 'vw-0001', date: '2026-10-01', status: 'A' }))
    expect(rows[0].errors.join(' ')).toContain('also on line 3')
    expect(rows[1].errors.join(' ')).toContain('also on line 2')
    expect(importSummary(rows)).toBe('2 rows checked: 0 ready to write, 2 to fix first.')
  })

  it('warns when a row overrides the calendar', () => {
    expect(check(row(2, { code: 'VW-0001', date: '2026-10-01', status: 'WO' }))[0].warnings[0]).toContain('week offs and holidays')
  })
})
