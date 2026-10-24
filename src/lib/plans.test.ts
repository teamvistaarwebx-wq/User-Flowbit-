import { describe, expect, it } from 'vitest'
import {
  accessLevel,
  accessState,
  effectiveStatus,
  enabled,
  entitled,
  folioFirmLimit,
  has,
  hasFeature,
  inProductTrial,
  isTrial,
  musterTier,
  newTrialSubscription,
  productTrialDaysLeft,
  quote,
  readOnlyDaysLeft,
  readOnlyMessage,
  suiteSavings,
  trialDaysLeft,
  type OrgLike,
} from './plans'

const NOW = new Date('2026-10-01T06:00:00Z')
const DAY = 86_400_000
const trialOrg = (endsInDays: number): OrgLike => ({
  subscription: { ...newTrialSubscription(new Date(NOW.getTime() - 15 * DAY)), trialEndsAt: new Date(NOW.getTime() + endsInDays * DAY) },
})
const paid = (products: OrgLike['subscription'] extends infer S ? S extends { products?: infer P } ? P : never : never, plan = 'custom'): OrgLike => ({
  subscription: { status: 'active', plan, products, seats: 12, cycle: 'monthly' },
})

describe('isTrial (expired-trial fix)', () => {
  it('is true only while the trial runs, even when the stored status still says trialing', () => {
    expect(isTrial(trialOrg(1), NOW)).toBe(true)
    expect(isTrial(trialOrg(-1), NOW)).toBe(false)
    expect(isTrial(paid({ work: true }), NOW)).toBe(false)
  })

  it('stops an expired trial from being unlimited', () => {
    expect(folioFirmLimit(trialOrg(-1), NOW)).toBe(2)
  })
})

describe('trial', () => {
  it('starts a 15-day trial of everything', () => {
    const sub = newTrialSubscription(NOW)
    expect(sub.status).toBe('trialing')
    expect(sub.products).toEqual({ work: true, muster: 'business', orbit: true, folio: true })
    expect(Math.round((sub.trialEndsAt.getTime() - NOW.getTime()) / DAY)).toBe(15)
  })

  it('counts whole days left, and none once the trial has ended', () => {
    expect(trialDaysLeft(trialOrg(3.2), NOW)).toBe(4)
    expect(trialDaysLeft(trialOrg(0.1), NOW)).toBe(1)
    expect(trialDaysLeft(trialOrg(-2), NOW)).toBeNull()
    expect(trialDaysLeft(paid({ work: true }), NOW)).toBeNull()
  })
})

describe('accessState', () => {
  it('is full during the trial and for active plans', () => {
    expect(accessState(trialOrg(5), NOW)).toBe('full')
    expect(accessState(paid({ work: true }), NOW)).toBe('full')
  })

  it('is read-only for 30 days after the trial ends, then blocked', () => {
    expect(accessState(trialOrg(-1), NOW)).toBe('read_only')
    expect(readOnlyDaysLeft(trialOrg(-10), NOW)).toBe(20)
    expect(accessState(trialOrg(-31), NOW)).toBe('blocked')
  })

  it('keeps a canceled plan until the period ends', () => {
    const org: OrgLike = { subscription: { status: 'canceled', plan: 'custom', currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY) } }
    expect(accessState(org, NOW)).toBe('full')
    expect(accessState({ subscription: { ...org.subscription!, currentPeriodEnd: new Date(NOW.getTime() - 2 * DAY) } }, NOW)).toBe('read_only')
  })

  it('blocks disabled workspaces', () => {
    expect(accessState({ ...trialOrg(5), disabled: true }, NOW)).toBe('blocked')
  })
})

describe('entitlements', () => {
  it('gives the trial and Suite every product', () => {
    expect(['work', 'muster', 'orbit', 'folio'].every((p) => entitled(trialOrg(4), p as 'work'))).toBe(true)
    expect(entitled(paid({ work: false }, 'suite'), 'folio')).toBe(true)
  })

  it('follows per-product flags on custom plans', () => {
    const org = paid({ work: true, muster: 'starter', orbit: false, folio: false })
    expect(entitled(org, 'work')).toBe(true)
    expect(entitled(org, 'muster')).toBe(true)
    expect(entitled(org, 'orbit')).toBe(false)
    expect(musterTier(org)).toBe('starter')
  })

  it('treats enabledProducts as an on/off switch on top of entitlement', () => {
    const org: OrgLike = { ...paid({ work: true, orbit: true }), enabledProducts: ['work'] }
    expect(enabled(org, 'orbit')).toBe(false)
    expect(has(org, 'orbit')).toBe(false)
    expect(has(org, 'work')).toBe(true)
    expect(enabled({ enabledProducts: [] }, 'folio')).toBe(true)
  })

  it('locks payroll on Muster Starter only', () => {
    expect(hasFeature(paid({ muster: 'starter' }), 'muster.payroll')).toBe(false)
    expect(hasFeature(paid({ muster: 'starter' }), 'muster.leave')).toBe(true)
    expect(hasFeature(paid({ muster: 'business' }), 'muster.payroll')).toBe(true)
    expect(hasFeature(trialOrg(2), 'muster.payroll')).toBe(true)
    expect(hasFeature(paid({ work: true }), 'muster.leave')).toBe(false)
  })
})

describe('quote', () => {
  it('applies minimums, flat Folio and 18% GST', () => {
    const q = quote({ suite: false, work: true, muster: 'business', orbit: true, folio: true, seats: 3, orbitSeats: 1, cycle: 'monthly' })
    expect(q.lines.map((l) => [l.key, l.quantity, l.amountPaise])).toEqual([
      ['work', 5, 29_500],
      ['muster_business', 10, 79_000],
      ['orbit', 2, 29_800],
      ['folio', 1, 39_900],
    ])
    expect(q.subtotalPaise).toBe(178_200)
    expect(q.gstPaise).toBe(32_076)
    expect(q.totalPaise).toBe(210_276)
  })

  it('prices yearly at 10 months (list, 2 months free) and reports a per-month figure', () => {
    const q = quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats: 20, cycle: 'yearly' })
    expect(q.lines[0]).toMatchObject({ key: 'suite', quantity: 20, unitPaise: 149_000, amountPaise: 2_980_000 })
    expect(q).toMatchObject({ listSubtotalPaise: 2_980_000, discountPaise: 0, subtotalPaise: 2_980_000 })
    expect(q.perMonthPaise).toBe(248_333)
  })

  it('shows Suite savings against buying all four', () => {
    expect(suiteSavings(20, 'monthly')).toBe(20 * 5_900 + 20 * 7_900 + 20 * 14_900 + 39_900 - 20 * 14_900)
  })
})

describe('effectiveStatus and accessLevel (platform spec 6.5)', () => {
  const active = (periodEndInDays: number, status = 'active') => ({ status, plan: 'suite', currentPeriodEnd: new Date(NOW.getTime() + periodEndInDays * DAY) })

  it('derives past_due and expired from the stored dates', () => {
    expect(effectiveStatus(active(3), NOW).status).toBe('active')
    expect(effectiveStatus(active(-1), NOW)).toMatchObject({ status: 'past_due' })
    expect(effectiveStatus(active(-1, 'canceled'), NOW).status).toBe('expired')
    expect(effectiveStatus(trialOrg(-2).subscription, NOW).status).toBe('expired')
  })

  it('gives past-due plans 7 days of grace, then 30 read-only days, then blocks', () => {
    expect(accessLevel(active(-6), NOW)).toBe('full')
    expect(accessLevel(active(-8), NOW)).toBe('read_only')
    expect(readOnlyDaysLeft({ subscription: active(-17) }, NOW)).toBe(20)
    expect(accessLevel(active(-38), NOW)).toBe('blocked')
  })

  it('words the read-only refusal by reason and blocks deleted workspaces', () => {
    expect(readOnlyMessage(trialOrg(-1))).toBe('Your trial has ended — choose a plan to keep editing')
    expect(readOnlyMessage({ subscription: active(-40) })).toBe('Your subscription has ended — choose a plan to keep editing')
    expect(accessState({ ...trialOrg(5), deletedAt: new Date() }, NOW)).toBe('blocked')
  })
})

describe('Folio firms', () => {
  it('quotes ₹199 a month per firm beyond the included 2, with Folio or Suite', () => {
    const q = quote({ suite: false, work: false, muster: null, orbit: false, folio: true, seats: 1, folioFirms: 4, cycle: 'monthly' })
    expect(q.lines.map((l) => [l.key, l.quantity, l.amountPaise])).toEqual([
      ['folio', 1, 39_900],
      ['folio_firm', 2, 39_800],
    ])
    const suite = quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats: 10, folioFirms: 3, cycle: 'yearly' })
    expect(suite.lines[1]).toMatchObject({ key: 'folio_firm', quantity: 1, unitPaise: 199_000 })
    expect(quote({ suite: false, work: true, muster: null, orbit: false, folio: false, seats: 5, folioFirms: 6, cycle: 'monthly' }).lines).toHaveLength(1)
  })

  it('limits firms by plan: unlimited in trial, 2 + extras with Folio, 0 without', () => {
    expect(folioFirmLimit(trialOrg(5), NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(folioFirmLimit({ subscription: { status: 'active', plan: 'custom', products: { folio: true }, quantities: { folioFirms: 3 } } }, NOW)).toBe(5)
    expect(folioFirmLimit({ subscription: { status: 'active', plan: 'suite' } }, NOW)).toBe(2)
    expect(folioFirmLimit(paid({ work: true }), NOW)).toBe(0)
  })
})

describe('product trials', () => {
  const withTrial = (product: string, endsInDays: number, products: Record<string, unknown> = { work: true }): OrgLike => ({
    subscription: { status: 'active', plan: 'custom', products, productTrials: [{ product, startedAt: NOW, endsAt: new Date(NOW.getTime() + endsInDays * DAY) }] },
  })

  it('entitles the product only while the trial runs', () => {
    expect(entitled(withTrial('orbit', 3), 'orbit', NOW)).toBe(true)
    expect(inProductTrial(withTrial('orbit', 3), 'orbit', NOW)).toBe(true)
    expect(productTrialDaysLeft(withTrial('orbit', 2.5), 'orbit', NOW)).toBe(3)
    expect(entitled(withTrial('orbit', -1), 'orbit', NOW)).toBe(false)
    expect(entitled(withTrial('orbit', 3), 'folio', NOW)).toBe(false)
  })

  it('gives Muster Business during a Muster trial', () => {
    expect(musterTier(withTrial('muster', 3, { work: true, muster: 'starter' }), NOW)).toBe('business')
    expect(hasFeature(withTrial('muster', 3, { work: true, muster: 'starter' }), 'muster.payroll', NOW)).toBe(true)
  })
})
