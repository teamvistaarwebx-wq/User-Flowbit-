import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, monthOf, monthRange, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Deal } from '@/models/orbit/Deal'
import { BOARD_COLUMN_LIMIT, PAGE_SIZE } from './constants'
import { daysAgo, weighted } from './metrics'
import { nameOf, type PeopleIndex } from './people'
import type { DealCardData } from './record-types'
import { canEditDeal, dealOwnerFilter, resolveOwner, type DealDoc, type Filter } from './scope'
import { istRange } from './time-ranges'

export const CLOSE_FILTERS = ['this_month', 'overdue', 'next_30'] as const
export const DEAL_SORTS = { updated: 'updatedAt', value: 'valuePaise', close: 'expectedCloseDate', title: 'title', created: 'createdAt' } as const

export type DealQuery = {
  view: 'board' | 'table'
  q: string
  owner: string | undefined
  client: string | null
  source: string | null
  close: (typeof CLOSE_FILTERS)[number] | null
  status: 'open' | 'won' | 'lost' | 'all'
  sort: keyof typeof DEAL_SORTS
  dir: 'asc' | 'desc'
  page: number
}

export function parseDealQuery(sp: SearchParams): DealQuery {
  const close = first(sp.close)
  const status = first(sp.status)
  const sort = first(sp.sort) ?? 'updated'
  const client = first(sp.client)
  return {
    view: first(sp.view) === 'table' ? 'table' : 'board',
    q: (first(sp.q) ?? '').trim().slice(0, 80),
    owner: first(sp.owner),
    client: client && /^[a-f0-9]{24}$/i.test(client) ? client : null,
    source: first(sp.source) || null,
    close: (CLOSE_FILTERS as readonly string[]).includes(close ?? '') ? (close as DealQuery['close']) : null,
    status: status === 'won' || status === 'lost' || status === 'all' ? status : 'open',
    sort: sort in DEAL_SORTS ? (sort as DealQuery['sort']) : 'updated',
    dir: first(sp.dir) === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1),
  }
}

/** Deals filter (scope + search + client/source/close filters); status handled by the caller. */
export async function dealFilter(ctx: Ctx, q: DealQuery): Promise<Filter> {
  const and: Filter[] = [dealOwnerFilter(ctx, resolveOwner(ctx, q.owner))]
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i')
    const clientIds = await ctx.db(Client).distinct('_id', { name: re })
    and.push({ $or: [{ title: re }, { clientId: { $in: clientIds } }] })
  }
  if (q.client) and.push({ clientId: q.client })
  if (q.source) and.push({ source: q.source })
  const today = todayIST()
  const month = monthRange(monthOf(today))
  if (q.close === 'this_month') and.push({ expectedCloseDate: { $gte: month.start, $lte: month.end } })
  if (q.close === 'overdue') and.push({ expectedCloseDate: { $lt: today }, status: 'open' })
  if (q.close === 'next_30') and.push({ expectedCloseDate: { $gte: today, $lte: addDays(today, 30) } })
  return { $and: and }
}

async function clientNames(ctx: Ctx, deals: DealDoc[]) {
  const ids = [...new Set(deals.map((d) => d.clientId).filter(Boolean).map(String))]
  const rows = await ctx.db(Client).find({ _id: { $in: ids } }, { name: 1 }).lean()
  return new Map(rows.map((c) => [String(c._id), c.name]))
}

export function toDealCard(ctx: Ctx, d: DealDoc, people: PeopleIndex, clients: Map<string, string>): DealCardData {
  return {
    id: String(d._id),
    columnId: d.stage,
    title: d.title,
    clientName: d.clientId ? (clients.get(String(d.clientId)) ?? 'Client') : 'No client',
    valuePaise: d.valuePaise,
    probability: d.probability,
    expectedCloseDate: d.expectedCloseDate ?? null,
    ownerName: nameOf(people, d.ownerId),
    daysInStage: daysAgo(d.stageChangedAt ?? d.createdAt),
    nextDue: d.nextFollowUp?.dueDate ?? null,
    nextTitle: d.nextFollowUp?.title ?? null,
    source: d.source ?? null,
    canEdit: canEditDeal(ctx, d),
    status: d.status as DealCardData['status'],
  }
}

/** Board: open deals by stage, plus deals won or lost in the last 90 days. */
export async function boardDeals(ctx: Ctx, q: DealQuery, people: PeopleIndex) {
  const filter = await dealFilter(ctx, q)
  const since = new Date(Date.now() - 90 * 86_400_000)
  const [open, closed] = await Promise.all([
    ctx.db(Deal).find({ ...filter, status: 'open' }).sort({ updatedAt: -1 }).limit(BOARD_COLUMN_LIMIT * 8).lean(),
    ctx.db(Deal).find({ ...filter, status: { $in: ['won', 'lost'] }, closedAt: { $gte: since } }).sort({ closedAt: -1 }).limit(BOARD_COLUMN_LIMIT * 2).lean(),
  ])
  const all = [...open, ...closed]
  const clients = await clientNames(ctx, all)
  return all.map((d) => toDealCard(ctx, d, people, clients))
}

export async function listDeals(ctx: Ctx, q: DealQuery, people: PeopleIndex) {
  const filter = { ...(await dealFilter(ctx, q)), ...(q.status === 'all' ? {} : { status: q.status }) }
  const sort = { [DEAL_SORTS[q.sort]]: q.dir === 'asc' ? 1 : -1, _id: -1 } as Record<string, 1 | -1>
  const [rows, total] = await Promise.all([
    ctx.db(Deal).find(filter).sort(sort).skip((q.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    ctx.db(Deal).countDocuments(filter),
  ])
  const clients = await clientNames(ctx, rows)
  return { rows: rows.map((d) => toDealCard(ctx, d, people, clients)), total }
}

/** Header totals: open pipeline, weighted, won this month, expected this month. */
export async function dealTotals(ctx: Ctx, q: DealQuery) {
  const filter = await dealFilter(ctx, { ...q, close: null })
  const today = todayIST()
  const month = monthRange(monthOf(today))
  const { start, end } = istRange(month.start, month.end)
  const [open, won] = await Promise.all([
    ctx.db(Deal).find({ ...filter, status: 'open' }, { valuePaise: 1, probability: 1, expectedCloseDate: 1 }).lean(),
    ctx.db(Deal).find({ ...filter, status: 'won', closedAt: { $gte: start, $lt: end } }, { valuePaise: 1 }).lean(),
  ])
  return {
    openPaise: open.reduce((s, d) => s + d.valuePaise, 0),
    weightedPaise: open.reduce((s, d) => s + weighted(d.valuePaise, d.probability), 0),
    wonPaise: won.reduce((s, d) => s + d.valuePaise, 0),
    wonCount: won.length,
    expectedPaise: open.filter((d) => d.expectedCloseDate && d.expectedCloseDate >= month.start && d.expectedCloseDate <= month.end).reduce((s, d) => s + d.valuePaise, 0),
  }
}
