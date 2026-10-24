import { describe, expect, it } from 'vitest'
import { newSignupTrialSubscription } from '@/lib/plans'
import { scheduledPublishRefusal } from './publish-rules'

const NOW = new Date('2026-10-08T05:30:00Z')
const DAY = 86_400_000
const activeOrg = (extra: object = {}) => ({ createdAt: new Date(NOW.getTime() - DAY), subscription: newSignupTrialSubscription(new Date(NOW.getTime() - DAY)), ...extra })
const moderator = { status: 'active', canModerate: true }
const member = { status: 'active', canModerate: false }

describe('scheduledPublishRefusal (R3 L-21b)', () => {
  it('publishes when the workspace and author are still fine', () => {
    expect(scheduledPublishRefusal(activeOrg(), moderator, 'announcement', NOW)).toBeNull()
    expect(scheduledPublishRefusal(activeOrg(), member, 'update', NOW)).toBeNull()
  })

  it('refuses when the workspace is gone, disabled or deleted', () => {
    expect(scheduledPublishRefusal(null, moderator, 'update', NOW)).toMatch(/no longer exists/)
    expect(scheduledPublishRefusal(activeOrg({ disabled: true }), moderator, 'update', NOW)).toMatch(/not active/)
    expect(scheduledPublishRefusal(activeOrg({ deletedAt: NOW }), moderator, 'update', NOW)).toMatch(/not active/)
  })

  it('refuses when the author was removed or disabled', () => {
    expect(scheduledPublishRefusal(activeOrg(), null, 'update', NOW)).toMatch(/no longer an active member/)
    expect(scheduledPublishRefusal(activeOrg(), { status: 'disabled', canModerate: true }, 'update', NOW)).toMatch(/no longer an active member/)
  })

  it('refuses an announcement or policy whose author lost moderator rights', () => {
    // Arrange
    const demoted = member

    // Act
    const announcement = scheduledPublishRefusal(activeOrg(), demoted, 'announcement', NOW)
    const policy = scheduledPublishRefusal(activeOrg(), demoted, 'policy', NOW)

    // Assert
    expect(announcement).toMatch(/can no longer post this type/)
    expect(policy).toMatch(/can no longer post this type/)
  })
})
