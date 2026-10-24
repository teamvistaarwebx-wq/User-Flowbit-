import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { monthOf, monthRange, todayIST } from '@/lib/dates'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { MATURITY_DAYS, pct1, type FunnelCounts } from './metrics'
import { bySourceOrder, funnelCounts, groupFunnel, reportActivityMatch, stageVelocity, type CohortLead } from './report-math'
import { dealOwnerFilter, leadOwnerFilter, type Filter, type OwnerScope } from './scope'
import { dailyCounts } from './series'
import type { OrbitConfig } from './settings'

const COHORT_LIMIT = 20_000
const VOLUME_DAYS = 14
type Range = { start: Date; end: Date }

/** Leads created in the range (within `scope`), with whether their deal was won. */
async function cohort(ctx: Ctx, scope: Filter, range: Range, extra: Filter = {}): Promise<CohortLead[]> {
  const leads = await ctx.db(Lead).find({ ...scope, ...extra, createdAt: { $gte: range.start, $lt: range.end } }, { stage: 1, source: 1, sector: 1, ownerId: 1, contactedAt: 1, engagedAt: 1, meetingBookedAt: 1, meetingDoneAt: 1, convertedAt: 1, dealId: 1 }).limit(COHORT_LIMIT).lean()
  const dealIds = leads.map((l) => l.dealId).filter(Boolean)
  const won = dealIds.length ? await ctx.db(Deal).distinct('_id', { _id: { $in: dealIds }, status: 'won' }) : []
  const wonSet = new Set(won.map(String))
  return leads.map((l) => ({ ...l, ownerId: String(l.ownerId), won: l.dealId ? wonSet.has(String(l.dealId)) : false }))
}

export async function cohortFunnel(ctx: Ctx, scope: Filter, range: Range): Promise<FunnelCounts> {
  return funnelCounts(await cohort(ctx, scope, range))
}

export type ReportFilters = { owner: OwnerScope; sector: string | null; range: Range; showOwners: boolean }

async function closeReasons(ctx: Ctx, f: ReportFilters, leadScope: Filter, dealScope: Filter) {
  const closed = { $gte: f.range.start, $lt: f.range.end }
  const [leadExits, lostDeals, wonDeals] = await Promise.all([
    ctx.db(Lead).aggregate<{ _id: { code: string; stage: string }; n: number }>([{ $match: { ...leadScope, stage: { $in: ['lost', 'disqualified'] }, closedAt: closed } }, { $group: { _id: { code: '$closeReason.code', stage: '$stage' }, n: { $sum: 1 } } }]),
    ctx.db(Deal).aggregate<{ _id: string; n: number; value: number }>([{ $match: { ...dealScope, status: 'lost', closedAt: closed } }, { $group: { _id: '$lostReason.code', n: { $sum: 1 }, value: { $sum: '$valuePaise' } } }]),
    ctx.db(Deal).aggregate<{ _id: string | null; n: number; value: number }>([{ $match: { ...dealScope, status: 'won', closedAt: closed } }, { $group: { _id: '$wonReason', n: { $sum: 1 }, value: { $sum: '$valuePaise' } } }]),
  ])
  const codes = [...new Set([...leadExits.map((r) => r._id.code), ...lostDeals.map((r) => r._id)].filter(Boolean))]
  const lost = codes.map((code) => ({
    code,
    disqualified: leadExits.find((r) => r._id.code === code && r._id.stage === 'disqualified')?.n ?? 0,
    leadsLost: leadExits.find((r) => r._id.code === code && r._id.stage === 'lost')?.n ?? 0,
    dealsLost: lostDeals.find((r) => r._id === code)?.n ?? 0,
    dealsLostPaise: lostDeals.find((r) => r._id === code)?.value ?? 0,
  }))
  const totalLost = lost.reduce((s, r) => s + r.disqualified + r.leadsLost + r.dealsLost, 0)
  return {
    lost: lost.map((r) => ({ ...r, share: pct1(r.disqualified + r.leadsLost + r.dealsLost, totalLost) })).sort((a, b) => b.disqualified + b.leadsLost + b.dealsLost - (a.disqualified + a.leadsLost + a.dealsLost)),
    won: wonDeals.map((r) => ({ code: r._id ?? 'unspecified', count: r.n, valuePaise: r.value })).sort((a, b) => b.count - a.count),
  }
}

async function dealsSection(ctx: Ctx, f: ReportFilters, dealScope: Filter, cfg: OrbitConfig) {
  const closed = { $gte: f.range.start, $lt: f.range.end }
  const [closedDeals, created] = await Promise.all([
    ctx.db(Deal).find({ ...dealScope, status: { $in: ['won', 'lost'] }, closedAt: closed }, { status: 1, valuePaise: 1 }).lean(),
    ctx.db(Deal).find({ ...dealScope, createdAt: closed }, { status: 1 }).lean(),
  ])
  const sum = (status: string) => closedDeals.filter((d) => d.status === status).reduce((s, d) => s + d.valuePaise, 0)
  const count = (status: string) => closedDeals.filter((d) => d.status === status).length
  const events = created.length ? await ctx.db(StageEvent).find({ entity: 'deal', entityId: { $in: created.map((d) => d._id) } }, { entityId: 1, toStage: 1 }).lean() : []
  const wonIds = new Set(created.filter((d) => d.status === 'won').map((d) => String(d._id)))
  const reach = cfg.dealStages.map((s) => {
    const ids = new Set(events.filter((e) => e.toStage === s.key).map((e) => String(e.entityId)))
    const wonAfter = [...ids].filter((id) => wonIds.has(id)).length
    return { key: s.key, label: s.label, reached: ids.size, wonShare: pct1(wonAfter, ids.size) }
  })
  return {
    won: { count: count('won'), valuePaise: sum('won') },
    lost: { count: count('lost'), valuePaise: sum('lost') },
    winRate: pct1(count('won'), count('won') + count('lost')),
    valueWinRate: pct1(sum('won'), sum('won') + sum('lost')),
    reach,
  }
}

async function pipelineNow(ctx: Ctx, dealScope: Filter, cfg: OrbitConfig) {
  const open = await ctx.db(Deal).find({ ...dealScope, status: 'open' }, { stage: 1, valuePaise: 1, probability: 1, expectedCloseDate: 1 }).lean()
  const month = monthRange(monthOf(todayIST()))
  return {
    stages: cfg.dealStages.map((s) => {
      const list = open.filter((d) => d.stage === s.key)
      return { key: s.key, label: s.label, count: list.length, valuePaise: list.reduce((a, d) => a + d.valuePaise, 0), weightedPaise: list.reduce((a, d) => a + Math.round((d.valuePaise * d.probability) / 100), 0) }
    }),
    closingThisMonth: open.filter((d) => d.expectedCloseDate && d.expectedCloseDate >= month.start && d.expectedCloseDate <= month.end).reduce((a, d) => a + d.valuePaise, 0),
  }
}

async function byOwner(ctx: Ctx, rows: CohortLead[], f: ReportFilters, dealScope: Filter, sectorLeadIds: readonly unknown[] | null) {
  const [outreach, won] = await Promise.all([
    ctx.db(Activity).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ...reportActivityMatch('outreach', sectorLeadIds), occurredAt: { $gte: f.range.start, $lt: f.range.end } } }, { $group: { _id: '$createdBy', n: { $sum: 1 } } }]),
    ctx.db(Deal).aggregate<{ _id: Types.ObjectId; n: number; value: number }>([{ $match: { ...dealScope, status: 'won', closedAt: { $gte: f.range.start, $lt: f.range.end } } }, { $group: { _id: '$ownerId', n: { $sum: 1 }, value: { $sum: '$valuePaise' } } }]),
  ])
  const groups = groupFunnel(rows, 'ownerId')
  const ids = [...new Set([...groups.map((g) => g.key), ...outreach.map((o) => String(o._id)), ...won.map((w) => String(w._id))])]
  return ids
    .map((id) => {
      const g = groups.find((x) => x.key === id)
      const w = won.find((x) => String(x._id) === id)
      return { ownerId: id, total: g?.total ?? 0, contacted: g?.contacted ?? 0, engaged: g?.engaged ?? 0, meetings: g?.meetingsBooked ?? 0, cold: g?.cold ?? null, warm: g?.warm ?? null, outreach: outreach.find((o) => String(o._id) === id)?.n ?? 0, dealsWon: w?.n ?? 0, wonPaise: w?.value ?? 0 }
    })
    .sort((a, b) => b.total - a.total)
}

/** Everything the reports page shows. */
export async function reportData(ctx: Ctx, f: ReportFilters, cfg: OrbitConfig) {
  const leadScope = { ...leadOwnerFilter(ctx, f.owner), ...(f.sector ? { sector: f.sector } : {}) }
  const dealScope = { ...dealOwnerFilter(ctx, f.owner), ...(f.sector ? { sector: f.sector } : {}) }
  const effort = f.owner.memberId ? { createdBy: f.owner.memberId } : ctx.can('orbit.view_all') ? {} : { createdBy: ctx.memberId }
  const rows = await cohort(ctx, leadScope, f.range)
  const leadIds = await ctx.db(Lead).distinct('_id', leadScope)
  // With a sector picked, activity counts cover that sector's leads only.
  const sectorLeadIds = f.sector ? await ctx.db(Lead).distinct('_id', { sector: f.sector }) : null
  const today = todayIST()
  const [events, volume, sequenceEmails, replies, meetings, reasons, deals, pipeline, owners] = await Promise.all([
    ctx.db(StageEvent).find({ entity: 'lead', entityId: { $in: leadIds }, changedAt: { $gte: f.range.start } }, { entityId: 1, toStage: 1, changedAt: 1 }).lean(),
    dailyCounts(ctx, Activity, { ...effort, ...reportActivityMatch('outreach', sectorLeadIds) }, 'occurredAt', VOLUME_DAYS, today),
    dailyCounts(ctx, Activity, { ...effort, ...reportActivityMatch('sequence', sectorLeadIds) }, 'occurredAt', VOLUME_DAYS, today),
    dailyCounts(ctx, Activity, { ...effort, ...reportActivityMatch('reply', sectorLeadIds) }, 'occurredAt', VOLUME_DAYS, today),
    dailyCounts(ctx, Activity, { ...effort, ...reportActivityMatch('meeting', sectorLeadIds) }, 'occurredAt', VOLUME_DAYS, today),
    closeReasons(ctx, f, leadScope, dealScope),
    dealsSection(ctx, f, dealScope, cfg),
    pipelineNow(ctx, dealScope, cfg),
    f.showOwners ? byOwner(ctx, await cohort(ctx, f.sector ? { sector: f.sector } : {}, f.range), f, dealScope, sectorLeadIds) : Promise.resolve([]),
  ])
  const maturitySince = new Date(Date.now() - MATURITY_DAYS * 86_400_000)
  return {
    funnel: funnelCounts(rows),
    maturing: rows.filter((r) => r.contactedAt && r.contactedAt >= maturitySince).length,
    velocity: stageVelocity(events.map((e) => ({ entityId: String(e.entityId), toStage: e.toStage, changedAt: e.changedAt })), f.range),
    volume: { days: volume.days, outreach: volume.counts, sequenceEmails: sequenceEmails.counts, replies: replies.counts, meetings: meetings.counts },
    sources: groupFunnel(rows, 'source').sort(bySourceOrder),
    sectors: groupFunnel(rows, 'sector').sort((a, b) => b.total - a.total),
    owners,
    reasons,
    deals,
    pipeline,
  }
}
