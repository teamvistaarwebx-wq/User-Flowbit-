import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { funnel } from './metrics'
import { funnelCounts, type CohortLead } from './report-math'
import { followUpsFor, generateLeads, mulberry32 } from './seed-leads'

const today = '2026-10-01'
const now = new Date('2026-10-01T09:00:00Z')
const people = { owners: [new Types.ObjectId(), new Types.ObjectId()], reviewer: new Types.ObjectId() }

describe('generateLeads', () => {
  const gen = generateLeads(mulberry32(20261001), people, today, now, ['Kesar & Clay Ceramics', 'Malabar Mornings Coffee', 'Narmada Valley Realty'])

  it('hits the reference demo conversion numbers', () => {
    const f = funnel(funnelCounts(gen.leads as unknown as CohortLead[]))
    expect(f.total).toBe(148)
    expect(f.contacted).toBe(121)
    expect(f.engaged).toBe(34)
    expect(f.meetingsBooked).toBe(6)
    expect(f.cold).toBe(5)
    expect(f.warm).toBe(17.6)
    expect(gen.converted.map((c) => c.companyName)).toEqual(['Kesar & Clay Ceramics', 'Malabar Mornings Coffee', 'Narmada Valley Realty'])
  })

  it('only claims stages it has evidence for, and nothing happens in the future', () => {
    for (const lead of gen.leads) {
      const acts = gen.activities.filter((a) => String(a.leadId) === String(lead._id) && a.status === 'done')
      if (lead.contactedAt) expect(acts.some((a) => ['dm', 'email', 'call', 'follow_up'].includes(String(a.type)) && (a.occurredAt as Date) <= (lead.contactedAt as Date))).toBe(true)
      if (lead.engagedAt) expect(acts.some((a) => a.type === 'reply')).toBe(true)
      if (lead.meetingDoneAt) expect(acts.some((a) => a.type === 'meeting')).toBe(true)
      for (const a of acts) expect((a.occurredAt as Date).getTime()).toBeLessThanOrEqual(now.getTime())
    }
  })

  it('plans follow-ups with some overdue and some due today, and leaves stale ghosts without one', () => {
    const follow = followUpsFor(mulberry32(1), gen.leads, today, new Date(now.getTime() - 7 * 86_400_000), new Set())
    expect(follow.some((f) => String(f.dueDate) < today)).toBe(true)
    expect(follow.some((f) => f.dueDate === today)).toBe(true)
  })
})
