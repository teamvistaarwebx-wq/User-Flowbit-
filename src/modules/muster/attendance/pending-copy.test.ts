import { describe, expect, it } from 'vitest'
import { pendingLockRefusal, pendingSummary } from './pending-copy'

describe('locking a month with pending requests (R1 3.2)', () => {
  it('lists what is pending', () => {
    expect(pendingSummary({ leave: 2, corrections: 1, compOffs: 0 })).toBe('2 leave requests and 1 attendance correction')
    expect(pendingSummary({ leave: 0, corrections: 0, compOffs: 0 })).toBeNull()
  })
  it('refuses unless the person chose to lock anyway', () => {
    expect(pendingLockRefusal({ leave: 1, corrections: 0, compOffs: 0 }, 'September 2026', false)).toMatch(/^1 leave request in September 2026 is still waiting/)
    expect(pendingLockRefusal({ leave: 1, corrections: 0, compOffs: 0 }, 'September 2026', true)).toBeNull()
    expect(pendingLockRefusal({ leave: 0, corrections: 0, compOffs: 0 }, 'September 2026', false)).toBeNull()
  })
})
