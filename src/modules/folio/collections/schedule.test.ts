import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDER_SETTINGS, isRemindable, remindersDue, toneFor, type ReminderSettings } from './schedule'

const inv = { invoiceId: 'i1', dueDate: '2026-10-10', balancePaise: 1_00_000 }
const email: ReminderSettings = { enabled: true, offsetDays: [-3, 0, 7, 15, 30], channels: ['email'] }

describe('remindersDue', () => {
  it('sends the advance notice three days before the due date', () => {
    const due = remindersDue([inv], email, [], '2026-10-07')
    expect(due).toEqual([{ invoiceId: 'i1', channel: 'email', offsetDays: -3, scheduledFor: '2026-10-07', skip: false }])
  })

  it('sends nothing before its date', () => {
    expect(remindersDue([inv], email, [], '2026-10-06')).toEqual([])
  })

  it('never sends the same offset twice on a channel', () => {
    expect(remindersDue([inv], email, [{ invoiceId: 'i1', channel: 'email', offsetDays: -3 }], '2026-10-08')).toEqual([])
  })

  it('treats an email reminder as separate from a WhatsApp one', () => {
    const both: ReminderSettings = { ...email, channels: ['email', 'whatsapp'] }
    const due = remindersDue([inv], both, [{ invoiceId: 'i1', channel: 'email', offsetDays: -3 }], '2026-10-08')
    expect(due.map((d) => [d.channel, d.offsetDays, d.skip])).toEqual([['whatsapp', -3, false]])
  })

  it('catches up with only the latest missed offset and flags the older ones to skip', () => {
    const due = remindersDue([inv], email, [], '2026-11-20')
    expect(due.filter((d) => !d.skip).map((d) => d.offsetDays)).toEqual([30])
    expect(due.filter((d) => d.skip).map((d) => d.offsetDays)).toEqual([-3, 0, 7, 15])
  })

  it('never sends an offset older than one already sent', () => {
    const due = remindersDue([inv], email, [{ invoiceId: 'i1', channel: 'email', offsetDays: 7 }], '2026-10-18')
    expect(due).toEqual([
      { invoiceId: 'i1', channel: 'email', offsetDays: -3, scheduledFor: '2026-10-07', skip: true },
      { invoiceId: 'i1', channel: 'email', offsetDays: 0, scheduledFor: '2026-10-10', skip: true },
    ])
  })

  it('returns the oldest scheduled first', () => {
    const later = { invoiceId: 'i2', dueDate: '2026-10-20', balancePaise: 500 }
    const due = remindersDue([later, inv], email, [], '2026-10-20')
    expect(due.filter((d) => !d.skip).map((d) => d.invoiceId)).toEqual(['i1', 'i2'])
  })

  it('stops once the invoice is paid', () => {
    expect(remindersDue([{ ...inv, balancePaise: 0 }], email, [], '2026-10-12')).toEqual([])
  })

  it('sends nothing when reminders are off', () => {
    expect(remindersDue([inv], { ...email, enabled: false }, [], '2026-10-12')).toEqual([])
  })

  it('sends nothing with an empty cadence', () => {
    expect(remindersDue([inv], { ...email, offsetDays: [] }, [], '2026-10-12')).toEqual([])
  })

  it('uses the default cadence of -3, 0, 7, 15 and 30 days', () => {
    expect(DEFAULT_REMINDER_SETTINGS.offsetDays).toEqual([-3, 0, 7, 15, 30])
  })
})

describe('toneFor', () => {
  it('escalates with age', () => {
    expect([-3, 0, 1, 15, 16, 45, 46].map(toneFor)).toEqual(['advance_notice', 'due_today', 'polite', 'polite', 'firm', 'firm', 'final'])
  })
})

describe('reminders stop once an invoice is paid', () => {
  it('sends nothing for a paid invoice, however late it is', () => {
    expect(remindersDue([{ ...inv, balancePaise: 0 }], email, [], '2026-11-20')).toEqual([])
  })

  it('keeps chasing a part-paid balance', () => {
    expect(remindersDue([{ ...inv, balancePaise: 500 }], email, [], '2026-10-17').map((d) => d.offsetDays)).toContain(7)
  })

  it('drops queued reminders of settled invoices', () => {
    expect(isRemindable({ status: 'issued', balancePaise: 100 })).toBe(true)
    expect(isRemindable({ status: 'part_paid', balancePaise: 100 })).toBe(true)
    expect(isRemindable({ status: 'paid', balancePaise: 0 })).toBe(false)
    expect(isRemindable({ status: 'issued', balancePaise: 0 })).toBe(false)
    expect(isRemindable({ status: 'void', balancePaise: 100 })).toBe(false)
  })
})
