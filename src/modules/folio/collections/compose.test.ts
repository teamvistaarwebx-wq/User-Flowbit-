import { describe, expect, it } from 'vitest'
import { composeReminderEmail, composeReminderWhatsApp, paragraphsOf, whatsappLink, type ReminderInput } from './compose'

const base: ReminderInput = {
  tone: 'polite',
  daysOverdue: 5,
  invoiceNumber: 'VWX/2026-27/0007',
  issueDate: '2026-09-01',
  dueDate: '2026-09-26',
  balancePaise: 1_47_500_00,
  recipientName: 'Priya Nair',
  sender: 'Sanskaar Singh',
  company: 'Vistaar WebX',
  supportEmail: 'accounts@vistaarwebx.com',
  payTo: { bankName: 'HDFC Bank', accountLast4: '5432', ifsc: 'HDFC0001234', upiId: 'vistaarwebx@hdfcbank' },
}

describe('composeReminderEmail', () => {
  it('picks the subject by tone', () => {
    expect(composeReminderEmail({ ...base, tone: 'advance_notice' }).subject).toBe('Vistaar WebX: invoice VWX/2026-27/0007 due 26 Sep 2026')
    expect(composeReminderEmail({ ...base, tone: 'due_today' }).subject).toBe('Vistaar WebX: invoice VWX/2026-27/0007 is due today')
    expect(composeReminderEmail({ ...base, tone: 'final' }).subject).toBe('Final reminder: invoice VWX/2026-27/0007 — ₹1,47,500.00 outstanding')
    expect(composeReminderEmail(base).subject).toBe('Reminder: invoice VWX/2026-27/0007 — ₹1,47,500.00 outstanding')
  })

  it('greets by first name, or neutrally', () => {
    expect(composeReminderEmail(base).paragraphs[0]).toBe('Hi Priya,')
    expect(composeReminderEmail({ ...base, recipientName: null }).paragraphs[0]).toBe('Hello,')
  })

  it('states the number, dates and amount', () => {
    const { text } = composeReminderEmail(base)
    expect(text).toContain('Invoice: VWX/2026-27/0007')
    expect(text).toContain('Dated: 1 Sep 2026')
    expect(text).toContain('Due: 26 Sep 2026')
    expect(text).toContain('Amount outstanding: ₹1,47,500.00')
  })

  it('is courteous early and firm late', () => {
    expect(composeReminderEmail(base).text).toContain('showing as unpaid')
    expect(composeReminderEmail({ ...base, tone: 'firm', daysOverdue: 20 }).text).toContain('20 days past its due date')
    expect(composeReminderEmail({ ...base, tone: 'final', daysOverdue: 50 }).text).toContain('final reminder before we escalate')
  })

  it('never accuses in an advance notice', () => {
    const { text } = composeReminderEmail({ ...base, tone: 'advance_notice', daysOverdue: -3 })
    expect(text).not.toMatch(/overdue|unpaid|past its due/)
    expect(text).toContain('just a heads-up')
  })

  it('adds the payment details and signs off', () => {
    const { text } = composeReminderEmail(base)
    expect(text).toContain('Pay to: HDFC Bank · A/c ending 5432 · IFSC HDFC0001234 · UPI vistaarwebx@hdfcbank')
    expect(text.endsWith('Thanks,\nSanskaar Singh\nVistaar WebX\naccounts@vistaarwebx.com')).toBe(true)
  })
})

describe('composeReminderWhatsApp', () => {
  it('is one short message with the number and amount', () => {
    const msg = composeReminderWhatsApp(base)
    expect(msg).not.toContain('\n')
    expect(msg).toContain('VWX/2026-27/0007')
    expect(msg).toContain('₹1,47,500.00')
  })
  it('mentions how late it is', () => {
    expect(composeReminderWhatsApp(base)).toContain('(5 days ago)')
  })
  it('is a heads-up before the due date', () => {
    expect(composeReminderWhatsApp({ ...base, tone: 'advance_notice', daysOverdue: -3 })).toBe('Hi Priya, a heads-up from Vistaar WebX: invoice VWX/2026-27/0007 for ₹1,47,500.00 is due on 26 Sep 2026. — Sanskaar Singh')
  })
})

describe('whatsappLink', () => {
  it('prefills the message', () => {
    expect(whatsappLink('919876543210', 'Hi there')).toBe('https://wa.me/919876543210?text=Hi%20there')
  })
  it('adds 91 to a 10-digit number', () => {
    expect(whatsappLink('98765 43210', 'x')).toBe('https://wa.me/919876543210?text=x')
  })
  it('keeps an existing country code', () => {
    expect(whatsappLink('+44 7700 900123', 'x')).toBe('https://wa.me/447700900123?text=x')
  })
  it('refuses a short number', () => {
    expect(whatsappLink('12345', 'x')).toBeNull()
  })
})

describe('paragraphsOf', () => {
  it('splits on blank lines and trims', () => {
    expect(paragraphsOf('Hi,\n\n  Line one\nline two \n\n\nThanks')).toEqual(['Hi,', 'Line one\nline two', 'Thanks'])
  })
})
