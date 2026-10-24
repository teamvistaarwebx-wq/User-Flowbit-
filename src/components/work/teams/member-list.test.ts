import { describe, expect, it } from 'vitest'
import { sortMembers } from './member-list'
import type { TeamMember } from './members-table'

const member = (id: string, name: string, extra: Partial<TeamMember> = {}): TeamMember => ({
  id, name, role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', presence: { state: 'out' }, presenceText: 'Offline', load: 0, planned: 0, open: 0, overdue: 0, projects: [], skills: [], timezone: 'Asia/Kolkata', ...extra,
})

const rows = [
  member('a', 'Zoya', { load: 40, presence: { state: 'in' } }),
  member('b', 'Arjun', { load: 90, presence: { state: 'leave' }, role: 'lead' }),
  member('c', 'Meera', { load: 40, presence: { state: 'break' } }),
]

describe('sortMembers', () => {
  it('sorts by name', () => {
    expect(sortMembers(rows, { key: 'name', dir: 'asc' }).map((m) => m.name)).toEqual(['Arjun', 'Meera', 'Zoya'])
  })

  it('sorts by load, ties by name, without changing the input', () => {
    expect(sortMembers(rows, { key: 'load', dir: 'desc' }).map((m) => m.id)).toEqual(['b', 'c', 'a'])
    expect(rows.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts checked-in people first and leave last', () => {
    expect(sortMembers(rows, { key: 'status', dir: 'asc' }).map((m) => m.presence.state)).toEqual(['in', 'break', 'leave'])
  })

  it('puts leads first by role', () => {
    expect(sortMembers(rows, { key: 'role', dir: 'asc' })[0].id).toBe('b')
  })
})
