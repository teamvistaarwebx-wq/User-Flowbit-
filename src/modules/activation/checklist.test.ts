import { describe, expect, it } from 'vitest'
import { checklistProgress, showChecklist, type ChecklistFacts } from './checklist'

const none: ChecklistFacts = { invites: 0, teammates: 0, projects: 0, tasks: 0, checkins: 0, invoices: 0, usage: new Set() }
const ALL = ['work', 'muster', 'orbit', 'folio'] as const

describe('Get started checklist', () => {
  it('starts with nothing done', () => {
    const p = checklistProgress(none, ALL)
    expect(p.items.map((i) => i.key)).toEqual(['invite', 'project', 'task', 'checkin', 'invoice'])
    expect([p.done, p.total, p.complete]).toEqual([0, 5, false])
  })

  it('counts invites and teammates together towards two people', () => {
    expect(checklistProgress({ ...none, invites: 1 }, ALL).items[0].done).toBe(false)
    expect(checklistProgress({ ...none, invites: 1, teammates: 1 }, ALL).items[0].done).toBe(true)
  })

  it('ticks steps from real data or from usage events', () => {
    const p = checklistProgress({ ...none, projects: 1, usage: new Set(['task_created', 'attendance_marked']), invoices: 2 }, ALL)
    expect(p.items.filter((i) => i.done).map((i) => i.key)).toEqual(['project', 'task', 'checkin', 'invoice'])
  })

  it('skips steps for products the workspace does not have', () => {
    const p = checklistProgress({ ...none, invites: 2, projects: 1, tasks: 3 }, ['work'])
    expect(p.items.map((i) => i.key)).toEqual(['invite', 'project', 'task'])
    expect(p.complete).toBe(true)
  })

  it('shows to owners and admins for 30 days, until done or dismissed', () => {
    const createdAt = new Date('2026-10-01T00:00:00Z')
    const base = { canManage: true, createdAt, now: new Date('2026-10-09T00:00:00Z'), complete: false }
    expect(showChecklist(base)).toBe(true)
    expect(showChecklist({ ...base, canManage: false })).toBe(false)
    expect(showChecklist({ ...base, complete: true })).toBe(false)
    expect(showChecklist({ ...base, dismissedAt: new Date() })).toBe(false)
    expect(showChecklist({ ...base, now: new Date('2026-10-31T00:00:01Z') })).toBe(false)
  })
})
