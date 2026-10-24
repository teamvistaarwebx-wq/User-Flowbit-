import { describe, expect, it } from 'vitest'
import { trialExtensionRefusal } from './roles'
import { ADMIN_MAX_EXTENSION_DAYS, extendDialogCopy, windowEndFields, windowWords } from './extension-copy'

describe('Extend trial dialog copy', () => {
  it('follows the Console setting for Sales, so the pre-filled days are accepted', () => {
    const copy = extendDialogCopy({ salesOnce: true, salesMaxDays: 7 })
    expect(copy).toEqual({ description: 'Sales can extend a trial once, by up to 7 days. Anything more needs an Admin.', help: '1–7. Counted from today or the current end, whichever is later.', defaultDays: '7' })
    expect(trialExtensionRefusal('sales', { extensionsSoFar: 0, days: Number(copy.defaultDays), maxDays: 7 })).toBeNull()
  })

  it('gives Admins the full range', () => {
    expect(extendDialogCopy({ salesOnce: false, salesMaxDays: 7 })).toEqual({ help: `1–${ADMIN_MAX_EXTENSION_DAYS}. Counted from today or the current end, whichever is later.`, defaultDays: '14' })
  })
})

describe('Free plan vs trial windows', () => {
  const ends = new Date('2026-11-01T00:00:00Z')

  it('moves both the trial end and the Free end for a Free account', () => {
    expect(windowEndFields('free', ends)).toEqual({ 'subscription.trialEndsAt': ends, 'subscription.freeEndsAt': ends })
    expect(windowEndFields('trial', ends)).toEqual({ 'subscription.trialEndsAt': ends })
  })

  it('words the actions by account type', () => {
    expect(windowWords('free')).toMatchObject({ noun: 'Free plan', extendLabel: 'Extend Free plan', endLabel: 'End Free plan now' })
    expect(windowWords('trial')).toMatchObject({ noun: 'trial', extendLabel: 'Extend trial', endLabel: 'End trial now' })
  })
})
