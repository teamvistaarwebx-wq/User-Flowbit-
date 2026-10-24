import { describe, expect, it } from 'vitest'
import { DEFAULT_WALLET_SETTINGS, allowanceFor } from '@/modules/wallet/rules'
import { noticeContent } from '@/modules/lifecycle/content'
import { welcomeContent } from '@/modules/console/welcome-content'
import type { LifecycleNotice } from '@/lib/lifecycle-notices'
import { setupStartRefusal, setupWeekStart } from './handover'
import { claimTrialExtension, TRIAL_ALREADY_EXTENDED, trialExtensionRefusal, type ExtensionStore } from './roles'

const yearly = { accountType: 'paid', cycle: 'yearly', status: 'active', started: false, startedThisWeek: 0, cap: 5 }

describe('free setup cap (console spec 9)', () => {
  it('weeks start on Monday 00:00 IST', () => {
    // Sunday 23:00 IST is still the old week; Monday 00:30 IST is the new one.
    expect(setupWeekStart(new Date('2026-10-11T17:30:00Z')).toISOString()).toBe('2026-10-04T18:30:00.000Z')
    expect(setupWeekStart(new Date('2026-10-11T19:00:00Z')).toISOString()).toBe('2026-10-11T18:30:00.000Z')
  })

  it('allows yearly customers up to the weekly cap, then refuses', () => {
    expect(setupStartRefusal(yearly)).toBeNull()
    expect(setupStartRefusal({ ...yearly, startedThisWeek: 4 })).toBeNull()
    expect(setupStartRefusal({ ...yearly, startedThisWeek: 5 })).toMatch(/This week's 5 free setups are taken/)
    expect(setupStartRefusal({ ...yearly, cap: 0 })).toMatch(/free setups are taken/)
  })

  it('refuses monthly, Free, Trial and lapsed plans', () => {
    expect(setupStartRefusal({ ...yearly, cycle: 'monthly' })).toMatch(/yearly customers/)
    expect(setupStartRefusal({ ...yearly, accountType: 'free' })).toMatch(/yearly customers/)
    expect(setupStartRefusal({ ...yearly, accountType: 'trial', cycle: null })).toMatch(/yearly customers/)
    expect(setupStartRefusal({ ...yearly, status: 'expired' })).toMatch(/yearly customers/)
  })

  it('never refuses a setup already running, or Flowbit’s own workspaces', () => {
    expect(setupStartRefusal({ ...yearly, started: true, startedThisWeek: 99, cycle: 'monthly' })).toBeNull()
    expect(setupStartRefusal({ ...yearly, accountType: 'internal', cycle: null, startedThisWeek: 99 })).toBeNull()
  })
})

/** A store whose claim is one atomic check-and-increment, as the Mongo filter is. */
function memoryStore(): ExtensionStore & { count: () => number } {
  let n = 0
  return {
    claim: async (_orgId, onlyFirst) => {
      await Promise.resolve()
      if (onlyFirst && n >= 1) return false
      n += 1
      return true
    },
    release: async () => {
      n = Math.max(0, n - 1)
    },
    count: () => n,
  }
}

describe('trial extension (V2-REVIEW C9)', () => {
  it('lets two parallel Sales requests extend only once', async () => {
    const store = memoryStore()
    const moved: number[] = []
    const results = await Promise.all([1, 2].map((i) => claimTrialExtension(store, { orgId: 'o1', role: 'sales' }, async () => void moved.push(i))))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: TRIAL_ALREADY_EXTENDED })
    expect(moved).toHaveLength(1)
    expect(store.count()).toBe(1)
  })

  it('lets Admin extend again, and gives the claim back when the trial could not move', async () => {
    const store = memoryStore()
    await claimTrialExtension(store, { orgId: 'o1', role: 'sales' }, async () => undefined)
    expect((await claimTrialExtension(store, { orgId: 'o1', role: 'admin' }, async () => undefined)).ok).toBe(true)
    await expect(claimTrialExtension(store, { orgId: 'o1', role: 'admin' }, async () => Promise.reject(new Error('db down')))).rejects.toThrow('db down')
    expect(store.count()).toBe(2)
  })

  it('reads the Sales maximum from Console settings', () => {
    expect(trialExtensionRefusal('sales', { extensionsSoFar: 0, days: 10, maxDays: 7 })).toMatch(/at most 7 days/)
    expect(trialExtensionRefusal('sales', { extensionsSoFar: 0, days: 7, maxDays: 7 })).toBeNull()
  })
})

describe('WhatsApp free allowance per workspace', () => {
  const settings = { allowance: { ...DEFAULT_WALLET_SETTINGS.allowance, suite: 1000 } }
  it('uses the plan’s allowance unless an Admin set one for the workspace (0 counts)', () => {
    expect(allowanceFor({ plan: 'suite' }, settings, null)).toBe(1000)
    expect(allowanceFor({ plan: 'suite' }, settings, 2500)).toBe(2500)
    expect(allowanceFor({ plan: 'suite' }, settings, 0)).toBe(0)
    expect(allowanceFor({ accountType: 'free', plan: 'trial' }, settings, 50)).toBe(50)
    expect(allowanceFor({ plan: 'suite' }, settings, -3)).toBe(1000)
  })
})

describe('Console templates in emails', () => {
  const notice = (kind: 'trial_ending' | 'free_ending'): LifecycleNotice => ({ kind, key: `${kind}:3`, date: new Date('2026-10-11T06:00:00Z'), lifecycle: { daysLeft: 3, freeWindowEndsAt: null, accountType: kind === 'free_ending' ? 'free' : 'trial' } } as unknown as LifecycleNotice)

  it('opens the trial and Free reminders with the Console wording', () => {
    const trial = noticeContent(notice('trial_ending'), 'Acme', { templates: { trialEnding: 'Only {days} days left on your trial.' } })
    expect(trial.paragraphs[0]).toBe('Only 3 days left on your trial.')
    const free = noticeContent(notice('free_ending'), 'Acme', { templates: { freeEnding: 'Free ends {date}.' }, freeSeats: 8 })
    expect(free.paragraphs[0]).toBe('Free ends 11 October 2026.')
    expect(free.paragraphs[1]).toContain('up to 8 people')
    expect(noticeContent(notice('trial_ending'), 'Acme').paragraphs[0]).toContain('The free trial of Acme ends')
  })

  it('opens the welcome email with the Console wording and limits', () => {
    const mail = welcomeContent({ name: 'Asha Rao', workspace: 'Acme', accountType: 'trial', endsAt: new Date('2026-10-29T06:00:00Z'), template: 'Hello {name}!', limits: { freeSeats: 5, trialDays: 21 } })
    expect(mail.paragraphs[0]).toBe('Hello Asha!')
    expect(mail.paragraphs[1]).toContain('21-day trial')
  })
})
