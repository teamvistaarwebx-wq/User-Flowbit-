import { describe, expect, it } from 'vitest'
import { CONSOLE_PERMS, ROLE_PERMS, staffCan, trialExtensionRefusal, type ConsolePerm } from './roles'

/** The role table of console spec 7.1, permission by permission. */
const MATRIX: Record<ConsolePerm, [admin: boolean, sales: boolean, accounts: boolean]> = {
  'accounts.view': [true, true, true],
  'accounts.note': [true, true, true],
  'accounts.assign': [true, false, false],
  'trial.extend_once': [true, true, false],
  'trial.extend_more': [true, false, false],
  'trial.end': [true, false, false],
  'account.set_type': [true, false, false],
  'account.set_plan': [true, false, false],
  'account.set_status': [true, false, false],
  'account.disable': [true, false, false],
  'account.restore': [true, false, false],
  'support.request': [true, true, true],
  'import.run': [true, true, false],
  'handover.manage': [true, true, false],
  'billing.view': [true, false, true],
  'invoice.cancel': [true, false, true],
  'bill.create': [true, true, true],
  'payment.record': [true, false, true],
  'payment.verify': [true, false, true],
  'credit_note.issue': [true, false, true],
  'tds.manage': [true, false, true],
  'inbox.reply': [true, true, true],
  'wallet.grant': [true, false, false],
  'reports.view': [true, true, true],
  'breach.notify': [true, false, false],
  'staff.manage': [true, false, false],
  'settings.edit': [true, false, false],
}

describe('console role permission matrix', () => {
  it('covers every permission', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...CONSOLE_PERMS].sort())
  })

  it.each(Object.entries(MATRIX))('%s', (perm, [admin, sales, accounts]) => {
    expect(staffCan('admin', perm as ConsolePerm)).toBe(admin)
    expect(staffCan('sales', perm as ConsolePerm)).toBe(sales)
    expect(staffCan('accounts', perm as ConsolePerm)).toBe(accounts)
  })

  it('gives nothing without a role', () => {
    expect(staffCan(null, 'accounts.view')).toBe(false)
    expect(staffCan(undefined, 'staff.manage')).toBe(false)
  })

  it('gives Admin every permission', () => {
    expect(ROLE_PERMS.admin.size).toBe(CONSOLE_PERMS.length)
  })
})

describe('trial extension rule (spec 4.1)', () => {
  it('lets Sales extend once by up to 15 days', () => {
    expect(trialExtensionRefusal('sales', { extensionsSoFar: 0, days: 15 })).toBeNull()
    expect(trialExtensionRefusal('sales', { extensionsSoFar: 0, days: 16 })).toMatch(/at most 15 days/)
    expect(trialExtensionRefusal('sales', { extensionsSoFar: 1, days: 5 })).toMatch(/already extended once/)
  })

  it('lets Admin extend again and for longer', () => {
    expect(trialExtensionRefusal('admin', { extensionsSoFar: 3, days: 60 })).toBeNull()
  })

  it('refuses Accounts', () => {
    expect(trialExtensionRefusal('accounts', { extensionsSoFar: 0, days: 5 })).toMatch(/Only Sales or Admin/)
  })
})
