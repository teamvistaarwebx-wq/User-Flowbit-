import { describe, expect, it } from 'vitest'
import { istInstant } from '@/lib/dates'
import type { Permission, ProductKey } from '@/lib/catalog'
import { allowedSections, presetFor, presetSections, type BriefAccess } from './catalog'
import { briefHeadline, dueDate, nextRunAt, runsOn, shouldSendBrief, type BriefSchedule, type BuiltSection } from './schedule'

const daily: BriefSchedule = { time: '08:30', days: [1, 2, 3, 4, 5, 6], frequency: 'daily', weekday: 1 }
// 2026-10-08 is a Thursday; 2026-10-11 a Sunday.
const at = (date: string, time: string) => istInstant(date, time)

describe('brief scheduling (IST)', () => {
  it('runs on the chosen days, weekdays, one weekday, or the 1st', () => {
    expect(runsOn(daily, '2026-10-08')).toBe(true)
    expect(runsOn(daily, '2026-10-11')).toBe(false)
    expect(runsOn({ ...daily, frequency: 'weekdays' }, '2026-10-10')).toBe(false)
    expect(runsOn({ ...daily, frequency: 'weekly', weekday: 4 }, '2026-10-08')).toBe(true)
    expect(runsOn({ ...daily, frequency: 'weekly', weekday: 5 }, '2026-10-08')).toBe(false)
    expect(runsOn({ ...daily, frequency: 'monthly' }, '2026-11-01')).toBe(true)
    expect(runsOn({ ...daily, frequency: 'monthly' }, '2026-11-02')).toBe(false)
  })

  it('is due at the first cron run after its time, once a day', () => {
    expect(dueDate(daily, null, at('2026-10-08', '08:29'))).toBeNull()
    expect(dueDate(daily, null, at('2026-10-08', '08:30'))).toBe('2026-10-08')
    expect(dueDate(daily, '2026-10-07', at('2026-10-08', '08:45'))).toBe('2026-10-08')
    expect(dueDate(daily, '2026-10-08', at('2026-10-08', '08:45'))).toBeNull()
  })

  it('skips a day it could not send within six hours rather than arriving at night', () => {
    expect(dueDate(daily, null, at('2026-10-08', '14:30'))).toBe('2026-10-08')
    expect(dueDate(daily, null, at('2026-10-08', '14:31'))).toBeNull()
  })

  it('is never due on a day it does not run', () => {
    expect(dueDate(daily, null, at('2026-10-11', '09:00'))).toBeNull()
  })

  it('finds the next run, skipping Sunday', () => {
    expect(nextRunAt(daily, at('2026-10-10', '09:00'))).toEqual(at('2026-10-12', '08:30'))
    expect(nextRunAt(daily, at('2026-10-08', '07:00'))).toEqual(at('2026-10-08', '08:30'))
    expect(nextRunAt({ ...daily, days: [] }, at('2026-10-08', '07:00'))).toBeNull()
  })
})

describe('skip if empty', () => {
  const empty: BuiltSection[] = [{ key: 'work.due_today', title: 'Due today', lines: [] }]
  const full: BuiltSection[] = [...empty, { key: 'approvals.pending', title: 'Waiting on me', lines: [{ text: '2 leave requests' }], summary: '2 approvals' }]

  it('sends nothing when every section is empty and skip is on', () => {
    expect(shouldSendBrief(empty, true)).toBe(false)
    expect(shouldSendBrief(empty, false)).toBe(true)
    expect(shouldSendBrief(full, true)).toBe(true)
  })

  it('summarises the non-empty sections', () => {
    expect(briefHeadline(full)).toBe('2 approvals')
    expect(briefHeadline(empty)).toBe('Nothing needs you today.')
  })
})

const access = (perms: Permission[], products: ProductKey[] = ['work', 'muster', 'orbit', 'folio']): BriefAccess => ({ can: (p) => perms.includes(p), has: (p) => products.includes(p) })

describe('sections are permission-aware', () => {
  it('drops sections the person may not see, unknown keys and duplicates', () => {
    const employee = access(['tasks.read', 'time.write'])
    expect(allowedSections(['money.dues', 'work.due_today', 'nope', 'work.due_today', 'approvals.pending'], employee)).toEqual(['work.due_today'])
  })

  it('needs the product as well as the permission', () => {
    expect(allowedSections(['money.dues'], access(['folio.read'], ['work']))).toEqual([])
    expect(allowedSections(['money.dues'], access(['folio.read'], ['folio']))).toEqual(['money.dues'])
  })

  it('gives each role a preset: owner everything they can see, employee work and approvals', () => {
    const owner = access(['org.manage', 'tasks.read', 'tasks.manage', 'time.write', 'leave.approve', 'people.read_all', 'folio.read', 'orbit.read'])
    expect(presetFor(owner)).toBe('owner')
    expect(presetSections('owner', owner)).toContain('money.dues')
    expect(presetSections('owner', owner)).toContain('sales.closing')

    const employee = access(['tasks.read', 'time.write'])
    expect(presetFor(employee)).toBe('employee')
    expect(presetSections('employee', employee)).toEqual(['work.due_today', 'work.overdue', 'work.meetings', 'work.due_week'])

    expect(presetFor(access(['tasks.read', 'people.read_team']))).toBe('manager')
    expect(presetFor(access(['tasks.read', 'invoices.write']))).toBe('accounts')
    expect(presetFor(access(['tasks.read', 'leads.write']))).toBe('sales')
  })
})
