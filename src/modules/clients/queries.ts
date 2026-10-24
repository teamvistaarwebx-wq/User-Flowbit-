import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { istInstant, monthRange } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Invoice } from '@/models/folio/Invoice'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { outstandingByClient } from '@/modules/orbit/folio-links'
import { dealAccess } from '@/modules/orbit/scope'
import { cardMetrics } from './card-metrics'
import { clientColumns } from './columns'
import { NEW_WINDOWS, newSince, type NewWindow } from './dashboard-math'
import { isClientHealth, type ClientHealth } from './health'
import { clientSignals, healthOf, type AllSignals } from './signals'
import { workModels } from './references'

export { clientColumns }

export const CLIENT_PAGE_SIZE = 25
const SORT_CAP = 2000
export const CLIENT_SORTS = ['name', 'recent', 'onboarded', 'pipeline', 'outstanding'] as const
export type ClientSort = (typeof CLIENT_SORTS)[number]
export const CLIENT_VIEWS = ['cards', 'list'] as const
export type ClientView = (typeof CLIENT_VIEWS)[number]

export type ClientQuery = {
  q: string
  status: string
  owner: string | null
  tag: string | null
  sort: ClientSort
  page: number
  /** Added in the last 30 or 90 days. */
  isNew: NewWindow | null
  /** Onboarding month 'YYYY-MM'. */
  cohort: string | null
  health: ClientHealth | null
  view: ClientView
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function parseClientQuery(sp: SearchParams): ClientQuery {
  const status = first(sp.status) ?? 'current'
  const sort = first(sp.sort)
  const owner = first(sp.owner)
  const isNew = Number(first(sp.new))
  const cohort = first(sp.cohort)
  const health = first(sp.health)
  return {
    q: (first(sp.q) ?? '').trim().slice(0, 80),
    status: ['current', 'all', 'lead', 'active', 'inactive'].includes(status) ? status : 'current',
    owner: owner && /^[a-f0-9]{24}$/i.test(owner) ? owner : null,
    tag: first(sp.tag) || null,
    sort: (CLIENT_SORTS as readonly string[]).includes(sort ?? '') ? (sort as ClientSort) : 'name',
    page: Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1),
    isNew: (NEW_WINDOWS as readonly number[]).includes(isNew) ? (isNew as NewWindow) : null,
    cohort: cohort && MONTH.test(cohort) ? cohort : null,
    health: isClientHealth(health) ? health : null,
    view: first(sp.view) === 'list' ? 'list' : 'cards',
  }
}

/** Mongo filter for the stored fields; health is computed afterwards (only active clients have one). */
export function clientFilter(q: ClientQuery, today: string): Record<string, unknown> {
  const f: Record<string, unknown> = {}
  if (q.health) f.status = 'active'
  else if (q.status === 'current') f.status = { $in: ['lead', 'active'] }
  else if (q.status !== 'all') f.status = q.status
  if (q.owner) f.ownerId = q.owner
  if (q.tag) f.tags = q.tag
  const created: Record<string, Date> = {}
  if (q.isNew) created.$gte = istInstant(newSince(today, q.isNew))
  if (q.cohort) {
    const { start, end } = monthRange(q.cohort)
    const from = istInstant(start)
    created.$gte = created.$gte && created.$gte > from ? created.$gte : from
    created.$lt = new Date(istInstant(end).getTime() + 86_400_000)
  }
  if (Object.keys(created).length) f.createdAt = created
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i')
    f.$or = [{ name: re }, { displayName: re }, { email: re }, { gstin: re }, { 'contacts.name': re }, { 'contacts.email': re }]
  }
  return f
}

const toMap = <R extends { _id: Types.ObjectId }, T>(rows: R[], pick: (r: R) => T) => new Map(rows.map((r) => [String(r._id), pick(r)]))

/** Open pipeline per client; 'all' skips the long `$in` when ranking every candidate (the groups are small). */
const pipelineByClient = (ctx: Ctx, ids: Types.ObjectId[] | 'all') =>
  ctx.db(Deal).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ...dealAccess(ctx), status: 'open', clientId: ids === 'all' ? { $ne: null } : { $in: ids } } }, { $group: { _id: '$clientId', n: { $sum: '$valuePaise' } } }])

/** Outstanding balance per client across the workspace (one grouped pass over open invoices). */
async function outstandingAll(ctx: Ctx): Promise<Map<string, number>> {
  const rows = await ctx.db(Invoice).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { status: { $in: ['issued', 'part_paid'] } } }, { $group: { _id: '$clientId', n: { $sum: '$balancePaise' } } }])
  return toMap(rows, (r) => r.n)
}

/** Per-client numbers from the other products (open pipeline, outstanding, active projects, last activity). */
export async function clientMetrics(ctx: Ctx, ids: Types.ObjectId[]) {
  const cols = clientColumns(ctx)
  const work = cols.work ? await workModels() : null
  const [pipeline, outstanding, projects, activity] = await Promise.all([
    cols.orbit ? pipelineByClient(ctx, ids) : [],
    cols.folio ? outstandingByClient(ctx, ids) : new Map<string, number>(),
    work ? ctx.db(work.Project).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { clientId: { $in: ids }, status: { $in: ['planning', 'active', 'on_hold'] } } }, { $group: { _id: '$clientId', n: { $sum: 1 } } }]) : [],
    cols.orbit ? ctx.db(Activity).aggregate<{ _id: Types.ObjectId; at: Date }>([{ $match: { clientId: { $in: ids }, status: 'done' } }, { $group: { _id: '$clientId', at: { $max: '$occurredAt' } } }]) : [],
  ])
  return {
    pipeline: toMap(pipeline, (r) => r.n),
    outstanding,
    projects: toMap(projects, (r) => r.n),
    lastActivity: toMap(activity, (r) => r.at),
  }
}

const STORED_SORT: Record<string, Record<string, 1 | -1>> = { name: { name: 1 }, recent: { updatedAt: -1 }, onboarded: { createdAt: -1 } }
const storedSort = (sort: ClientSort) => ({ ...(STORED_SORT[sort] ?? STORED_SORT.name), _id: 1 as const })

type Candidate = { _id: Types.ObjectId; status?: string | null; updatedAt?: Date | null }

/**
 * Ids in the order a computed sort or the health filter asks for. Only `_id`, status and updatedAt are read
 * for the candidates, and only the one metric the sort needs is computed for all of them.
 */
async function computedOrder(ctx: Ctx, q: ClientQuery, filter: Record<string, unknown>, today: string, allSignals: AllSignals = () => clientSignals(ctx, 'all', today)): Promise<Types.ObjectId[]> {
  const candidates = await ctx.db(Client).find(filter, { status: 1, updatedAt: 1 }).sort(storedSort(q.sort)).limit(SORT_CAP).lean<Candidate[]>()
  const signals = q.health ? await allSignals() : null
  const kept = signals ? candidates.filter((c) => healthOf(c, signals.get(String(c._id)), today) === q.health) : candidates
  if (q.sort !== 'pipeline' && q.sort !== 'outstanding') return kept.map((c) => c._id)
  const keptIds = kept.map((c) => c._id)
  const cols = clientColumns(ctx)
  const value = q.sort === 'pipeline' ? (cols.orbit ? toMap(await pipelineByClient(ctx, 'all'), (r) => r.n) : new Map<string, number>()) : cols.folio ? await outstandingAll(ctx) : new Map<string, number>()
  return [...keptIds].sort((a, b) => (value.get(String(b)) ?? 0) - (value.get(String(a)) ?? 0))
}

/** One page of clients in the asked order, and how many match. */
async function clientPage(ctx: Ctx, q: ClientQuery, today: string, allSignals?: AllSignals) {
  const filter = clientFilter(q, today)
  const skip = (q.page - 1) * CLIENT_PAGE_SIZE
  const computed = q.sort === 'pipeline' || q.sort === 'outstanding' || q.health !== null
  if (!computed) {
    const [rows, total] = await Promise.all([ctx.db(Client).find(filter).sort(storedSort(q.sort)).skip(skip).limit(CLIENT_PAGE_SIZE).lean(), ctx.db(Client).countDocuments(filter)])
    return { rows, total }
  }
  const order = await computedOrder(ctx, q, filter, today, allSignals)
  const pageIds = order.slice(skip, skip + CLIENT_PAGE_SIZE)
  const docs = await ctx.db(Client).find({ _id: { $in: pageIds } }).lean()
  const byId = new Map(docs.map((d) => [String(d._id), d]))
  return { rows: pageIds.flatMap((id) => byId.get(String(id)) ?? []), total: order.length }
}

/** `allSignals` shares the workspace-wide signals with the dashboard on the same page (lib/once). */
export async function listClients(ctx: Ctx, q: ClientQuery, today: string, allSignals?: AllSignals) {
  const { rows, total } = await clientPage(ctx, q, today, allSignals)
  const ids = rows.map((r) => r._id)
  const [metrics, signals, cards] = await Promise.all([clientMetrics(ctx, ids), clientSignals(ctx, ids, today), cardMetrics(ctx, ids, today)])
  return { rows, total, metrics, signals, cards }
}

type ExportClient = Awaited<ReturnType<typeof clientPage>>['rows'][number]

/**
 * Every client the list's filters match, health included, in the list's
 * order (up to `max`), with each one's health: the CSV export uses exactly
 * the list's rules, not only the stored-field filters.
 */
export async function exportClients(ctx: Ctx, q: ClientQuery, today: string, max: number): Promise<Array<{ client: ExportClient; health: ClientHealth | null }>> {
  const filter = clientFilter(q, today)
  const computed = q.sort === 'pipeline' || q.sort === 'outstanding' || q.health !== null
  let rows: ExportClient[]
  if (!computed) {
    rows = await ctx.db(Client).find(filter).sort(storedSort(q.sort)).limit(max).lean()
  } else {
    const ids = (await computedOrder(ctx, q, filter, today)).slice(0, max)
    const docs = await ctx.db(Client).find({ _id: { $in: ids } }).lean()
    const byId = new Map(docs.map((d) => [String(d._id), d]))
    rows = ids.flatMap((id) => byId.get(String(id)) ?? [])
  }
  const signals = await clientSignals(ctx, rows.map((r) => r._id), today)
  return rows.map((client) => ({ client, health: healthOf(client, signals.get(String(client._id)), today) }))
}

export async function clientTags(ctx: Ctx): Promise<string[]> {
  const tags = (await ctx.db(Client).distinct('tags')) as string[]
  return tags.filter(Boolean).sort((a, b) => a.localeCompare(b))
}
