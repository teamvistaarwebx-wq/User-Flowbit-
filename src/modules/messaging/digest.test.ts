import { describe, expect, it } from 'vitest'
import { digestShape, groupForDigest } from './digest'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 8, 5, minute))

describe('groupForDigest', () => {
  it('batches held alerts per workspace and person, oldest first', () => {
    const rows = [
      { id: 'c', orgId: 'o1', userId: 'u1', to: ['asha@x.in'], createdAt: at(30) },
      { id: 'a', orgId: 'o1', userId: 'u1', to: ['asha@x.in'], createdAt: at(10) },
      { id: 'b', orgId: 'o1', userId: 'u2', to: ['ravi@x.in'], createdAt: at(20) },
      { id: 'd', orgId: 'o2', userId: 'u1', to: ['asha@x.in'], createdAt: at(40) },
    ]
    const groups = groupForDigest(rows).map((g) => g.map((r) => r.id))
    expect(groups).toEqual([['a', 'c'], ['b'], ['d']])
  })

  it('falls back to the address when there is no user, and skips rows without a workspace', () => {
    const rows = [
      { id: 'a', orgId: 'o1', to: ['Client@x.in'], createdAt: at(1) },
      { id: 'b', orgId: 'o1', to: ['client@x.in'], createdAt: at(2) },
      { id: 'c', orgId: null, to: ['client@x.in'], createdAt: at(3) },
    ]
    expect(groupForDigest(rows).map((g) => g.map((r) => r.id))).toEqual([['a', 'b']])
  })

  it('sends a lone alert as itself and several as one digest', () => {
    expect(digestShape([{ orgId: 'o', to: [], createdAt: at(1) }])).toBe('single')
    expect(digestShape([{ orgId: 'o', to: [], createdAt: at(1) }, { orgId: 'o', to: [], createdAt: at(2) }])).toBe('digest')
  })
})
