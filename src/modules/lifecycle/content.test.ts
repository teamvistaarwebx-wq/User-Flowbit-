import { describe, expect, it } from 'vitest'
import { dueNotice } from '@/lib/lifecycle-notices'
import { newFreeSubscription, newSignupTrialSubscription } from '@/lib/plans'
import { noticeContent, onboardingContent } from './content'

const START = new Date('2026-10-08T04:00:00Z')
const DAY = 86_400_000

describe('lifecycle email content', () => {
  it('Free reminders talk about the Free plan, not a trial', () => {
    const notice = dueNotice({ createdAt: START, subscription: newFreeSubscription(START) }, new Date(START.getTime() + 176 * DAY))!
    const mail = noticeContent(notice, 'Acme')
    expect(mail.subject).toMatch(/^Your Free plan ends in \d+ days: Acme$/)
    expect(mail.paragraphs.join(' ')).not.toMatch(/trial/i)
    expect(mail.paragraphs.join(' ')).toContain('https://useflowbit.com/pricing')
  })

  it('trial, read-only, blocked and deletion notices say what happens next and link to useflowbit.com', () => {
    const trial = { createdAt: START, subscription: newSignupTrialSubscription(START) }
    expect(noticeContent(dueNotice(trial, new Date(START.getTime() + 14 * DAY))!, 'Acme').subject).toBe('Your trial ends tomorrow: Acme')
    const readOnly = noticeContent(dueNotice(trial, new Date(START.getTime() + 16 * DAY))!, 'Acme')
    expect(readOnly.paragraphs.join(' ')).toContain('download old payslips')
    const blocked = noticeContent(dueNotice(trial, new Date(START.getTime() + 46 * DAY))!, 'Acme')
    expect(blocked.subject).toBe('Acme is locked')
    const deletion = noticeContent(dueNotice(trial, new Date(START.getTime() + 130 * DAY))!, 'Acme')
    expect(deletion.subject).toBe('Acme will be deleted in 5 days')
    expect(deletion.cta.href).toBe('/app/settings/export')
  })

  it('Free-ending email states the first-year yearly discount from the Console setting once, and drops it at 0 (R2 17.1)', () => {
    // Arrange
    const notice = dueNotice({ createdAt: START, subscription: newFreeSubscription(START) }, new Date(START.getTime() + 176 * DAY))!
    const template = 'Your free months of Flowbit end on {date}. Pick a plan to keep going.'
    // Act
    const text = noticeContent(notice, 'Acme', { templates: { freeEnding: template } }).paragraphs.join(' ')
    const forty = noticeContent(notice, 'Acme', { yearlyDiscountPercent: 40 }).paragraphs.join(' ')
    const off = noticeContent(notice, 'Acme', { yearlyDiscountPercent: 0 }).paragraphs.join(' ')
    // Assert
    expect(text.match(/50% off/g)).toHaveLength(1)
    expect(text).toContain('Yearly plans cost 10 months’ price (2 months free)')
    expect(text).toContain('Monthly plans pay the list price')
    expect(forty).toContain('your first year is 40% off on top')
    expect(off).not.toMatch(/% off/)
  })

  it('onboarding emails exist for days 1, 3 and 7', () => {
    expect([1, 3, 7].map((d) => onboardingContent(d as 1 | 3 | 7, 'Acme').cta.href)).toEqual(['/app/work/tasks', '/app/hr/attendance', '/app/folio/invoices/new'])
  })
})
