import { describe, expect, it } from 'vitest'
import { lifecycleCopy, type LifecycleView } from './lifecycle-copy'

const view = (over: Partial<LifecycleView>): LifecycleView => ({ stage: 'free', accountType: 'free', daysLeft: 10, endsAt: '2027-04-08T06:00:00.000Z', deleteAt: null, freeWindowEndsAt: '2027-04-08T06:00:00.000Z', ...over })

describe('lifecycle copy (banner and subscription page)', () => {
  it('says the state, days left and what happens next', () => {
    expect(lifecycleCopy(view({}))).toEqual({ state: '10 days left on the Free plan', next: expect.stringContaining('the free months end') })
    expect(lifecycleCopy(view({ stage: 'trial', accountType: 'trial', daysLeft: 1, endsAt: '2026-10-20T00:00:00.000Z' }))?.next).toContain('Or trim to 5 people and stay on Free until')
    expect(lifecycleCopy(view({ stage: 'trial', accountType: 'trial', daysLeft: 1, endsAt: '2026-10-20T00:00:00.000Z', freeSeats: 8 }))?.next).toContain('Or trim to 8 people')
    expect(lifecycleCopy(view({ stage: 'read_only', daysLeft: 25 }))).toMatchObject({ state: 'Your free months have ended: read-only, 25 days left', next: expect.stringContaining('only Settings → Plan & billing and Export') })
    expect(lifecycleCopy(view({ stage: 'blocked', daysLeft: 0, deleteAt: '2027-09-01T00:00:00.000Z' }))?.state).toBe('Locked: last day before deletion')
  })

  it('has nothing to say for paid, house or deleted workspaces', () => {
    expect(lifecycleCopy(view({ stage: 'paid', accountType: 'paid' }))).toBeNull()
    expect(lifecycleCopy(view({ stage: 'house', accountType: 'test' }))).toBeNull()
  })
})

describe('signup copy follows the Console plan settings (R1 1.5, 1.6)', () => {
  it('builds the subtitle and the trial hint from the settings', async () => {
    const { signupSubtitle, trialSizeHint } = await import('./lifecycle-copy')
    expect(signupSubtitle({ freeSeats: 5, freeMonths: 6, trialDays: 15 })).toBe('Free for 6 months for teams of up to 5. Bigger teams get a 15-day trial. Every product included. No card needed.')
    expect(trialSizeHint(8)).toBe('Choose more than 8 people for a trial')
  })
})

describe('onboarding invite toast (R1 1.7)', () => {
  it('says where the links are when email is off', async () => {
    const { invitedPhrase } = await import('./lifecycle-copy')
    expect(invitedPhrase(0, 0)).toBe('')
    expect(invitedPhrase(2, 0)).toBe(' and invited 2 people')
    expect(invitedPhrase(2, 2)).toMatch(/copy their invite links from Settings → Members/)
  })
})
