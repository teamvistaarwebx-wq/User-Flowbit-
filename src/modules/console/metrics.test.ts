import { describe, expect, it } from 'vitest'
import { mrrOf, orgState, seatLimitOf, weeklyCounts } from './metrics'

const now = new Date('2026-10-15T06:00:00Z')

describe('mrrOf', () => {
  it('counts an active monthly plan at its amount', () => {
    expect(mrrOf({ status: 'active', plan: 'suite', cycle: 'monthly', amountPaise: 372_500, currentPeriodEnd: new Date('2026-11-01') }, now)).toBe(372_500)
  })
  it('spreads a yearly plan over 12 months', () => {
    expect(mrrOf({ status: 'active', plan: 'custom', cycle: 'yearly', amountPaise: 870_000, currentPeriodEnd: new Date('2027-07-01') }, now)).toBe(72_500)
  })
  it('ignores trials and plans out of grace', () => {
    expect(mrrOf({ status: 'trialing', plan: 'trial', trialEndsAt: new Date('2026-10-20') }, now)).toBe(0)
    expect(mrrOf({ status: 'active', plan: 'suite', amountPaise: 100, currentPeriodEnd: new Date('2026-09-01') }, now)).toBe(0)
  })
  it('keeps a canceled plan until its period ends', () => {
    expect(mrrOf({ status: 'canceled', plan: 'suite', amountPaise: 149_000, currentPeriodEnd: new Date('2026-10-31') }, now)).toBe(149_000)
  })
})

describe('orgState', () => {
  it('labels a trial with days left', () => {
    expect(orgState({ subscription: { status: 'trialing', plan: 'trial', trialEndsAt: new Date('2026-10-21T06:00:00Z') } }, now)).toEqual({ state: 'trial', label: 'Trial · 6 days' })
  })
  it('shows read-only days after a trial ended', () => {
    expect(orgState({ subscription: { status: 'trialing', plan: 'trial', trialEndsAt: new Date('2026-10-05T06:00:00Z') } }, now)).toEqual({ state: 'read_only', label: 'Read-only · 20 days left' })
  })
  it('labels Free with its days left', () => {
    expect(orgState({ subscription: { status: 'trialing', plan: 'trial', accountType: 'free', trialEndsAt: new Date('2027-01-15T06:00:00Z') } }, now)).toEqual({ state: 'free', label: 'Free · 92 days' })
  })
  it('marks Internal and Test as not billed, whatever their dates', () => {
    expect(orgState({ subscription: { status: 'expired', plan: 'trial', accountType: 'test', trialEndsAt: new Date('2025-01-01') } }, now)).toEqual({ state: 'house', label: 'Test / Demo · not billed' })
    expect(mrrOf({ status: 'active', plan: 'suite', accountType: 'internal', amountPaise: 100_000, currentPeriodEnd: new Date('2026-11-01') }, now)).toBe(0)
  })
  it('puts disabled before anything else', () => {
    expect(orgState({ disabled: true, subscription: { status: 'active', plan: 'suite' } }, now).state).toBe('disabled')
  })
})

describe('seatLimitOf and weeklyCounts', () => {
  it('reads Suite seats and custom Work users', () => {
    expect(seatLimitOf({ status: 'active', plan: 'suite', seats: 25 })).toBe(25)
    expect(seatLimitOf({ status: 'active', plan: 'custom', products: { work: true }, quantities: { work: 8 } })).toBe(8)
    expect(seatLimitOf({ status: 'trialing', plan: 'trial' })).toBeNull()
    expect(seatLimitOf({ status: 'trialing', plan: 'trial', accountType: 'free' })).toBe(5)
  })
  it('buckets signups into Monday weeks', () => {
    const weeks = weeklyCounts(['2026-10-12', '2026-10-14', '2026-10-05'], '2026-10-15', 2)
    expect(weeks).toEqual([
      { label: '5/10', count: 1 },
      { label: '12/10', count: 2 },
    ])
  })
})
