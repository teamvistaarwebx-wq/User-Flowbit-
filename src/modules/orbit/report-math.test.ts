import { describe, expect, it } from 'vitest'
import { barWidth, funnelCounts, groupFunnel, reportActivityMatch, stageVelocity, type CohortLead } from './report-math'
import { assignKeys, duplicateLabel, removedKeys } from './settings-lists'
import { resolveRange } from './time-ranges'

const at = (iso: string) => new Date(`${iso}T06:00:00Z`)
const lead = (over: Partial<CohortLead>): CohortLead => ({ stage: 'new', source: 'instagram', sector: 'd2c', ownerId: 'a', won: false, ...over })

describe('cohort funnel', () => {
  it('counts every milestone ever reached, even after a loss', () => {
    const rows = [
      lead({ stage: 'lost', contactedAt: at('2026-09-01'), engagedAt: at('2026-09-02'), meetingBookedAt: at('2026-09-03'), meetingDoneAt: at('2026-09-04') }),
      lead({ stage: 'contacted', contactedAt: at('2026-09-01') }),
      lead({ stage: 'converted', contactedAt: at('2026-09-01'), engagedAt: at('2026-09-02'), meetingBookedAt: at('2026-09-03'), meetingDoneAt: at('2026-09-04'), convertedAt: at('2026-09-05'), won: true }),
      lead({ stage: 'disqualified' }),
    ]
    expect(funnelCounts(rows)).toEqual({ total: 4, contacted: 3, engaged: 2, meetingsBooked: 2, meetingsDone: 2, converted: 1, won: 1, lost: 1, disqualified: 1 })
  })

  it('groups by source with cold and warm %', () => {
    const rows = [lead({ contactedAt: at('2026-09-01'), meetingBookedAt: at('2026-09-03'), engagedAt: at('2026-09-02') }), lead({ contactedAt: at('2026-09-01') }), lead({ source: 'referral' })]
    const ig = groupFunnel(rows, 'source').find((g) => g.key === 'instagram')
    expect(ig).toMatchObject({ total: 2, contacted: 2, cold: 50, warm: 100 })
  })

  it('keeps a visible minimum funnel bar', () => {
    expect(barWidth(1, 1000)).toBe(2.5)
    expect(barWidth(0, 10)).toBe(0)
    expect(barWidth(5, 10)).toBe(50)
  })
})

describe('stageVelocity', () => {
  it('averages spans that start in range at open stages and have an end', () => {
    const events = [
      { entityId: 'l1', toStage: 'new', changedAt: at('2026-09-01') },
      { entityId: 'l1', toStage: 'contacted', changedAt: at('2026-09-03') },
      { entityId: 'l1', toStage: 'lost', changedAt: at('2026-09-04') },
      { entityId: 'l1', toStage: 'new', changedAt: at('2026-09-10') },
      { entityId: 'l2', toStage: 'new', changedAt: at('2026-09-02') },
      { entityId: 'l2', toStage: 'contacted', changedAt: at('2026-09-06') },
    ]
    const v = stageVelocity(events, { start: at('2026-08-01'), end: at('2026-10-01') })
    expect(v.find((r) => r.stage === 'new')).toEqual({ stage: 'new', avgDays: 3, sample: 2 })
    expect(v.find((r) => r.stage === 'contacted')).toEqual({ stage: 'contacted', avgDays: 1, sample: 1 })
  })
})

describe('settings lists', () => {
  it('keeps existing keys, mints unique new ones and avoids reserved keys', () => {
    const keyed = assignKeys([{ key: 'discovery', label: 'Discovery' }, { label: 'Won' }, { label: 'Pilot' }, { label: 'Pilot!' }], [{ key: 'discovery' }], ['won', 'lost'])
    expect(keyed.map((k) => k.key)).toEqual(['discovery', 'won_2', 'pilot', 'pilot_2'])
  })
  it('finds removed items and duplicate labels', () => {
    expect(removedKeys([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ key: 'a', label: 'A' }])).toEqual([{ key: 'b', label: 'B' }])
    expect(duplicateLabel([{ label: 'Call' }, { label: ' call ' }])).toBe('call')
  })
})

describe('resolveRange', () => {
  it('resolves presets and validates custom ranges in IST dates', () => {
    expect(resolveRange('7d', undefined, undefined, '2026-10-01')).toEqual({ range: '7d', from: '2026-09-25', to: '2026-10-01' })
    expect(resolveRange('last_month', undefined, undefined, '2026-10-01')).toEqual({ range: 'last_month', from: '2026-09-01', to: '2026-09-30' })
    expect(resolveRange('custom', '2026-10-05', '2026-10-01', '2026-10-01').range).toBe('30d')
  })
  it('refuses an impossible custom date like 30 Feb', () => {
    expect(resolveRange('custom', '2026-02-30', '2026-03-01', '2026-10-01')).toEqual({ range: '30d', from: '2026-09-02', to: '2026-10-01' })
    expect(resolveRange('custom', '2026-02-28', '2026-03-01', '2026-10-01')).toEqual({ range: 'custom', from: '2026-02-28', to: '2026-03-01' })
  })
})

describe('report activity filters', () => {
  it('leaves sequence emails out of outreach and counts them on their own', () => {
    expect(reportActivityMatch('outreach', null)).toEqual({ status: 'done', type: { $in: ['dm', 'email', 'call', 'follow_up'] }, automated: { $ne: true } })
    expect(reportActivityMatch('sequence', null)).toEqual({ status: 'done', type: 'email', automated: true })
  })

  it('limits every count to the sector’s leads when a sector is picked', () => {
    expect(reportActivityMatch('outreach', ['l1', 'l2'])).toMatchObject({ leadId: { $in: ['l1', 'l2'] } })
    expect(reportActivityMatch('reply', ['l1'])).toEqual({ status: 'done', type: 'reply', leadId: { $in: ['l1'] } })
    expect(reportActivityMatch('meeting', null)).toEqual({ status: 'done', type: 'meeting' })
  })
})
