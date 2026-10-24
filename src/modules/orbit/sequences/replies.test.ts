import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { gmailThread } from '@/modules/google/client'
import { enrollmentReplyAddress, enrollmentReplySig, looksAutomatic, parseEnrollmentReply, threadHasReply } from './reply-rules'

describe('per-enrolment reply address (no Gmail access needed)', () => {
  const secret = 's'.repeat(40)
  const id = '665f1c2a9d3e4b0012345678'

  it('round-trips the enrolment id and signature, and refuses other domains and malformed addresses', () => {
    const address = enrollmentReplyAddress(secret, id, 'In.UseFlowbit.com')
    const sig = enrollmentReplySig(secret, id)
    expect(address).toBe(`reply+${id}-${sig}@in.useflowbit.com`)
    expect(sig).toMatch(/^[a-z0-9]{16}$/)
    expect(parseEnrollmentReply([`"Asha" <${address}>`], 'in.useflowbit.com')).toEqual({ enrollmentId: id, sig })
    expect(parseEnrollmentReply([address], 'other.com')).toBeNull()
    expect(parseEnrollmentReply([`reply+${id}-short@in.useflowbit.com`], 'in.useflowbit.com')).toBeNull()
    expect(parseEnrollmentReply([`replies+vistaar-abcdefghijkl@in.useflowbit.com`], 'in.useflowbit.com')).toBeNull()
  })

  it('signs per enrolment and per secret, so one lead cannot work out another lead’s address', () => {
    expect(enrollmentReplySig(secret, id)).not.toBe(enrollmentReplySig(secret, '665f1c2a9d3e4b0012345679'))
    expect(enrollmentReplySig('t'.repeat(40), id)).not.toBe(enrollmentReplySig(secret, id))
  })

  it('skips out-of-office and delivery reports by subject', () => {
    expect(looksAutomatic('Automatic reply: Quick question')).toBe(true)
    expect(looksAutomatic('Out of office until Monday')).toBe(true)
    expect(looksAutomatic('Re: Quick question')).toBe(false)
  })
})

describe('Gmail thread reply check', () => {
  it('counts a human message from anyone but the sender', () => {
    expect(threadHasReply([{ from: 'Vikram <vikram@agency.in>' }], 'vikram@agency.in')).toBe(false)
    expect(threadHasReply([{ from: 'vikram@agency.in' }, { from: 'Asha <asha@kiran.in>' }], 'Vikram@agency.in')).toBe(true)
    expect(threadHasReply([{ from: 'vikram@agency.in' }, { from: 'asha@kiran.in', autoSubmitted: 'auto-replied' }], 'vikram@agency.in')).toBe(false)
    expect(threadHasReply([{ from: 'vikram@agency.in' }, { from: 'asha@kiran.in', autoSubmitted: 'no' }], 'vikram@agency.in')).toBe(true)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reads thread headers through the Gmail API (mocked)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [
      { id: 'm1', internalDate: '1760000000000', payload: { headers: [{ name: 'From', value: 'vikram@agency.in' }] } },
      { id: 'm2', internalDate: '1760000500000', payload: { headers: [{ name: 'From', value: 'Asha <asha@kiran.in>' }, { name: 'Auto-Submitted', value: 'no' }] } },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const messages = await gmailThread('tok', 't-1')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/gmail/v1/users/me/threads/t-1?format=metadata&metadataHeaders=From&metadataHeaders=Auto-Submitted')
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer tok')
    expect(messages).toEqual([{ id: 'm1', from: 'vikram@agency.in', autoSubmitted: null, date: 1760000000000 }, { id: 'm2', from: 'Asha <asha@kiran.in>', autoSubmitted: 'no', date: 1760000500000 }])
    expect(threadHasReply(messages, 'vikram@agency.in')).toBe(true)
  })
})
