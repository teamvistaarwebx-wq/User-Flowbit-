/** Report arithmetic over cohort rows and stage events ("ever reached" funnel). Pure. */
import { OPEN_LEAD_STAGES, OUTREACH_TYPES, type OpenLeadStage } from './constants'
import { EMPTY_FUNNEL, pct1, type FunnelCounts } from './metrics'

export type CohortLead = {
  stage: string
  source: string
  sector: string
  ownerId: string
  contactedAt?: Date | null
  engagedAt?: Date | null
  meetingBookedAt?: Date | null
  meetingDoneAt?: Date | null
  convertedAt?: Date | null
  /** The lead's deal was won. */
  won: boolean
}

/** Cohort funnel counts: every milestone the lead ever reached. */
export function funnelCounts(rows: readonly CohortLead[]): FunnelCounts {
  return rows.reduce<FunnelCounts>(
    (c, l) => ({
      total: c.total + 1,
      contacted: c.contacted + (l.contactedAt ? 1 : 0),
      engaged: c.engaged + (l.engagedAt ? 1 : 0),
      meetingsBooked: c.meetingsBooked + (l.meetingBookedAt ? 1 : 0),
      meetingsDone: c.meetingsDone + (l.meetingDoneAt ? 1 : 0),
      converted: c.converted + (l.convertedAt ? 1 : 0),
      won: c.won + (l.won ? 1 : 0),
      lost: c.lost + (l.stage === 'lost' ? 1 : 0),
      disqualified: c.disqualified + (l.stage === 'disqualified' ? 1 : 0),
    }),
    { ...EMPTY_FUNNEL },
  )
}

export type GroupRow = FunnelCounts & { key: string; cold: number | null; warm: number | null }

/** Funnel per source / sector / owner, with cold and warm %. */
export function groupFunnel(rows: readonly CohortLead[], key: 'source' | 'sector' | 'ownerId'): GroupRow[] {
  const groups = new Map<string, CohortLead[]>()
  for (const r of rows) groups.set(r[key], [...(groups.get(r[key]) ?? []), r])
  return [...groups.entries()].map(([k, list]) => {
    const c = funnelCounts(list)
    return { ...c, key: k, cold: pct1(c.meetingsBooked, c.contacted), warm: pct1(c.meetingsBooked, c.engaged) }
  })
}

/** Source table order: meetings desc, then total desc. */
export const bySourceOrder = (a: GroupRow, b: GroupRow) => b.meetingsBooked - a.meetingsBooked || b.total - a.total

export type StageEventLite = { entityId: string; toStage: string; changedAt: Date }

/**
 * Average days spent in each open lead stage: from entering it (an event in
 * the range) to the lead's next stage event. Spans without an end are left out.
 */
export function stageVelocity(events: readonly StageEventLite[], range: { start: Date; end: Date }): { stage: OpenLeadStage; avgDays: number | null; sample: number }[] {
  const byLead = new Map<string, StageEventLite[]>()
  for (const e of events) byLead.set(e.entityId, [...(byLead.get(e.entityId) ?? []), e])
  const spans = new Map<string, number[]>()
  for (const list of byLead.values()) {
    const sorted = [...list].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())
    sorted.forEach((e, i) => {
      const next = sorted[i + 1]
      if (!next || !(OPEN_LEAD_STAGES as readonly string[]).includes(e.toStage)) return
      if (e.changedAt < range.start || e.changedAt >= range.end) return
      spans.set(e.toStage, [...(spans.get(e.toStage) ?? []), (next.changedAt.getTime() - e.changedAt.getTime()) / 86_400_000])
    })
  }
  return OPEN_LEAD_STAGES.map((stage) => {
    const list = spans.get(stage) ?? []
    return { stage, avgDays: list.length ? Math.round((list.reduce((s, d) => s + d, 0) / list.length) * 10) / 10 : null, sample: list.length }
  })
}

/** Bar width for the funnel: value ÷ total, at least 2.5% when the value is above zero. */
export const barWidth = (value: number, total: number) => (total > 0 && value > 0 ? Math.max(2.5, (value / total) * 100) : 0)

/**
 * The activity filter for report counts: done activities of these types,
 * limited to the leads of the chosen sector when one is picked. Outreach
 * leaves out emails a sequence sent by itself (counted as sequence emails).
 */
export function reportActivityMatch(kind: 'outreach' | 'sequence' | 'reply' | 'meeting', sectorLeadIds: readonly unknown[] | null): Record<string, unknown> {
  const leads = sectorLeadIds ? { leadId: { $in: [...sectorLeadIds] } } : {}
  if (kind === 'outreach') return { status: 'done', type: { $in: [...OUTREACH_TYPES] }, automated: { $ne: true }, ...leads }
  if (kind === 'sequence') return { status: 'done', type: 'email', automated: true, ...leads }
  return { status: 'done', type: kind, ...leads }
}
