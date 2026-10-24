import { describe, expect, it } from 'vitest'
import { reminderClaimFilter, wonReminderClaim } from './ack-remind'

describe('policy-ack reminder claim (R3 L-27b)', () => {
  it('matches the reminder time that was read, or a post never reminded', () => {
    // Arrange
    const at = new Date('2026-10-10T05:00:00Z')

    // Act, Assert
    expect(reminderClaimFilter('p1', at)).toEqual({ _id: 'p1', ackRemindedAt: at })
    expect(reminderClaimFilter('p1', undefined)).toEqual({ _id: 'p1', ackRemindedAt: null })
  })

  it('lets only the request that changed the post send the reminder', () => {
    expect(wonReminderClaim({ modifiedCount: 1 })).toBe(true)
    expect(wonReminderClaim({ modifiedCount: 0 })).toBe(false)
  })
})
