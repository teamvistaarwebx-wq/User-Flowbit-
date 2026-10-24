import { describe, expect, it } from 'vitest'
import { canAccessTask, canModifyTask, canShareTask, personalTasksMatch, visibleTasksMatch, type Viewer } from './access'
import { relativeDue, isOverdue } from './due'
import { parseDuration } from './duration'

const viewer = (patch: Partial<Viewer> = {}): Viewer => ({ memberId: 'me', manage: false, leadOf: [], projectIds: [], spaceIds: [], ...patch })

describe('task visibility', () => {
  it('lets tasks.manage see every non-personal task', () => {
    expect(visibleTasksMatch(viewer({ manage: true }))).toEqual({ isPersonal: { $ne: true } })
  })

  it('unions own, team-led, project and space tasks for everyone else', () => {
    const match = visibleTasksMatch(viewer({ leadOf: ['a'], projectIds: ['p'], spaceIds: ['s'] })) as { $or: unknown[] }
    expect(match.$or).toEqual([{ assigneeIds: 'me' }, { creatorId: 'me' }, { watcherIds: 'me' }, { assigneeIds: { $in: ['a'] } }, { projectId: { $in: ['p'] } }, { spaceId: { $in: ['s'] } }])
  })

  it('keeps personal tasks to their people', () => {
    expect(personalTasksMatch(viewer())).toEqual({ isPersonal: true, $or: [{ assigneeIds: 'me' }, { creatorId: 'me' }, { sharedWith: 'me' }] })
    const personal = { isPersonal: true, creatorId: 'other', assigneeIds: ['other'], sharedWith: [] }
    expect(canAccessTask(viewer(), personal)).toBe(false)
    expect(canAccessTask(viewer(), { ...personal, sharedWith: ['me'] })).toBe(true)
    expect(canModifyTask(viewer({ manage: true }), personal)).toBe(false)
    expect(canAccessTask(viewer({ manage: true }), personal)).toBe(false)
  })

  it('opens tasks through projects, spaces and teams I lead', () => {
    const t = { creatorId: 'x', assigneeIds: ['y'], projectId: 'p', spaceId: 's' }
    expect(canAccessTask(viewer(), t)).toBe(false)
    expect(canAccessTask(viewer({ projectIds: ['p'] }), t)).toBe(true)
    expect(canAccessTask(viewer({ spaceIds: ['s'] }), t)).toBe(true)
    expect(canAccessTask(viewer({ leadOf: ['y'] }), t)).toBe(true)
    expect(canModifyTask(viewer({ projectIds: ['p'] }), t)).toBe(false)
    expect(canModifyTask(viewer({ manage: true }), t)).toBe(true)
  })

  it('lets only the people on a personal task share it', () => {
    expect(canShareTask(viewer(), { isPersonal: true, creatorId: 'me', assigneeIds: ['me'] })).toBe(true)
    expect(canShareTask(viewer(), { isPersonal: false, creatorId: 'me', assigneeIds: ['me'] })).toBe(false)
  })
})

describe('due labels', () => {
  it('reads Today / Tomorrow / overdue / In n days', () => {
    expect(relativeDue('2026-10-01', '2026-10-01')?.label).toBe('Today')
    expect(relativeDue('2026-10-02', '2026-10-01')?.label).toBe('Tomorrow')
    expect(relativeDue('2026-09-28', '2026-10-01')).toEqual({ label: '3d overdue', overdue: true })
    expect(relativeDue('2026-10-05', '2026-10-01')?.label).toBe('In 4d')
    expect(relativeDue(null, '2026-10-01')).toBeNull()
    expect(isOverdue({ status: 'done', dueDate: '2026-09-01' }, '2026-10-01')).toBe(false)
  })
})

describe('parseDuration', () => {
  it('reads hours, minutes, days and weeks (8 h days, 5-day weeks)', () => {
    expect(parseDuration('1h 30m')).toBe(90)
    expect(parseDuration('90m')).toBe(90)
    expect(parseDuration('1.5')).toBe(90)
    expect(parseDuration('2d')).toBe(960)
    expect(parseDuration('1w')).toBe(2400)
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('0')).toBeNull()
    expect(parseDuration('2x')).toBeNull()
  })
})
