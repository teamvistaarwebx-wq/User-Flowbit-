import { describe, expect, it } from 'vitest'
import { freeEndsAt } from './account-types'
import { dueNotice, thresholdReached } from './lifecycle-notices'
import { newFreeSubscription, newSignupTrialSubscription, type OrgLike } from './plans'

const START = new Date('2026-10-08T04:00:00Z')
const DAY = 86_400_000
const free: OrgLike = { createdAt: START, subscription: newFreeSubscription(START) }
const trial: OrgLike = { createdAt: START, subscription: newSignupTrialSubscription(START) }

/** Runs the daily cron (and a few page loads a day) from signup for `days` days; returns every key it would send, in order. */
function simulate(org: OrgLike, days: number, runsPerDay = 3): string[] {
  const sent = new Set<string>()
  const order: string[] = []
  for (let d = 0; d <= days; d += 1) {
    for (let r = 0; r < runsPerDay; r += 1) {
      const notice = dueNotice(org, new Date(START.getTime() + d * DAY + r * 5 * 3_600_000))
      if (!notice || sent.has(notice.key)) continue
      sent.add(notice.key)
      order.push(notice.key)
    }
  }
  return order
}

describe('thresholdReached', () => {
  it('picks the tightest threshold reached', () => {
    expect(thresholdReached(40, [30, 7, 1])).toBeNull()
    expect(thresholdReached(30, [30, 7, 1])).toBe(30)
    expect(thresholdReached(6, [30, 7, 1])).toBe(7)
    expect(thresholdReached(0, [30, 7, 1])).toBe(1)
  })
})

describe('lifecycle reminders', () => {
  it('Free: 30, 7 and 1 days before the 6 months end, then read-only, blocked and the three deletion notices, each once', () => {
    const end = freeEndsAt(START).toISOString().slice(0, 10)
    const keys = simulate(free, 400)
    expect(keys.slice(0, 3)).toEqual([`free-30d:${end}`, `free-7d:${end}`, `free-1d:${end}`])
    expect(keys[3]).toMatch(/^read-only:/)
    expect(keys[4]).toMatch(/^blocked:/)
    expect(keys.slice(5).map((k) => k.split(':')[0])).toEqual(['deletion-30d', 'deletion-7d', 'deletion-1d'])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses Free wording for Free and trial wording for a trial', () => {
    const atFree = dueNotice(free, new Date(freeEndsAt(START).getTime() - 5 * DAY))
    expect(atFree?.kind).toBe('free_ending')
    const atTrial = dueNotice(trial, new Date(START.getTime() + 13 * DAY))
    expect(atTrial?.kind).toBe('trial_ending')
    expect(atTrial?.key).toMatch(/^trial-3d:/)
  })

  it('Trial: 3 and 1 days before the end, no duplicates', () => {
    const keys = simulate(trial, 20)
    expect(keys.map((k) => k.split(':')[0])).toEqual(['trial-3d', 'trial-1d', 'read-only'])
  })

  it('a missed day sends the next threshold, never the ones it skipped', () => {
    const sixDaysLeft = new Date(freeEndsAt(START).getTime() - 6 * DAY)
    expect(dueNotice(free, sixDaysLeft)?.key.startsWith('free-7d')).toBe(true)
  })

  it('a new end date gives new keys (a trial started from Free counts to its own end)', () => {
    const a = dueNotice(trial, new Date(START.getTime() + 13 * DAY))
    const laterTrial: OrgLike = { createdAt: START, subscription: newSignupTrialSubscription(new Date(START.getTime() + 40 * DAY)) }
    const b = dueNotice(laterTrial, new Date(START.getTime() + 53 * DAY))
    expect(a?.key).not.toBe(b?.key)
  })

  it('house workspaces and paid plans in good standing get none', () => {
    expect(dueNotice({ subscription: { ...newFreeSubscription(START), accountType: 'test' } }, new Date(START.getTime() + 400 * DAY))).toBeNull()
    expect(dueNotice({ subscription: { status: 'active', plan: 'suite', accountType: 'paid', currentPeriodEnd: new Date(START.getTime() + 2 * DAY) } }, START)).toBeNull()
  })
})
