import { describe, expect, it } from 'vitest'
import { checkLeadTransition, nextLeadStage, type LeadTransitionInput } from './leadStage'

const now = new Date('2026-10-01T06:00:00Z')
const old = new Date('2026-09-01T06:00:00Z')
const REASONS = ['no_budget', 'other']

const input = (over: Partial<LeadTransitionInput> = {}): LeadTransitionInput => ({
  lead: { stage: 'new' },
  to: 'contacted',
  can: { write: true, close: false },
  evidence: { hasOutreach: false, hasReply: false, hasMeetingHeld: false },
  sourceIsWarm: false,
  activeReasons: REASONS,
  via: 'move',
  now,
  ...over,
})

const fail = (r: ReturnType<typeof checkLeadTransition>) => (r.ok ? '' : r.error)

describe('checkLeadTransition', () => {
  it('refuses new → contacted without outreach and stamps contactedAt with one', () => {
    expect(fail(checkLeadTransition(input()))).toMatch(/Log an outreach/)
    const r = checkLeadTransition(input({ evidence: { hasOutreach: true, hasReply: false, hasMeetingHeld: false } }))
    expect(r.ok && r.patch.contactedAt).toEqual(now)
  })

  it('needs a reply for engaged and keeps an existing contactedAt', () => {
    const base = { lead: { stage: 'contacted' as const, contactedAt: old }, to: 'engaged' as const }
    expect(fail(checkLeadTransition(input(base)))).toMatch(/Reply received/)
    const r = checkLeadTransition(input({ ...base, evidence: { hasOutreach: true, hasReply: true, hasMeetingHeld: false } }))
    expect(r.ok && r.patch.contactedAt).toEqual(old)
    expect(r.ok && r.patch.engagedAt).toEqual(now)
  })

  it('lets a warm source skip from new to engaged only with a reply', () => {
    const ev = { hasOutreach: false, hasReply: true, hasMeetingHeld: false }
    expect(fail(checkLeadTransition(input({ to: 'engaged', evidence: ev })))).toMatch(/one step at a time/)
    expect(fail(checkLeadTransition(input({ to: 'engaged', sourceIsWarm: true })))).toMatch(/Reply received/)
    const r = checkLeadTransition(input({ to: 'engaged', sourceIsWarm: true, evidence: ev }))
    expect(r.ok && r.patch.contactedAt).toEqual(now)
    expect(r.ok && r.patch.engagedAt).toEqual(now)
  })

  it('refuses skipping for everyone, including reviewers', () => {
    const r = checkLeadTransition(input({ to: 'meeting_booked', can: { write: true, close: true }, meetingAt: now }))
    expect(fail(r)).toBe('Move one step at a time: New → Contacted.')
  })

  it('allows backwards moves only with close and keeps milestones', () => {
    const lead = { stage: 'engaged' as const, contactedAt: old, engagedAt: old }
    expect(fail(checkLeadTransition(input({ lead, to: 'contacted', evidence: { hasOutreach: true, hasReply: true, hasMeetingHeld: false } })))).toMatch(/backwards/)
    const r = checkLeadTransition(input({ lead, to: 'contacted', can: { write: true, close: true }, evidence: { hasOutreach: true, hasReply: true, hasMeetingHeld: false } }))
    expect(r.ok).toBe(true)
    expect(r.ok && 'engagedAt' in r.patch).toBe(false)
  })

  it('needs a meeting date for meeting_booked and a held meeting for meeting_done', () => {
    expect(fail(checkLeadTransition(input({ lead: { stage: 'engaged' }, to: 'meeting_booked' })))).toMatch(/meeting date/)
    const ok = checkLeadTransition(input({ lead: { stage: 'engaged' }, to: 'meeting_booked', meetingAt: now }))
    expect(ok.ok && ok.patch.meetingAt).toEqual(now)
    expect(fail(checkLeadTransition(input({ lead: { stage: 'meeting_booked', meetingAt: now }, to: 'meeting_done' })))).toMatch(/Log the meeting/)
  })

  it('guards lost and disqualified', () => {
    expect(fail(checkLeadTransition(input({ to: 'lost', reasonCode: 'no_budget' })))).toMatch(/Only a reviewer/)
    expect(fail(checkLeadTransition(input({ to: 'disqualified' })))).toMatch(/Pick a reason/)
    expect(fail(checkLeadTransition(input({ to: 'disqualified', reasonCode: 'other' })))).toMatch(/note for 'Other'/)
    const r = checkLeadTransition(input({ to: 'disqualified', reasonCode: 'no_budget', reasonNote: ' Q3 ' }))
    expect(r.ok && r.patch.closeReason).toEqual({ code: 'no_budget', note: 'Q3' })
    expect(r.ok && r.patch.closedAt).toEqual(now)
  })

  it('converts only via convert and only from meeting_done', () => {
    expect(fail(checkLeadTransition(input({ lead: { stage: 'meeting_done' }, to: 'converted' })))).toMatch(/Use Convert/)
    expect(fail(checkLeadTransition(input({ lead: { stage: 'engaged' }, to: 'converted', via: 'convert' })))).toMatch(/after its meeting/)
    const r = checkLeadTransition(input({ lead: { stage: 'meeting_done' }, to: 'converted', via: 'convert' }))
    expect(r.ok && r.patch.convertedAt).toEqual(now)
  })

  it('reopens closed leads to the pre-close stage for reviewers only', () => {
    const lead = { stage: 'lost' as const, contactedAt: old, closedAt: old }
    expect(fail(checkLeadTransition(input({ lead, to: 'contacted', via: 'reopen', reopenTo: 'contacted' })))).toMatch(/Ask your reviewer/)
    const r = checkLeadTransition(input({ lead, to: 'new', via: 'reopen', reopenTo: 'contacted', can: { write: true, close: true }, evidence: { hasOutreach: true, hasReply: false, hasMeetingHeld: false } }))
    expect(r.ok && r.to).toBe('contacted')
    expect(r.ok && r.patch.closedAt).toBeNull()
    expect(r.ok && r.patch.closeReason).toBeNull()
    expect(fail(checkLeadTransition(input({ lead: { stage: 'converted' }, to: 'new', via: 'reopen', can: { write: true, close: true } })))).toMatch(/converted/)
  })

  it('never takes milestone timestamps from input', () => {
    const fake = { stage: 'new' as const, contactedAt: null }
    const r = checkLeadTransition(input({ lead: fake, evidence: { hasOutreach: true, hasReply: false, hasMeetingHeld: false }, now }))
    expect(r.ok && r.patch.contactedAt).toEqual(now)
  })

  it('knows the next open stage', () => {
    expect(nextLeadStage('new')).toBe('contacted')
    expect(nextLeadStage('meeting_done')).toBeNull()
    expect(nextLeadStage('lost')).toBeNull()
  })
})
