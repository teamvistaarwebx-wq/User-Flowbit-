import { describe, expect, it } from 'vitest'
import { mailOutcome, staffMailTo } from './mail-to'

describe('where HR mail goes (R1 3.7, 3.8)', () => {
  const p = { workEmail: 'asha@co.in', personalEmail: 'asha@gmail.com' }
  it('uses the work email for people at work', () => {
    expect(staffMailTo({ ...p, status: 'active' }, '2026-10-11')).toBe('asha@co.in')
  })
  it('uses the personal email for leavers and candidates who have one', () => {
    expect(staffMailTo({ ...p, status: 'exited', exitDate: '2026-09-30' }, '2026-10-11')).toBe('asha@gmail.com')
    expect(staffMailTo({ ...p, status: 'offered' }, '2026-10-11')).toBe('asha@gmail.com')
    expect(staffMailTo({ workEmail: 'asha@co.in', status: 'offered' }, '2026-10-11')).toBe('asha@co.in')
  })
  it('counts a mail that only reached the Outbox as not sent', () => {
    expect(mailOutcome({ ok: true, provider: 'outbox' })).toBe('outbox')
    expect(mailOutcome({ ok: true, provider: 'resend' })).toBe('sent')
    expect(mailOutcome({ ok: false })).toBe('failed')
  })
})
