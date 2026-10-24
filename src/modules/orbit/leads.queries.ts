import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { BOARD_COLUMN_LIMIT, CLOSED_LEAD_STAGES, LEAD_STAGES, OPEN_LEAD_STAGES, PAGE_SIZE, labelFrom, type LeadStage } from './constants'
import { daysAgo, isStale } from './metrics'
import { nameOf, type PeopleIndex } from './people'
import type { LeadCardData } from './record-types'
import { canEditLead, leadOwnerFilter, resolveOwner, type Filter, type LeadDoc } from './scope'
import type { OrbitConfig } from './settings'

export const LEAD_SORTS = { updated: 'updatedAt', company: 'companyName', due: 'nextFollowUp.dueDate', created: 'createdAt', value: 'valuePaise', touch: 'lastActivityAt' } as const
export type LeadSort = keyof typeof LEAD_SORTS
export const DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const

export type LeadQuery = {
  view: 'table' | 'board'
  q: string
  stage: string
  sector: string | null
  source: string | null
  owner: string | undefined
  due: (typeof DUE_FILTERS)[number] | null
  stale: boolean
  showClosed: boolean
  sort: LeadSort
  dir: 'asc' | 'desc'
  page: number
}

export function parseLeadQuery(sp: SearchParams): LeadQuery {
  const stage = first(sp.stage) ?? 'open'
  const sort = first(sp.sort) ?? 'updated'
  const due = first(sp.due)
  return {
    view: first(sp.view) === 'board' ? 'board' : 'table',
    q: (first(sp.q) ?? '').trim().slice(0, 80),
    stage: ['open', 'all', 'closed', ...LEAD_STAGES].includes(stage) ? stage : 'open',
    sector: first(sp.sector) || null,
    source: first(sp.source) || null,
    owner: first(sp.owner),
    due: (DUE_FILTERS as readonly string[]).includes(due ?? '') ? (due as LeadQuery['due']) : null,
    stale: first(sp.stale) === '1',
    showClosed: first(sp.closed) === '1',
    sort: sort in LEAD_SORTS ? (sort as LeadSort) : 'updated',
    dir: first(sp.dir) === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1),
  }
}

/** Mongo filter for the leads list, board and CSV export (always within your scope). */
export function leadFilter(ctx: Ctx, q: LeadQuery, cfg: OrbitConfig, opts: { ignoreStage?: boolean } = {}): Filter {
  const and: Filter[] = [leadOwnerFilter(ctx, resolveOwner(ctx, q.owner))]
  if (!opts.ignoreStage) {
    if (q.stage === 'open') and.push({ stage: { $in: [...OPEN_LEAD_STAGES] } })
    else if (q.stage === 'closed') and.push({ stage: { $in: [...CLOSED_LEAD_STAGES] } })
    else if (q.stage !== 'all') and.push({ stage: q.stage })
  }
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i')
    and.push({ $or: [{ companyName: re }, { contactName: re }, { email: re }, { phone: re }] })
  }
  if (q.sector) and.push({ sector: q.sector })
  if (q.source) and.push({ source: q.source })
  const today = todayIST()
  if (q.due === 'overdue') and.push({ 'nextFollowUp.dueDate': { $lt: today } })
  if (q.due === 'today') and.push({ 'nextFollowUp.dueDate': today })
  if (q.due === 'week') and.push({ 'nextFollowUp.dueDate': { $gte: today, $lte: addDays(today, 6) } })
  if (q.due === 'none') and.push({ nextFollowUp: null, stage: { $in: [...OPEN_LEAD_STAGES] } })
  if (q.stale) and.push({ lastActivityAt: { $lte: new Date(Date.now() - cfg.staleDays * 86_400_000) }, stage: { $in: [...OPEN_LEAD_STAGES] } })
  return { $and: and }
}

export function toLeadCard(ctx: Ctx, lead: LeadDoc, cfg: OrbitConfig, people: PeopleIndex, heldMeetings: Set<string> = new Set()): LeadCardData {
  const open = (OPEN_LEAD_STAGES as readonly string[]).includes(lead.stage)
  return {
    id: String(lead._id),
    columnId: lead.stage,
    companyName: lead.companyName,
    contactName: lead.contactName ?? '',
    designation: lead.designation ?? '',
    email: lead.email ?? '',
    ownerId: String(lead.ownerId),
    sector: lead.sector,
    sectorLabel: labelFrom(cfg.sectors, lead.sector),
    source: lead.source,
    sourceLabel: labelFrom(cfg.sources, lead.source),
    stage: lead.stage as LeadStage,
    icpScore: lead.icpScore ?? null,
    valuePaise: lead.valuePaise ?? null,
    ownerName: nameOf(people, lead.ownerId),
    nextDue: lead.nextFollowUp?.dueDate ?? null,
    nextTitle: lead.nextFollowUp?.title ?? null,
    daysSinceTouch: daysAgo(lead.lastActivityAt ?? lead.createdAt),
    stale: open && isStale(lead.lastActivityAt, cfg.staleDays),
    canEdit: canEditLead(ctx, lead),
    hasMeetingHeld: heldMeetings.has(String(lead._id)),
  }
}

export async function listLeads(ctx: Ctx, q: LeadQuery, cfg: OrbitConfig, people: PeopleIndex) {
  const filter = leadFilter(ctx, q, cfg)
  const sort = { [LEAD_SORTS[q.sort]]: q.dir === 'asc' ? 1 : -1, _id: -1 } as Record<string, 1 | -1>
  const [rows, total] = await Promise.all([
    ctx.db(Lead).find(filter).sort(sort).skip((q.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    ctx.db(Lead).countDocuments(filter),
  ])
  return { rows: rows.map((l) => toLeadCard(ctx, l, cfg, people)), total }
}

/** Board: up to 100 open leads per stage, plus leads closed in the last 30 days when asked. */
export async function boardLeads(ctx: Ctx, q: LeadQuery, cfg: OrbitConfig, people: PeopleIndex) {
  const filter = leadFilter(ctx, q, cfg, { ignoreStage: true })
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [openCols, closed] = await Promise.all([
    Promise.all(OPEN_LEAD_STAGES.map((stage) => ctx.db(Lead).find({ ...filter, stage }).sort({ updatedAt: -1 }).limit(BOARD_COLUMN_LIMIT + 1).lean())),
    q.showClosed ? ctx.db(Lead).find({ ...filter, stage: { $in: [...CLOSED_LEAD_STAGES] }, closedAt: { $gte: since } }).sort({ closedAt: -1 }).limit(BOARD_COLUMN_LIMIT * 3).lean() : Promise.resolve([]),
  ])
  const truncated = openCols.filter((c) => c.length > BOARD_COLUMN_LIMIT).map((c) => c[0].stage)
  const leads = [...openCols.flatMap((c) => c.slice(0, BOARD_COLUMN_LIMIT)), ...closed]
  const booked = leads.filter((l) => l.stage === 'meeting_booked').map((l) => l._id)
  const held = booked.length ? await ctx.db(Activity).distinct('leadId', { leadId: { $in: booked }, type: 'meeting', status: 'done' }) : []
  const heldSet = new Set(held.map(String))
  return { cards: leads.map((l) => toLeadCard(ctx, l, cfg, people, heldSet)), truncated }
}
