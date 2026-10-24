import { describe, expect, it } from 'vitest'
import { freeEndsAt } from './account-types'
import { deletionDue, freeReturnFields, freeReturnRefusal, freeWindowEnd, lifecycleOf, trialStartFields, trialStartRefusal } from './lifecycle'
import { newFreeSubscription, newSignupTrialSubscription, type OrgLike } from './plans'

const NOW = new Date('2026-10-08T06:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)
const later = (days: number) => new Date(NOW.getTime() + days * DAY)
const iso = (d: Date | null) => d?.toISOString() ?? null

/** A Free workspace that signed up `daysAgo` days before NOW. */
const free = (daysAgo: number, extra: object = {}): OrgLike => ({ createdAt: ago(daysAgo), subscription: { ...newFreeSubscription(ago(daysAgo)), ...extra } })
/** A workspace that signed up as a 15-day Trial `daysAgo` days before NOW. */
const signupTrial = (daysAgo: number): OrgLike => ({ createdAt: ago(daysAgo), subscription: newSignupTrialSubscription(ago(daysAgo)) })
const paid = (extra: object = {}): OrgLike => ({ subscription: { status: 'active', plan: 'suite', seats: 12, accountType: 'paid', currentPeriodEnd: later(10), ...extra } })

describe('lifecycle timeline', () => {
  it('Free: full access for 6 months, then 30 days read-only, then blocked, then deletion 90 days later', () => {
    const signup = ago(10)
    const end = freeEndsAt(signup)
    const running = lifecycleOf(free(10), NOW)
    expect(running).toMatchObject({ stage: 'free', accountType: 'free', readOnlyFrom: null, blockedFrom: null, deleteAt: null })
    expect(iso(running.endsAt)).toBe(iso(end))

    const afterEnd = new Date(end.getTime() + 5 * DAY)
    const readOnly = lifecycleOf(free(10), afterEnd)
    expect(readOnly.stage).toBe('read_only')
    expect(iso(readOnly.readOnlyFrom)).toBe(iso(end))
    expect(iso(readOnly.blockedFrom)).toBe(iso(new Date(end.getTime() + 30 * DAY)))
    expect(iso(readOnly.deleteAt)).toBe(iso(new Date(end.getTime() + 120 * DAY)))
    expect(readOnly.daysLeft).toBe(25)

    const blocked = lifecycleOf(free(10), new Date(end.getTime() + 31 * DAY))
    expect(blocked.stage).toBe('blocked')
    expect(blocked.endsAt?.getTime()).toBe(end.getTime() + 120 * DAY)
    expect(blocked.daysLeft).toBe(89)
  })

  it('Trial: 15 days, then read-only from the trial end', () => {
    expect(lifecycleOf(signupTrial(3), NOW)).toMatchObject({ stage: 'trial', daysLeft: 12 })
    const ended = lifecycleOf(signupTrial(20), NOW)
    expect(ended.stage).toBe('read_only')
    expect(iso(ended.readOnlyFrom)).toBe(iso(later(-5)))
    expect(iso(ended.deleteAt)).toBe(iso(later(-5 + 120)))
  })

  it('Paid: runs to the renewal; a lapse is read-only after the 7-day grace, then blocked and deleted', () => {
    expect(lifecycleOf(paid(), NOW)).toMatchObject({ stage: 'paid', daysLeft: 10, deleteAt: null })
    const inGrace = lifecycleOf(paid({ currentPeriodEnd: ago(3) }), NOW)
    expect(inGrace).toMatchObject({ stage: 'paid', daysLeft: 4 })
    const lapsed = lifecycleOf(paid({ currentPeriodEnd: ago(10) }), NOW)
    expect(lapsed.stage).toBe('read_only')
    expect(iso(lapsed.readOnlyFrom)).toBe(iso(ago(3)))
    expect(iso(lapsed.deleteAt)).toBe(iso(later(-3 + 120)))
  })

  it('house, disabled and deleted workspaces have no dates', () => {
    expect(lifecycleOf({ subscription: { status: 'expired', plan: 'trial', accountType: 'test' } }, NOW)).toMatchObject({ stage: 'house', deleteAt: null })
    expect(lifecycleOf({ ...free(400), disabled: true }, NOW).stage).toBe('disabled')
    expect(lifecycleOf({ ...free(400), status: 'deleted' }, NOW).stage).toBe('deleted')
  })
})

describe('deletion is due 90 days after blocking', () => {
  it('only when the deletion date has passed', () => {
    const org = free(10)
    const end = freeEndsAt(ago(10))
    expect(deletionDue(org, new Date(end.getTime() + 119 * DAY))).toBe(false)
    expect(deletionDue(org, new Date(end.getTime() + 120 * DAY))).toBe(true)
  })

  it('never for Internal, Test, or Comped before its end date', () => {
    const at = later(400)
    const expired = { status: 'expired', plan: 'trial', trialEndsAt: ago(10) }
    expect(deletionDue({ subscription: { ...expired, accountType: 'internal' } }, at)).toBe(false)
    expect(deletionDue({ subscription: { ...expired, accountType: 'test' } }, at)).toBe(false)
    expect(deletionDue({ subscription: { ...expired, plan: 'suite', accountType: 'comped', compedUntil: later(500) } }, at)).toBe(false)
    expect(deletionDue({ subscription: { ...expired, plan: 'suite', accountType: 'comped' } }, at)).toBe(false)
    expect(deletionDue({ subscription: { ...expired, plan: 'suite', accountType: 'comped', compedUntil: later(100) } }, at)).toBe(true)
  })

  it('never for a workspace staff disabled or already deleted', () => {
    expect(deletionDue({ ...free(400), disabled: true }, later(400))).toBe(false)
    expect(deletionDue({ ...free(400), status: 'deleted' }, later(400))).toBe(false)
  })
})

describe('start trial: once per workspace', () => {
  it('a running Free workspace may start it; the trial runs 15 days and keeps the Free end', () => {
    const org = free(10)
    expect(trialStartRefusal(org, NOW)).toBeNull()
    const fields = trialStartFields(org, NOW)
    expect(fields).toMatchObject({ accountType: 'trial', status: 'trialing', trialStartedAt: NOW })
    expect(fields.trialEndsAt.getTime() - NOW.getTime()).toBe(15 * DAY)
    expect(iso(fields.freeEndsAt)).toBe(iso(freeEndsAt(ago(10))))
  })

  it('refuses a second trial, a trial from a non-Free workspace, and one after the free months ended', () => {
    const started: OrgLike = { ...free(10), subscription: { ...free(10).subscription!, ...trialStartFields(free(10), NOW) } }
    expect(trialStartRefusal(started, NOW)).toBe('not_free')
    const backOnFree: OrgLike = { ...started, subscription: { ...started.subscription!, ...freeReturnFields(started, NOW) } }
    expect(trialStartRefusal(backOnFree, NOW)).toBe('used')
    expect(trialStartRefusal(signupTrial(3), NOW)).toBe('not_free')
    expect(trialStartRefusal(paid(), NOW)).toBe('not_free')
    expect(trialStartRefusal(free(200), NOW)).toBe('not_active')
  })
})

describe('trimming a trial back to Free', () => {
  it('within the 6 months and at 5 seats or fewer, the trial returns to Free until the 6 months end', () => {
    const org = signupTrial(20)
    expect(iso(freeWindowEnd(org))).toBe(iso(freeEndsAt(ago(20))))
    expect(freeReturnRefusal(org, 5, NOW)).toBeNull()
    const fields = freeReturnFields(org, NOW)
    expect(fields).toMatchObject({ accountType: 'free', status: 'trialing', seats: 5 })
    expect(iso(fields.trialEndsAt)).toBe(iso(freeEndsAt(ago(20))))
    expect(fields.trialStartedAt).toBeTruthy()
    const after: OrgLike = { ...org, subscription: { ...org.subscription!, ...fields } }
    expect(lifecycleOf(after, NOW).stage).toBe('free')
  })

  it('needs 5 seats or fewer, a window still open and no plan bought', () => {
    expect(freeReturnRefusal(signupTrial(20), 6, NOW)).toBe('too_many')
    expect(freeReturnRefusal(signupTrial(190), 3, NOW)).toBe('window_over')
    expect(freeReturnRefusal(paid(), 3, NOW)).toBe('not_trial')
    expect(freeReturnRefusal(free(10), 3, NOW)).toBe('not_trial')
  })

  it('a trial started from Free returns to the original Free end, not a new 6 months', () => {
    const org = free(100)
    const trial: OrgLike = { ...org, subscription: { ...org.subscription!, ...trialStartFields(org, NOW) } }
    expect(iso(freeReturnFields(trial, later(20)).trialEndsAt)).toBe(iso(freeEndsAt(ago(100))))
  })
})
