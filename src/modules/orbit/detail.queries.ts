import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { toActivityItems } from './activity-items'
import { LEAD_STAGE_LABEL, labelFrom, type LeadStage } from './constants'
import { dealStageLabel } from './dealStage'
import { leadEvidence } from './lead-move'
import { nameOf, peopleIndex, type OrbitPerson } from './people'
import type { TimelineEntryData } from './record-types'
import type { OrbitConfig } from './settings'

export type TimelineEntry = TimelineEntryData

type EventDoc = { _id: Types.ObjectId; entity: string; fromStage?: string | null; toStage: string; reasonCode?: string | null; reasonNote?: string | null; changedBy?: Types.ObjectId | null; changedAt: Date }

function stageEntries(events: EventDoc[], cfg: OrbitConfig, names: (id: unknown) => string): TimelineEntry[] {
  return events.map((e) => {
    const entity = e.entity === 'deal' ? 'deal' : 'lead'
    const label = (s: string) => (entity === 'lead' ? (LEAD_STAGE_LABEL[s as LeadStage] ?? s) : dealStageLabel(cfg.dealStages, s))
    const reason = e.reasonCode ? `${labelFrom([...cfg.lostReasons, ...cfg.wonReasons], e.reasonCode)}${e.reasonNote ? ` — ${e.reasonNote}` : ''}` : e.reasonNote || null
    return { kind: 'stage' as const, at: new Date(e.changedAt).toISOString(), id: String(e._id), from: e.fromStage ? label(e.fromStage) : null, to: label(e.toStage), who: e.changedBy ? names(e.changedBy) : 'System', reason, entity }
  })
}

/** Timeline + upcoming planned activities for one lead or deal (or both, for a converted deal's history). */
export async function recordHistory(ctx: Ctx, cfg: OrbitConfig, people: OrbitPerson[], match: { leadId?: Types.ObjectId; dealId?: Types.ObjectId }) {
  const index = peopleIndex(people)
  const activityFilter = match.dealId ? { dealId: match.dealId } : { leadId: match.leadId }
  const entity = match.dealId ? { entity: 'deal', entityId: match.dealId } : { entity: 'lead', entityId: match.leadId }
  const [activities, events] = await Promise.all([
    ctx.db(Activity).find(activityFilter).sort({ occurredAt: -1, dueDate: 1, createdAt: -1 }).lean(),
    ctx.db(StageEvent).find(entity).sort({ changedAt: -1 }).lean(),
  ])
  const items = await toActivityItems(ctx, activities, index)
  const touched = new Map(activities.map((a) => [String(a._id), a.cancelledAt ?? a.updatedAt]))
  const upcoming = items.filter((a) => a.status === 'planned').sort((a, b) => `${a.dueDate}${a.dueTime ?? '99'}`.localeCompare(`${b.dueDate}${b.dueTime ?? '99'}`))
  const timeline: TimelineEntry[] = [
    ...items.filter((a) => a.status !== 'planned').map((item) => ({ kind: 'activity' as const, at: item.occurredAt ?? new Date(touched.get(item.id) ?? Date.now()).toISOString(), item })),
    ...stageEntries(events as EventDoc[], cfg, (id) => nameOf(index, id as Types.ObjectId)),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return { upcoming, timeline }
}

export async function leadDetail(ctx: Ctx, lead: { _id: Types.ObjectId; clientId?: Types.ObjectId | null; dealId?: Types.ObjectId | null }, cfg: OrbitConfig, people: OrbitPerson[]) {
  const [history, evidence, client, deal] = await Promise.all([
    recordHistory(ctx, cfg, people, { leadId: lead._id }),
    leadEvidence(ctx, lead._id),
    lead.clientId ? ctx.db(Client).findById(lead.clientId, { name: 1 }).lean() : null,
    lead.dealId ? ctx.db(Deal).findById(lead.dealId, { title: 1, status: 1 }).lean() : null,
  ])
  const activityCount = await ctx.db(Activity).countDocuments({ leadId: lead._id })
  return { ...history, evidence, client, deal, activityCount }
}

/** The lead a deal came from, with its history (the "Before conversion" group). */
export async function originLead(ctx: Ctx, leadId: Types.ObjectId | null | undefined) {
  if (!leadId) return null
  return ctx.db(Lead).findById(leadId).lean()
}
