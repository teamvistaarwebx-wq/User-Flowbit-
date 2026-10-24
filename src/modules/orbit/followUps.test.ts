import { describe, expect, it } from 'vitest'
import { pickNext } from './followUps'

describe('pickNext', () => {
  it('orders by due date, then due time (no time last), then creation, ignoring done and cancelled', () => {
    const rows = [
      { _id: 'done', status: 'done', type: 'call', dueDate: '2026-09-01' },
      { _id: 'cancelled', status: 'cancelled', type: 'call', dueDate: '2026-09-02' },
      { _id: 'later', status: 'planned', type: 'call', dueDate: '2026-10-05', dueTime: '09:00' },
      { _id: 'notime', status: 'planned', type: 'email', dueDate: '2026-10-03', dueTime: null, createdAt: '2026-09-01' },
      { _id: 'timed', status: 'planned', type: 'dm', dueDate: '2026-10-03', dueTime: '16:00', createdAt: '2026-09-20' },
    ]
    expect(pickNext(rows)?.activityId).toBe('timed')
    expect(pickNext(rows.filter((r) => r._id !== 'timed'))?.activityId).toBe('notime')
    const twins = [
      { _id: 'b', status: 'planned', type: 'call', dueDate: '2026-10-03', createdAt: '2026-09-02' },
      { _id: 'a', status: 'planned', type: 'call', dueDate: '2026-10-03', createdAt: '2026-09-01' },
    ]
    expect(pickNext(twins)?.activityId).toBe('a')
    expect(pickNext([rows[0]])).toBeNull()
  })
})
