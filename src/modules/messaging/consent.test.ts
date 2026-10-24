import { describe, expect, it } from 'vitest'
import { allowedRecipients, isStopKeyword, isSuppressed, type SuppressionEntry } from './consent'
import { canAdvance, isEssentialKind, refundsOnFailure, resendEvent } from './delivery-status'

const list: SuppressionEntry[] = [
  { channel: 'email', address: 'Asha@Example.in', scope: 'non_essential' },
  { channel: 'whatsapp', address: '+919800000000', scope: 'all' },
]

describe('suppression', () => {
  it('stops non-essential mail to an unsubscribed address, matching case-insensitively', () => {
    expect(isSuppressed(list, 'email', 'asha@example.in', false)).toBe(true)
  })

  it('still sends essential mail (security, payslips, documents) after an unsubscribe', () => {
    expect(isSuppressed(list, 'email', 'asha@example.in', true)).toBe(false)
  })

  it('blocks everything on WhatsApp after STOP', () => {
    expect(isSuppressed(list, 'whatsapp', '+919800000000', true)).toBe(true)
    expect(isSuppressed(list, 'email', '+919800000000', false)).toBe(false)
  })

  it('filters a recipient list without changing the input', () => {
    const to = ['ravi@example.in', 'ASHA@example.in']
    expect(allowedRecipients(list, 'email', to, false)).toEqual(['ravi@example.in'])
    expect(to).toHaveLength(2)
  })

  it('recognises STOP replies', () => {
    expect(isStopKeyword('STOP')).toBe(true)
    expect(isStopKeyword(' stop! ')).toBe(true)
    expect(isStopKeyword('Unsubscribe')).toBe(true)
    expect(isStopKeyword('please stop by tomorrow')).toBe(false)
  })
})

describe('essential mail', () => {
  it('treats alerts, digests, briefs and onboarding as non-essential', () => {
    expect(isEssentialKind('alert')).toBe(false)
    expect(isEssentialKind('digest')).toBe(false)
    expect(isEssentialKind('brief')).toBe(false)
    expect(isEssentialKind('security')).toBe(true)
    expect(isEssentialKind('payslip')).toBe(true)
    expect(isEssentialKind('invoice')).toBe(true)
    expect(isEssentialKind(undefined)).toBe(true)
  })
})

describe('provider callbacks', () => {
  it('maps Resend events, suppressing bounces and complaints', () => {
    expect(resendEvent('email.delivered')?.status).toBe('delivered')
    expect(resendEvent('email.bounced')).toMatchObject({ status: 'failed', suppress: 'bounced' })
    expect(resendEvent('email.complained')).toMatchObject({ status: null, suppress: 'complained' })
    expect(resendEvent('email.unknown')).toBeNull()
  })

  it('only moves a status forward', () => {
    expect(canAdvance('sent', 'delivered')).toBe(true)
    expect(canAdvance('delivered', 'read')).toBe(true)
    expect(canAdvance('read', 'delivered')).toBe(false)
    expect(canAdvance('delivered', 'sent')).toBe(false)
    expect(canAdvance('sent', 'failed')).toBe(true)
    expect(canAdvance('failed', 'delivered')).toBe(false)
    expect(canAdvance('skipped', 'sent')).toBe(false)
  })
})

describe('V2-REVIEW P1: wallet refunds on a failed tick', () => {
  it('refunds only failures before delivery, so a forged "failed" for a delivered message returns nothing', () => {
    expect(refundsOnFailure('queued')).toBe(true)
    expect(refundsOnFailure('sending')).toBe(true)
    expect(refundsOnFailure('sent')).toBe(true)
    expect(refundsOnFailure('delivered')).toBe(false)
    expect(refundsOnFailure('read')).toBe(false)
  })
})
