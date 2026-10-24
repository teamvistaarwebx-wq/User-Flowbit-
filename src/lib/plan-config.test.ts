import { describe, expect, it } from 'vitest'
import { signupAccountType } from './account-types'
import { capacity, quoteSelection, type Usage } from './billing'
import { defaultConsoleSettings, fillTemplate, mergeConsoleSettings } from './console/settings-defaults'
import { entitlements } from './entitlements'
import { freeReturnMessage, freeReturnRefusal, trialStartFields } from './lifecycle'
import { DEFAULT_PLAN_CONFIG, lockedPrices, planConfigFrom } from './plan-config'
import { newFreeSubscription, newSignupTrialSubscription, PLAN_PRICES, TRIAL_DAYS } from './plans'

const NOW = new Date('2026-10-08T06:00:00Z')
const DAY = 86_400_000
const usage = (over: Partial<Usage> = {}): Usage => ({ members: 6, pendingInvites: 0, employees: 0, orbitUsers: 0, folioUsers: 0, persons: 6, ...over })

/** Console settings with these overrides on top of the defaults (the shape staff save). */
const settings = (over: { prices?: Record<string, number>; limits?: Record<string, number> }) => {
  const base = defaultConsoleSettings()
  return mergeConsoleSettings({ ...base, prices: { ...base.prices, ...over.prices }, limits: { ...base.limits, ...over.limits } as typeof base.limits })
}

describe('plan config from Console settings', () => {
  it('falls back to the lib/plans prices and limits when nothing is stored', () => {
    expect(planConfigFrom(null)).toBe(DEFAULT_PLAN_CONFIG)
    const fromDefaults = planConfigFrom(defaultConsoleSettings())
    expect(fromDefaults.prices.suite).toBe(PLAN_PRICES.suite.monthlyPaise)
    expect(fromDefaults).toMatchObject({ freeSeats: 5, freeMonths: 6, trialDays: TRIAL_DAYS, salesExtensionDays: 15, setupsPerWeek: 5 })
  })

  it('reads rupees as paise and each limit from the settings', () => {
    const config = planConfigFrom(settings({ prices: { suite: 199, work: 64.5 }, limits: { freeSeats: 7, freeMonths: 3, trialDays: 21, salesExtensionDays: 10, setupsPerWeek: 2 } }))
    expect(config.prices).toMatchObject({ suite: 19_900, work: 6_450, orbit: PLAN_PRICES.orbit.monthlyPaise })
    expect(config).toMatchObject({ freeSeats: 7, freeMonths: 3, trialDays: 21, salesExtensionDays: 10, setupsPerWeek: 2 })
  })

  it('never lets a bad value lock signups out: 0 seats, 0 months or 0 trial days fall back to the default', () => {
    const config = planConfigFrom(settings({ limits: { freeSeats: 0, freeMonths: 0, trialDays: 0, setupsPerWeek: 0 } }))
    expect(config).toMatchObject({ freeSeats: 5, freeMonths: 6, trialDays: TRIAL_DAYS, setupsPerWeek: 0 })
  })
})

describe('prices read through', () => {
  it('prices a checkout or bill at the Console price, and at PLAN_PRICES without one', () => {
    const prices = planConfigFrom(settings({ prices: { suite: 199 } })).prices
    expect(quoteSelection({ plan: 'suite', seats: 10 }, 'monthly', { prices }).periodAmountPaise).toBe(199_000)
    expect(quoteSelection({ plan: 'suite', seats: 10 }, 'yearly', { prices }).periodAmountPaise).toBe(1_990_000)
    expect(quoteSelection({ plan: 'suite', seats: 10 }, 'monthly').periodAmountPaise).toBe(PLAN_PRICES.suite.monthlyPaise * 10)
  })

  it('keeps a subscriber on the prices it bought at: locked prices are read back, missing ones are the old list prices', () => {
    expect(lockedPrices(undefined)).toEqual(DEFAULT_PLAN_CONFIG.prices)
    expect(lockedPrices({ suite: 19_900, work: -1, junk: 5 })).toEqual({ ...DEFAULT_PLAN_CONFIG.prices, suite: 19_900 })
    const renewal = quoteSelection({ plan: 'suite', seats: 10 }, 'monthly', { prices: lockedPrices({ suite: 12_900 }) })
    expect(renewal.periodAmountPaise).toBe(129_000)
  })
})

describe('limits read through', () => {
  it('gives Free the Console seat limit in entitlements and capacity', () => {
    const org = { subscription: newFreeSubscription(new Date(NOW.getTime() - 3 * DAY)) }
    expect(entitlements(org, NOW, usage()).seatLimit).toBe(5)
    const ent = entitlements(org, NOW, usage(), { freeSeats: 7 })
    expect(ent.seatLimit).toBe(7)
    expect(ent.reasons).not.toContain('over_seat_limit')
    expect(capacity(org.subscription, usage(), NOW, 7)[0]).toMatchObject({ key: 'seats', limit: 7, ok: true })
  })

  it('starts new workspaces with the Console trial days, Free seats and Free months', () => {
    const trial = newSignupTrialSubscription(NOW, { trialDays: 21, freeMonths: 3 })
    expect(trial.trialEndsAt.getTime() - NOW.getTime()).toBe(21 * DAY)
    expect(trial.freeEndsAt.toISOString()).toBe('2027-01-08T06:00:00.000Z')
    const free = newFreeSubscription(NOW, { freeSeats: 8, freeMonths: 3 })
    expect(free).toMatchObject({ seats: 8, accountType: 'free' })
    expect(free.trialEndsAt.toISOString()).toBe('2027-01-08T06:00:00.000Z')
    expect(newFreeSubscription(NOW).seats).toBe(5)
    expect(trialStartFields({ subscription: free }, NOW, 21).trialEndsAt.getTime() - NOW.getTime()).toBe(21 * DAY)
  })

  it('decides Free or Trial at signup by the Console seat limit', () => {
    expect(signupAccountType({ teamSize: '6-10', invites: 0 })).toBe('trial')
    expect(signupAccountType({ teamSize: '6-10', invites: 0 }, 10)).toBe('free')
  })

  it('lets a trimmed trial back to Free by the Console seat limit, with the matching wording', () => {
    const org = { createdAt: NOW, subscription: { ...newSignupTrialSubscription(new Date(NOW.getTime() - 20 * DAY)), status: 'trialing' } }
    expect(freeReturnRefusal(org, 6, NOW)).toBe('too_many')
    expect(freeReturnRefusal(org, 6, NOW, 8)).toBeNull()
    expect(freeReturnMessage('too_many', 8)).toContain('covers 8 people')
  })
})

describe('templates read through', () => {
  it('fills {placeholders} and keeps unknown ones visible', () => {
    expect(fillTemplate('Your trial ends in {days} days, {name}. {oops}', { days: 3, name: 'Asha' })).toBe('Your trial ends in 3 days, Asha. {oops}')
  })
})
