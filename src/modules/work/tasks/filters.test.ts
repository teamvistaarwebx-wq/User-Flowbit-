import { describe, expect, it } from 'vitest'
import { activeFilterCount, boardStatuses, buildTaskMatch, dueClause, parseTaskQuery, searchClause, searchPatterns, sortStages, taskQueryString } from './filters'

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P1 = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const TODAY = '2026-10-01'

describe('parseTaskQuery', () => {
  it('reads lists, flags and presets and drops junk', () => {
    const q = parseTaskQuery({ view: 'list', mine: '1', status: 'todo,blocked,nope', priority: 'urgent', project: `${P1},xyz`, due: 'overdue', q: '  homepage  ', page: '3' })
    expect(q.view).toBe('list')
    expect(q.mine).toBe(true)
    expect(q.status).toEqual(['todo', 'blocked'])
    expect(q.priority).toEqual(['urgent'])
    expect(q.project).toEqual([P1])
    expect(q.due).toBe('overdue')
    expect(q.q).toBe('homepage')
    expect(q.page).toBe(3)
  })

  it('falls back to defaults (board view, personal when the workspace is personal)', () => {
    expect(parseTaskQuery({}).view).toBe('board')
    expect(parseTaskQuery({}, { personal: true }).personal).toBe(true)
    expect(parseTaskQuery({ personal: '0' }, { personal: true }).personal).toBe(false)
    expect(parseTaskQuery({ due: 'later', view: 'gantt' }).due).toBeNull()
  })

  it('round-trips through the query string', () => {
    const q = parseTaskQuery({ view: 'calendar', assignee: P1, status: 'done', month: '2026-10', sort: 'dueDate', order: 'asc' })
    expect(parseTaskQuery(Object.fromEntries(new URLSearchParams(taskQueryString(q))))).toEqual(q)
  })

  it('counts active filters but not view or sort', () => {
    expect(activeFilterCount(parseTaskQuery({ view: 'list', sort: 'title' }))).toBe(0)
    expect(activeFilterCount(parseTaskQuery({ mine: '1', due: 'today', q: 'x' }))).toBe(3)
    // A project's Tasks tab fixes the project: no chip, so no count.
    expect(activeFilterCount(parseTaskQuery({ project: '64b7f0c2a1b2c3d4e5f60718' }), ['project', 'personal'])).toBe(0)
    expect(activeFilterCount(parseTaskQuery({ project: '64b7f0c2a1b2c3d4e5f60718' }))).toBe(1)
  })
})

describe('due presets', () => {
  it('excludes done tasks and uses IST dates', () => {
    expect(dueClause('today', TODAY)).toEqual({ status: { $ne: 'done' }, dueDate: TODAY })
    expect(dueClause('overdue', TODAY)).toEqual({ status: { $ne: 'done' }, dueDate: { $lt: TODAY } })
    expect(dueClause('week', TODAY)).toEqual({ status: { $ne: 'done' }, dueDate: { $gte: TODAY, $lte: '2026-10-07' } })
    expect(dueClause('none', TODAY)).toEqual({ status: { $ne: 'done' }, dueDate: null })
  })
})

describe('buildTaskMatch', () => {
  it('combines filters with $and and hides subtasks', () => {
    const q = parseTaskQuery({ mine: '1', priority: 'high,urgent', due: 'today' })
    expect(buildTaskMatch(q, { memberId: ME, today: TODAY })).toEqual({
      $and: [{ parentId: null }, { assigneeIds: ME }, { priority: { $in: ['high', 'urgent'] } }, { status: { $ne: 'done' }, dueDate: TODAY }],
    })
  })

  it('converts ids with toId', () => {
    const q = parseTaskQuery({ project: P1 })
    const match = buildTaskMatch(q, { memberId: ME, today: TODAY, toId: (id) => `oid:${id}`, topLevelOnly: false })
    expect(match).toEqual({ $and: [{ projectId: { $in: [`oid:${P1}`] } }] })
  })
})

describe('search', () => {
  it('escapes regex characters and splits long queries into words', () => {
    expect(searchPatterns('a+b')).toEqual(['a\\+b'])
    expect(searchPatterns('homepage copy draft')).toEqual(['homepage copy draft', 'homepage', 'copy', 'draft'])
  })

  it('matches only the title for short terms', () => {
    expect(searchClause('ui')).toEqual({ title: { $regex: 'ui', $options: 'i' } })
  })

  it('adds key, description, tags and matching projects for longer terms', () => {
    const clause = searchClause('logo', [P1]) as { $or: Record<string, unknown>[] }
    expect(clause.$or).toContainEqual({ key: { $regex: 'logo', $options: 'i' } })
    expect(clause.$or).toContainEqual({ projectId: { $in: [P1] } })
  })
})

describe('board and sort', () => {
  it('shows only filtered statuses on the board', () => {
    expect(boardStatuses(parseTaskQuery({ status: 'blocked' }))).toEqual(['blocked'])
    expect(boardStatuses(parseTaskQuery({}))).toHaveLength(5)
  })

  it('sorts by status rank and puts missing due dates last', () => {
    expect(sortStages(parseTaskQuery({ sort: 'status', order: 'asc' }))[1]).toEqual({ $sort: { _rank: 1, createdAt: -1, _id: -1 } })
    expect(sortStages(parseTaskQuery({ sort: 'dueDate', order: 'asc' }))[1]).toEqual({ $sort: { _missing: 1, dueDate: 1, _id: -1 } })
    expect(sortStages(parseTaskQuery({}))).toEqual([{ $sort: { createdAt: -1, _id: -1 } }])
  })
})
