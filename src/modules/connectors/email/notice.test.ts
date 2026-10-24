import { describe, expect, it } from 'vitest'
import { rejectionNotice } from './notice'

describe('rejectionNotice', () => {
  it('explains each refusal in plain words', () => {
    expect(rejectionNotice('sender authentication failed (DKIM fail)', '2026-10-11', 'm1').body).toMatch(/SPF, DKIM or DMARC/)
    expect(rejectionNotice('the sender is not a member of this workspace', '2026-10-11', 'm1').body).toMatch(/not a member/)
    expect(rejectionNotice('daily limit reached', '2026-10-11', 'm1').body).toMatch(/daily limit/)
    expect(rejectionNotice('something new', '2026-10-11', 'm1').body).toBe('It was refused: something new.')
  })

  it('dedupes per owner, reason and day (not per DKIM/SPF detail)', () => {
    const a = rejectionNotice('sender authentication failed (DKIM fail)', '2026-10-11', 'm1')
    const b = rejectionNotice('sender authentication failed (SPF softfail)', '2026-10-11', 'm1')
    expect(a.dedupeKey).toBe(b.dedupeKey)
    expect(rejectionNotice('daily limit reached', '2026-10-12', 'm1').dedupeKey).not.toBe(rejectionNotice('daily limit reached', '2026-10-11', 'm1').dedupeKey)
  })
})
