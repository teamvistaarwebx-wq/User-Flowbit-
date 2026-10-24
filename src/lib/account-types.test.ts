import { describe, expect, it } from 'vitest'
import { accountTypeOf, accountTypeProblem, countsInMetrics, freeEndsAt, isHouseAccount, signupAccountType, teamSizeMax } from './account-types'

const NOW = new Date('2026-10-08T06:00:00Z')

describe('accountTypeOf', () => {
  it('keeps the staff-set types whatever the plan', () => {
    expect(accountTypeOf({ plan: 'trial', accountType: 'internal' })).toBe('internal')
    expect(accountTypeOf({ plan: 'suite', accountType: 'test' })).toBe('test')
    expect(accountTypeOf({ plan: 'custom', accountType: 'comped' })).toBe('comped')
  })

  it('follows the plan for Free, Trial and Paid, and resolves workspaces without the field', () => {
    expect(accountTypeOf({ plan: 'trial', accountType: 'free' })).toBe('free')
    expect(accountTypeOf({ plan: 'suite', accountType: 'free' })).toBe('paid')
    expect(accountTypeOf({ plan: 'trial' })).toBe('trial')
    expect(accountTypeOf({ plan: 'custom' })).toBe('paid')
    expect(accountTypeOf(null)).toBe('trial')
  })

  it('leaves only Internal and Test out of metrics', () => {
    expect(isHouseAccount('internal') && isHouseAccount('test')).toBe(true)
    expect(['free', 'trial', 'paid', 'comped'].every((t) => countsInMetrics(t as 'free'))).toBe(true)
  })
})

describe('signup: Free or Trial', () => {
  it('reads the top of each team-size answer', () => {
    expect(teamSizeMax('Just myself')).toBe(1)
    expect(teamSizeMax('2-5')).toBe(5)
    expect(teamSizeMax('6-10')).toBe(10)
    expect(teamSizeMax('500+')).toBe(Number.POSITIVE_INFINITY)
  })

  it('starts Free for up to 5 people and a trial above that', () => {
    expect(signupAccountType({ teamSize: 'Just myself', invites: 0 })).toBe('free')
    expect(signupAccountType({ teamSize: '2-5', invites: 4 })).toBe('free')
    expect(signupAccountType({ teamSize: '6-10', invites: 0 })).toBe('trial')
    expect(signupAccountType({ teamSize: '11-50', invites: 0 })).toBe('trial')
  })

  it('counts the owner and the people invited at onboarding', () => {
    expect(signupAccountType({ teamSize: '2-5', invites: 5 })).toBe('trial')
    expect(signupAccountType({ teamSize: 'Just myself', invites: 5 })).toBe('trial')
  })

  it('ends Free six calendar months after signup', () => {
    expect(freeEndsAt(new Date('2026-10-08T06:00:00Z')).toISOString()).toBe('2027-04-08T06:00:00.000Z')
  })
})

describe('accountTypeProblem', () => {
  it('keeps Free and Trial for workspaces without a plan, and Paid for ones with a plan', () => {
    expect(accountTypeProblem('free', { plan: 'suite' }, NOW)?.field).toBe('accountType')
    expect(accountTypeProblem('free', { plan: 'trial' }, NOW)).toBeNull()
    expect(accountTypeProblem('paid', { plan: 'trial' }, NOW)?.field).toBe('accountType')
    expect(accountTypeProblem('paid', { plan: 'custom' }, NOW)).toBeNull()
  })

  it('needs a future end date for Comped, and nothing for Internal or Test', () => {
    expect(accountTypeProblem('comped', { plan: 'suite' }, NOW)?.field).toBe('compedUntil')
    expect(accountTypeProblem('comped', { plan: 'suite', compedUntil: new Date('2026-10-01') }, NOW)?.field).toBe('compedUntil')
    expect(accountTypeProblem('comped', { plan: 'trial', compedUntil: new Date('2027-01-01') }, NOW)).toBeNull()
    expect(accountTypeProblem('test', { plan: 'trial' }, NOW)).toBeNull()
    expect(accountTypeProblem('internal', { plan: 'suite' }, NOW)).toBeNull()
  })
})
