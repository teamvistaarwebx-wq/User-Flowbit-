import { describe, expect, it } from 'vitest'
import type { Usage } from '@/lib/billing'
import { trialStartFields } from '@/lib/lifecycle'
import { newFreeSubscription, newSignupTrialSubscription, type OrgLike } from '@/lib/plans'
import { capacityBreach } from './capacity-gate'

const NOW = new Date('2026-10-08T06:00:00Z')
const DAY = 86_400_000
const usage = (over: Partial<Usage> = {}): Usage => ({ members: 1, pendingInvites: 0, employees: 0, orbitUsers: 0, folioUsers: 0, persons: 1, ...over })
const free: OrgLike = { createdAt: new Date(NOW.getTime() - 10 * DAY), subscription: newFreeSubscription(new Date(NOW.getTime() - 10 * DAY)) }

describe('Free seat limit gate', () => {
  it('lets the 5th person in and stops the 6th, offering the trial', () => {
    expect(capacityBreach(free, usage({ members: 4 }), usage({ members: 4, pendingInvites: 1 }), NOW)).toBeNull()
    const breach = capacityBreach(free, usage({ members: 5 }), usage({ members: 5, pendingInvites: 1 }), NOW)
    expect(breach?.row).toMatchObject({ key: 'seats', used: 6, limit: 5 })
    expect(breach?.trialAvailable).toBe(true)
  })

  it('counts the higher of logins and Muster employees, not both', () => {
    expect(capacityBreach(free, usage({ members: 3, employees: 4 }), usage({ members: 3, employees: 5 }), NOW)).toBeNull()
    expect(capacityBreach(free, usage({ members: 3, employees: 5 }), usage({ members: 3, employees: 6 }), NOW)?.row.key).toBe('seats')
    expect(capacityBreach(free, usage({ members: 5, employees: 2 }), usage({ members: 5, employees: 5 }), NOW)).toBeNull()
  })

  it('offers Upgrade only once the trial is used', () => {
    const used: OrgLike = { ...free, subscription: { ...free.subscription!, trialStartedAt: new Date(NOW.getTime() - DAY) } }
    expect(capacityBreach(used, usage({ members: 5 }), usage({ members: 6 }), NOW)?.trialAvailable).toBe(false)
  })

  it('has no seat limit during the trial', () => {
    const trial: OrgLike = { ...free, subscription: { ...free.subscription!, ...trialStartFields(free, NOW) } }
    expect(capacityBreach(trial, usage({ members: 30 }), usage({ members: 31 }), NOW)).toBeNull()
    const signup: OrgLike = { subscription: newSignupTrialSubscription(NOW) }
    expect(capacityBreach(signup, usage({ members: 9 }), usage({ members: 10 }), NOW)).toBeNull()
  })

  it('never blocks a change that does not add people, even when already over', () => {
    expect(capacityBreach(free, usage({ members: 7 }), usage({ members: 6 }), NOW)).toBeNull()
  })
})
