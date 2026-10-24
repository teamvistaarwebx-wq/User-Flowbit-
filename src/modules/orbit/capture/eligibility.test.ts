import { describe, expect, it } from 'vitest'
import { newTrialSubscription, type OrgLike } from '@/lib/plans'
import { CAPTURE_CLOSED, captureRefusal } from './eligibility'

const NOW = new Date('2026-10-08T06:00:00Z')
const DAY = 86_400_000
const trial = (startedDaysAgo: number): OrgLike => ({ subscription: { ...newTrialSubscription(new Date(NOW.getTime() - startedDaysAgo * DAY)), accountType: 'trial' } })

describe('lead capture eligibility', () => {
  it('takes leads into an active workspace with Orbit', () => {
    expect(captureRefusal(trial(1), NOW)).toBeNull()
  })

  it('refuses a missing, deleted or disabled workspace', () => {
    expect(captureRefusal(null, NOW)).toBe(CAPTURE_CLOSED)
    expect(captureRefusal({ ...trial(1), disabled: true }, NOW)).toBe(CAPTURE_CLOSED)
    expect(captureRefusal({ ...trial(1), deletedAt: NOW }, NOW)).toBe(CAPTURE_CLOSED)
  })

  it('refuses a read-only workspace (trial over) and one without Orbit', () => {
    expect(captureRefusal(trial(20), NOW)).toBe(CAPTURE_CLOSED)
    expect(captureRefusal({ ...trial(1), enabledProducts: ['work'] }, NOW)).toBe(CAPTURE_CLOSED)
  })
})
