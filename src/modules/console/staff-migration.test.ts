import { describe, expect, it } from 'vitest'
import { defaultConsoleSettings, mergeConsoleSettings } from '@/lib/console/settings-defaults'
import { planStaffMigration } from './staff-migration'

describe('staff migration plan (dry run, V2-REVIEW C6)', () => {
  const admin = { userId: 'u1', email: 'Sanskaar@VistaarSWS.com', name: 'Sanskaar Singh', passwordHash: 'hash1' }
  const others = {
    platformAdmins: [admin, { userId: 'u3', email: 'old.admin@vistaarsws.com', name: 'Old Admin', passwordHash: 'hash3' }],
    usersByEmail: new Map([['ops@vistaarsws.com', { userId: 'u2', email: 'ops@vistaarsws.com', name: 'Ops', passwordHash: 'hash2' }]]),
    listedEmails: ['sanskaar@vistaarsws.com', ' ops@vistaarsws.com ', 'new.person@vistaarsws.com'],
    existingStaffEmails: new Set<string>(),
  }

  it('creates only the founder by default and never carries a product password over', () => {
    const plan = planStaffMigration({ ...others, founder: 'sanskaar@vistaarsws.com', includeOthers: false })
    expect(plan.create).toEqual([{ email: 'sanskaar@vistaarsws.com', name: 'Sanskaar Singh', userId: 'u1', isFounder: true, source: 'founder' }])
    expect(plan.create.some((c) => 'passwordHash' in c)).toBe(false)
    expect(plan.skip.map((s) => s.email)).toEqual(['old.admin@vistaarsws.com', 'ops@vistaarsws.com', 'new.person@vistaarsws.com'])
    expect(plan.skip[0].reason).toMatch(/not the founder/)
  })

  it('creates nobody without a founder unless --all is given', () => {
    expect(planStaffMigration({ ...others, founder: null, includeOthers: false }).create).toEqual([])
  })

  it('adds the others with --all, each once, all without passwords', () => {
    const plan = planStaffMigration({ ...others, founder: 'sanskaar@vistaarsws.com', includeOthers: true })
    expect(plan.create.map((c) => [c.email, c.isFounder, c.source])).toEqual([
      ['sanskaar@vistaarsws.com', true, 'founder'],
      ['old.admin@vistaarsws.com', false, 'isPlatformAdmin'],
      ['ops@vistaarsws.com', false, 'PLATFORM_ADMIN_EMAILS'],
      ['new.person@vistaarsws.com', false, 'PLATFORM_ADMIN_EMAILS'],
    ])
    expect(plan.create.find((c) => c.email === 'new.person@vistaarsws.com')?.name).toBe('New Person')
  })

  it('skips people who are already staff and does nothing on an empty input', () => {
    const plan = planStaffMigration({ platformAdmins: [admin], usersByEmail: new Map(), listedEmails: [], existingStaffEmails: new Set(['sanskaar@vistaarsws.com']), founder: 'sanskaar@vistaarsws.com', includeOthers: true })
    expect(plan.create).toEqual([])
    expect(plan.skip).toEqual([{ email: 'sanskaar@vistaarsws.com', reason: 'already Console staff' }])
    expect(planStaffMigration({ platformAdmins: [], usersByEmail: new Map(), listedEmails: [''], existingStaffEmails: new Set(), founder: null, includeOthers: true })).toEqual({ create: [], skip: [] })
  })
})

describe('Console settings', () => {
  it('fills gaps with the defaults and drops bad values', () => {
    const base = defaultConsoleSettings()
    expect(mergeConsoleSettings(null)).toEqual(base)
    const merged = mergeConsoleSettings({
      prices: { suite: 199, work: -5, unknown: 1 } as never,
      limits: { freeSeats: 7, freeMonths: 1.5 } as never,
      templates: { welcome: '  Hi {name}  ' } as never,
      helpLinks: { data: 'https://youtu.be/abc', roles: 'javascript:alert(1)', pm: '/help/pm' } as never,
    })
    expect(merged.prices.suite).toBe(199)
    expect(merged.prices.work).toBe(base.prices.work)
    expect(merged.prices).not.toHaveProperty('unknown')
    expect(merged.limits.freeSeats).toBe(7)
    expect(merged.limits.freeMonths).toBe(base.limits.freeMonths)
    expect(merged.templates.welcome).toBe('Hi {name}')
    expect(merged.helpLinks).toMatchObject({ data: 'https://youtu.be/abc', roles: '#', pm: '/help/pm' })
  })
})
