import { describe, expect, it } from 'vitest'
import type { Usage } from './billing'
import { canUseFeature, canUseProduct, canWrite, entitlements } from './entitlements'
import { newFreeSubscription, newTrialSubscription, type OrgLike } from './plans'

const NOW = new Date('2026-10-08T06:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)
const ALL = ['work', 'muster', 'orbit', 'folio']

const usage = (over: Partial<Usage> = {}): Usage => ({ members: 2, pendingInvites: 0, employees: 0, orbitUsers: 0, folioUsers: 0, persons: 2, ...over })
/** A trial (or Free window) that started `startedDaysAgo` days before NOW. */
const trial = (startedDaysAgo: number, extra: object = {}): OrgLike => ({ subscription: { ...newTrialSubscription(ago(startedDaysAgo)), accountType: 'trial', ...extra } })
const free = (startedDaysAgo: number): OrgLike => ({ subscription: newFreeSubscription(ago(startedDaysAgo)) })
const suite = (extra: object = {}): OrgLike => ({ subscription: { status: 'active', plan: 'suite', seats: 12, accountType: 'paid', currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY), ...extra } })

describe('entitlements: trial', () => {
  it('gives a running trial every product and no seat limit', () => {
    const ent = entitlements(trial(3), NOW, usage({ members: 40 }))
    expect(ent).toMatchObject({ accountType: 'trial', trialing: true, trialDaysLeft: 12, access: 'full', seatLimit: null, seatsUsed: 40, folioFirmLimit: Number.POSITIVE_INFINITY, billed: true, inMetrics: true })
    expect(ent.products).toEqual(ALL)
    expect(ent.reasons).toEqual(['trial_running'])
  })

  it('does not treat an expired trial as a trial (isTrial bug): no countdown, no unlimited seats or firms', () => {
    const ent = entitlements(trial(20), NOW, usage({ members: 3 }))
    expect(ent.trialing).toBe(false)
    expect(ent.trialDaysLeft).toBeNull()
    expect(ent.status).toBe('expired')
    expect(ent.access).toBe('read_only')
    expect(ent.readOnlyDaysLeft).toBe(25)
    expect(ent.seatLimit).toBe(0)
    expect(ent.folioFirmLimit).toBe(2)
    expect(ent.reasons).toEqual(['trial_ended', 'over_seat_limit'])
    expect(ent.readOnlyMessage).toBe('Your trial has ended — choose a plan to keep editing')
  })

  it('blocks a trial 30 days after it ended', () => {
    const ent = entitlements(trial(46), NOW)
    expect(ent.access).toBe('blocked')
    expect(ent.reasons).toEqual(['trial_ended', 'blocked'])
  })

  it('reads a workspace created before account types as a trial', () => {
    expect(entitlements({ subscription: newTrialSubscription(ago(1)) }, NOW).accountType).toBe('trial')
  })
})

describe('entitlements: Free', () => {
  it('runs 6 months with every product, 5 seats and the 2 included Folio firms', () => {
    const ent = entitlements(free(30), NOW, usage())
    expect(ent).toMatchObject({ accountType: 'free', accountTypeLabel: 'Free', trialing: true, access: 'full', seatLimit: 5, seatsUsed: 2, folioFirmLimit: 2, billed: true, inMetrics: true })
    expect(ent.trialDaysLeft).toBeGreaterThan(140)
    expect(ent.products).toEqual(ALL)
    expect(canUseFeature(ent, 'muster.payroll')).toBe(true)
    expect(ent.reasons).toEqual(['free_running'])
  })

  it('counts seats as the higher of logins and Muster employees, not their sum', () => {
    expect(entitlements(free(1), NOW, usage({ members: 3, pendingInvites: 1, employees: 2 })).seatsUsed).toBe(4)
    expect(entitlements(free(1), NOW, usage({ members: 1, employees: 5, persons: 5 })).seatsUsed).toBe(5)
    expect(entitlements(free(1), NOW, usage({ members: 4, pendingInvites: 1 })).reasons).toContain('seat_limit_reached')
    expect(entitlements(free(1), NOW, usage({ members: 2, employees: 6 })).reasons).toContain('over_seat_limit')
  })

  it('goes read-only when the 6 months end, with Free wording', () => {
    const ent = entitlements(free(200), NOW)
    expect(ent.trialing).toBe(false)
    expect(ent.access).toBe('read_only')
    expect(ent.seatLimit).toBe(5)
    expect(ent.reasons).toEqual(['free_ended'])
    expect(ent.readOnlyMessage).toBe('Your free months have ended — choose a plan to keep editing')
  })

  it('becomes Paid once a plan is bought, even though it signed up as Free', () => {
    const ent = entitlements(suite({ accountType: 'free' }), NOW)
    expect(ent.accountType).toBe('paid')
    expect(ent.seatLimit).toBe(12)
  })
})

describe('entitlements: Paid and Comped', () => {
  it('limits Suite people by its seats', () => {
    const ent = entitlements(suite(), NOW, usage({ members: 12, persons: 12 }))
    expect(ent).toMatchObject({ accountType: 'paid', status: 'active', access: 'full', seatLimit: 12, seatsUsed: 12, trialing: false, trialDaysLeft: null })
    expect(ent.reasons).toEqual(['seat_limit_reached'])
  })

  it('keeps full access in the past-due grace and says why', () => {
    const ent = entitlements(suite({ currentPeriodEnd: ago(3) }), NOW)
    expect(ent.status).toBe('past_due')
    expect(ent.access).toBe('full')
    expect(ent.reasons).toEqual(['payment_due'])
  })

  it('goes read-only after the grace, with subscription wording', () => {
    const ent = entitlements(suite({ currentPeriodEnd: ago(10) }), NOW)
    expect(ent.access).toBe('read_only')
    expect(ent.reasons).toEqual(['payment_due'])
    expect(ent.readOnlyMessage).toBe('Your subscription has ended — choose a plan to keep editing')
  })

  it('follows a custom plan: Muster Starter has no payroll, Orbit off', () => {
    const ent = entitlements({ subscription: { status: 'active', plan: 'custom', products: { work: true, muster: 'starter' }, quantities: { work: 6 }, currentPeriodEnd: new Date(NOW.getTime() + DAY) } }, NOW)
    expect(ent.products).toEqual(['work', 'muster'])
    expect(ent.musterTier).toBe('starter')
    expect(canUseFeature(ent, 'muster.payroll')).toBe(false)
    expect(canUseFeature(ent, 'muster.leave')).toBe(true)
    expect(ent.seatLimit).toBe(6)
  })

  it('treats Comped like a plan, billed and counted, whatever the plan', () => {
    const ent = entitlements(suite({ accountType: 'comped', amountPaise: 0 }), NOW)
    expect(ent).toMatchObject({ accountType: 'comped', billed: true, inMetrics: true, access: 'full', seatLimit: 12 })
  })
})

describe('entitlements: Internal and Test', () => {
  it.each(['internal', 'test'] as const)('%s is never billed, unlimited and always open, even with an ended plan', (type) => {
    const ent = entitlements({ subscription: { status: 'expired', plan: 'trial', accountType: type, trialEndsAt: ago(400) } }, NOW, usage({ members: 90 }))
    expect(ent).toMatchObject({ accountType: type, billed: false, inMetrics: false, access: 'full', trialing: false, trialDaysLeft: null, seatLimit: null, seatsUsed: 90, folioFirmLimit: Number.POSITIVE_INFINITY, musterTier: 'business' })
    expect(ent.products).toEqual(ALL)
    expect(ent.reasons).toEqual(['house_account'])
  })

  it('still blocks a disabled or deleted Test workspace', () => {
    expect(entitlements({ subscription: { status: 'active', plan: 'suite', accountType: 'test' }, disabled: true }, NOW)).toMatchObject({ access: 'blocked', reasons: ['disabled'] })
    expect(entitlements({ subscription: { status: 'active', plan: 'suite', accountType: 'test' }, deletedAt: NOW }, NOW)).toMatchObject({ access: 'blocked', reasons: ['deleted'] })
  })
})

describe('entitlements: products switched off and gates', () => {
  it('keeps entitled products apart from enabled ones', () => {
    const ent = entitlements({ ...trial(1), enabledProducts: ['work', 'folio'] }, NOW)
    expect(ent.entitledProducts).toEqual(ALL)
    expect(ent.products).toEqual(['work', 'folio'])
    expect(canUseProduct(ent, 'orbit')).toBe(false)
  })

  it('falls back to the product for feature keys the catalog does not list', () => {
    const ent = entitlements(trial(1), NOW)
    expect(canUseFeature(ent, 'work.something_new')).toBe(true)
    expect(canUseFeature(ent, 'core.anything')).toBe(false)
  })

  it('lets cron jobs run only for writable workspaces with the product', () => {
    expect(canWrite(trial(1), 'orbit', NOW)).toBe(true)
    expect(canWrite(trial(20), 'orbit', NOW)).toBe(false)
    expect(canWrite({ ...trial(1), enabledProducts: ['work'] }, 'orbit', NOW)).toBe(false)
  })
})

describe('entitlements: paid add-ons and the Free plan (owner decision D9)', () => {
  it('gives Free no portal, custom domains or Meetings AI, even when one was switched on', () => {
    // Arrange
    const plain = free(10)
    const switchedOn: OrgLike = { subscription: { ...newFreeSubscription(ago(10)), addOns: ['portal', 'domains', 'meetings_ai'] } }
    // Act
    const ents = [entitlements(plain, NOW), entitlements(switchedOn, NOW)]
    // Assert
    for (const ent of ents) {
      expect(ent.features).not.toContain('portal')
      expect(ent.features).not.toContain('domains')
      expect(ent.features).not.toContain('meetings_ai')
      expect(canUseFeature(ent, 'portal')).toBe(false)
    }
  })

  it('still gives a 15-day trial and Suite their add-ons', () => {
    expect(entitlements(trial(3), NOW).features).toEqual(expect.arrayContaining(['portal', 'domains', 'meetings_ai']))
    expect(entitlements(suite(), NOW).features).toContain('portal')
    expect(entitlements(suite({ addOns: ['domains'] }), NOW).features).toContain('domains')
  })

  it('gives a paid workspace that signed up as Free the add-ons it bought', () => {
    expect(entitlements(suite({ accountType: 'free', addOns: ['meetings_ai'] }), NOW).features).toContain('meetings_ai')
  })
})
