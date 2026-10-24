import { describe, expect, it } from 'vitest'
import { appendNote, houseLeadLine, pickKey, PREFERRED_SECTOR, PREFERRED_SOURCE } from './house-lead-core'

const AT = new Date('2026-10-08T06:00:00Z')

describe('house lead', () => {
  it('uses the preferred source and sector when the house workspace has them active', () => {
    expect(pickKey(['instagram', 'website', 'inbound'], PREFERRED_SOURCE.signup)).toBe('website')
    expect(pickKey(['instagram', 'website', 'inbound'], PREFERRED_SOURCE.demo_request)).toBe('inbound')
    expect(pickKey(['d2c', 'other'], PREFERRED_SECTOR)).toBe('other')
  })

  it('falls back to the first active key, or null when there is none', () => {
    expect(pickKey(['instagram'], PREFERRED_SOURCE.signup)).toBe('instagram')
    expect(pickKey([], PREFERRED_SOURCE.signup)).toBeNull()
  })

  it('writes one dated line with the account type, team size, products and workspace', () => {
    const line = houseLeadLine({ origin: 'signup', name: 'Asha', email: 'a@x.in', company: 'Acme', teamSize: '2-5', products: ['work', 'folio'], accountType: 'free', workspace: 'acme' }, AT)
    expect(line).toBe('8 Oct 2026 · Signed up · Free · 2-5 people · products: work, folio · workspace acme')
  })

  it('adds a demo request message on its own line', () => {
    const line = houseLeadLine({ origin: 'demo_request', name: 'Ravi', email: 'r@x.in', company: 'Kalpa', teamSize: '11-50', products: [], message: ' Show payroll. ' }, AT)
    expect(line).toBe('8 Oct 2026 · Asked for a demo · 11-50 people\nShow payroll.')
  })

  it('puts the newest note first and keeps notes bounded', () => {
    expect(appendNote('', 'first')).toBe('first')
    expect(appendNote('old', 'new')).toBe('new\n\nold')
    expect(appendNote('x'.repeat(50), 'new', 20)).toHaveLength(20)
  })
})
