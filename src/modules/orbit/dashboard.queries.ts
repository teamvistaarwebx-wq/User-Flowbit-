import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, monthOf, monthRange, shiftMonth, todayIST } from '@/lib/dates'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { toActivityItems } from './activity-items'
import { OPEN_LEAD_STAGES, OUTREACH_TYPES, STAGE_COLORS } from './constants'
import { cohortFunnel } from './reports.queries'
import { dailyCounts } from './series'
import { daysAgo, deltaPct, funnel, isStale } from './metrics'
import type { PeopleIndex } from './people'
import { dealOwnerFilter, isMe, leadOwnerFilter, viewAll, type Filter, type OwnerScope } from './scope'
import type { OrbitConfig } from './settings'
import { istRange } from './time-ranges'

export const SPARK_DAYS = 14
const NO_NEXT_LIMIT = 12

/** Activities logged by people in scope ("effort" numbers). */
export const effortFilter = (ctx: Ctx, owner: OwnerScope): Filter => (owner.memberId ? { createdBy: owner.memberId } : viewAll(ctx) ? {} : { createdBy: ctx.memberId })
/** Planned activities assigned to people in scope. */
const assigneeFilter = (ctx: Ctx, owner: OwnerScope): Filter => (owner.memberId ? { assigneeId: owner.memberId } : viewAll(ctx) ? {} : { assigneeId: ctx.memberId })

async function counters(ctx: Ctx, owner: OwnerScope, today: string) {
  const leadScope = leadOwnerFilter(ctx, owner)
  const effort = effortFilter(ctx, owner)
  const [added, outreach, replies, booked] = await Promise.all([
    dailyCounts(ctx, Lead, leadScope, 'createdAt', SPARK_DAYS, today),
    dailyCounts(ctx, Activity, { ...effort, status: 'done', type: { $in: [...OUTREACH_TYPES] } }, 'occurredAt', SPARK_DAYS, today),
    dailyCounts(ctx, Activity, { ...effort, status: 'done', type: 'reply' }, 'occurredAt', SPARK_DAYS, today),
    dailyCounts(ctx, Lead, leadScope, 'meetingBookedAt', SPARK_DAYS, today),
  ])
  const month = monthRange(monthOf(today))
  const { start, end } = istRange(month.start, today)
  const monthMeetings = await ctx.db(Lead).countDocuments({ ...leadScope, meetingBookedAt: { $gte: start, $lt: end } })
  const last = (s: { counts: number[] }) => s.counts[s.counts.length - 1] ?? 0
  return { added, outreach, replies, booked, today: { added: last(added), outreach: last(outreach), replies: last(replies), booked: last(booked) }, monthMeetings }
}

async function pipeline(ctx: Ctx, owner: OwnerScope, cfg: OrbitConfig) {
  const rows = await ctx.db(Deal).aggregate<{ _id: string; n: number; value: number; weightedValue: number }>([
    { $match: { ...dealOwnerFilter(ctx, owner), status: 'open' } },
    { $group: { _id: '$stage', n: { $sum: 1 }, value: { $sum: '$valuePaise' }, weightedValue: { $sum: { $round: [{ $divide: [{ $multiply: ['$valuePaise', '$probability'] }, 100] }, 0] } } } },
  ])
  const by = new Map(rows.map((r) => [r._id, r]))
  const stages = cfg.dealStages.map((s) => ({ key: s.key, label: s.label, color: STAGE_COLORS[s.color], count: by.get(s.key)?.n ?? 0, valuePaise: by.get(s.key)?.value ?? 0, weightedPaise: by.get(s.key)?.weightedValue ?? 0 }))
  return { stages, openPaise: stages.reduce((s, x) => s + x.valuePaise, 0), weightedPaise: stages.reduce((s, x) => s + x.weightedPaise, 0) }
}

async function wonThisMonth(ctx: Ctx, owner: OwnerScope, today: string) {
  const thisMonth = monthRange(monthOf(today))
  const lastMonth = monthRange(shiftMonth(monthOf(today), -1))
  const scope = dealOwnerFilter(ctx, owner)
  const cur = istRange(thisMonth.start, thisMonth.end)
  const prev = istRange(lastMonth.start, lastMonth.end)
  const [won, previous] = await Promise.all([
    ctx.db(Deal).find({ ...scope, status: 'won', closedAt: { $gte: cur.start, $lt: cur.end } }).sort({ closedAt: -1 }).lean(),
    ctx.db(Deal).find({ ...scope, status: 'won', closedAt: { $gte: prev.start, $lt: prev.end } }, { valuePaise: 1 }).lean(),
  ])
  const clients = await ctx.db(Client).find({ _id: { $in: won.slice(0, 3).map((d) => d.clientId).filter(Boolean) } }, { name: 1 }).lean()
  const names = new Map(clients.map((c) => [String(c._id), c.name]))
  const sum = won.reduce((s, d) => s + d.valuePaise, 0)
  const prevSum = previous.reduce((s, d) => s + d.valuePaise, 0)
  return {
    count: won.length,
    valuePaise: sum,
    delta: deltaPct(sum, prevSum),
    recent: won.slice(0, 3).map((d) => ({ id: String(d._id), title: d.title, client: d.clientId ? (names.get(String(d.clientId)) ?? '') : '', valuePaise: d.valuePaise })),
  }
}

async function followUps(ctx: Ctx, owner: OwnerScope, today: string, people: PeopleIndex) {
  const base = { ...assigneeFilter(ctx, owner), status: 'planned' }
  const [overdue, dueToday] = await Promise.all([
    ctx.db(Activity).find({ ...base, dueDate: { $lt: today } }).sort({ dueDate: 1, createdAt: 1 }).limit(20).lean(),
    ctx.db(Activity).find({ ...base, dueDate: today }).sort({ dueTime: 1, createdAt: 1 }).limit(20).lean(),
  ])
  return { overdue: await toActivityItems(ctx, overdue, people), dueToday: await toActivityItems(ctx, dueToday, people) }
}

async function noNextStep(ctx: Ctx, owner: OwnerScope, cfg: OrbitConfig) {
  const filter = { ...leadOwnerFilter(ctx, owner), stage: { $in: [...OPEN_LEAD_STAGES] }, nextFollowUp: null }
  const staleBefore = new Date(Date.now() - cfg.staleDays * 86_400_000)
  const [rows, total, ghosts, openLeads] = await Promise.all([
    ctx.db(Lead).find(filter, { companyName: 1, stage: 1, lastActivityAt: 1, ownerId: 1, reviewerId: 1, source: 1 }).sort({ lastActivityAt: 1 }).limit(NO_NEXT_LIMIT).lean(),
    ctx.db(Lead).countDocuments(filter),
    ctx.db(Lead).countDocuments({ ...filter, lastActivityAt: { $lte: staleBefore } }),
    ctx.db(Lead).countDocuments({ ...leadOwnerFilter(ctx, owner), stage: { $in: [...OPEN_LEAD_STAGES] } }),
  ])
  return {
    leads: rows.map((l) => ({ id: String(l._id), companyName: l.companyName, stage: l.stage, days: daysAgo(l.lastActivityAt), stale: isStale(l.lastActivityAt, cfg.staleDays), canEdit: ctx.can('orbit.close') || isMe(ctx, l.ownerId) || isMe(ctx, l.reviewerId) })),
    total,
    ghosts,
    openLeads,
  }
}

/** Everything the Orbit dashboard shows, scoped to the owner selector. */
export async function dashboard(ctx: Ctx, owner: OwnerScope, cfg: OrbitConfig, people: PeopleIndex) {
  const today = todayIST()
  const cohortFrom = addDays(today, -29)
  const [count, pipe, won, follow, noNext, cohort, openDeals] = await Promise.all([
    counters(ctx, owner, today),
    pipeline(ctx, owner, cfg),
    wonThisMonth(ctx, owner, today),
    followUps(ctx, owner, today, people),
    noNextStep(ctx, owner, cfg),
    cohortFunnel(ctx, leadOwnerFilter(ctx, owner), istRange(cohortFrom, today)),
    ctx.db(Deal).countDocuments({ ...dealOwnerFilter(ctx, owner), status: 'open' }),
  ])
  return { today, counters: count, pipeline: pipe, won, followUps: follow, noNext, conversion: funnel(cohort), openDeals }
}
