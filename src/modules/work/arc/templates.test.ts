import { describe, expect, it } from 'vitest'
import { outlineDraftSchema } from './schemas'
import { breakdownTemplate, milestoneDates, outlineTemplate, progressText, taskShortcut } from './templates'

describe('outlineTemplate', () => {
  it('picks the website phases by keyword and validates', () => {
    const draft = outlineTemplate('Acme website revamp', 'New marketing site')
    expect(draft.milestones.map((m) => m.title)).toEqual(['Discovery', 'Design', 'Build', 'QA', 'Launch'])
    expect(outlineDraftSchema.safeParse(draft).success).toBe(true)
  })
  it('falls back to Plan / Do / Review / Close and accumulates offsets', () => {
    const draft = outlineTemplate('Office move', 'Shift to the new floor')
    expect(draft.milestones.map((m) => m.title)).toEqual(['Plan', 'Do', 'Review', 'Close'])
    expect(milestoneDates('2026-10-05', draft)).toEqual(['2026-10-10', '2026-10-24', '2026-10-29', '2026-11-01'])
  })
})

describe('breakdownTemplate', () => {
  it('splits description lines when there are enough', () => {
    expect(breakdownTemplate('Homepage', '- Write hero copy\n- Pick images\n- Build the section').subtasks.map((s) => s.title)).toEqual(['Write hero copy', 'Pick images', 'Build the section'])
  })
  it('uses the generic steps otherwise', () => {
    expect(breakdownTemplate('Homepage copy', '').subtasks).toHaveLength(4)
  })
})

describe('progressText', () => {
  it('only states the numbers it was given', () => {
    const text = progressText({ periodLabel: 'This week', scopeLabel: 'the team', completed: [{ project: 'Website', titles: ['A', 'B'] }], created: 3, overdue: [{ title: 'C', days: 2 }], blocked: [], loggedByProject: [{ project: 'Website', minutes: 150 }], upcoming: [], meetings: 1 })
    expect(text).toContain('This week, the team closed 2 tasks across 1 project and opened 3 new ones.')
    expect(text).toContain('Time logged: 2h 30m')
    expect(text).toContain('Overdue (1): C (2d).')
    expect(text).toContain('1 meeting was held.')
  })
})

describe('taskShortcut', () => {
  it('maps verbs to task filters', () => {
    expect(taskShortcut('overdue for acme')?.href).toBe('/app/work/tasks?due=overdue')
    expect(taskShortcut('homepage')).toBeNull()
  })
})
