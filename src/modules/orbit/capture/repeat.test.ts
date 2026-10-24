import { describe, expect, it } from 'vitest'
import type { LeadDraft } from './map'
import { openDuplicateFilter, repeatNote } from './repeat'

const draft = (over: Partial<LeadDraft> = {}): LeadDraft => ({ companyName: 'Acme', contactName: 'Ravi', email: 'ravi@acme.in', phone: '+919876543210', website: '', notes: 'Need a quote', source: 'website_form', tags: [], utm: {}, externalId: null, ...over })

describe('repeat enquiries', () => {
  it('matches an open lead by email or phone', () => {
    expect(openDuplicateFilter(draft())).toEqual({ stage: { $in: ['new', 'contacted', 'engaged', 'meeting_booked', 'meeting_done'] }, $or: [{ email: 'ravi@acme.in' }, { phone: '+919876543210' }] })
    expect(openDuplicateFilter(draft({ email: '' }))).toMatchObject({ $or: [{ phone: '+919876543210' }] })
  })

  it('does not match when the draft has neither email nor phone', () => {
    expect(openDuplicateFilter(draft({ email: '', phone: '' }))).toBeNull()
  })

  it('notes the repeat with the sender id in the title, so a re-delivery is noted once', () => {
    expect(repeatNote(draft({ source: 'indiamart', externalId: '2795181001' }))).toEqual({ title: 'Repeat enquiry from IndiaMART (#2795181001)', notes: 'Ravi, Acme\n+919876543210 · ravi@acme.in\nNeed a quote' })
    expect(repeatNote(draft({ contactName: 'Acme', notes: '' })).title).toBe('Repeat enquiry from Website form')
    expect(repeatNote(draft({ contactName: 'Acme', notes: '' })).notes).toBe('Acme\n+919876543210 · ravi@acme.in')
  })
})
