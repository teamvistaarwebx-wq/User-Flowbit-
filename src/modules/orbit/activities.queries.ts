import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, dayBoundsIST, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Activity } from '@/models/orbit/Activity'
import { toActivityItems } from './activity-items'
import { PAGE_SIZE, type ActivityType } from './constants'
import type { PeopleIndex } from './people'
import { activityOwnerFilter, resolveOwner, type Filter } from './scope'
import { istRange } from './time-ranges'

export const ACTIVITY_TABS = ['today', 'overdue', 'upcoming', 'done'] as const
export type ActivityTab = (typeof ACTIVITY_TABS)[number]
export const TYPE_FILTERS: { value: string; label: string; type: ActivityType }[] = [
  { value: 'calls', label: 'Calls', type: 'call' }, { value: 'emails', label: 'Emails', type: 'email' }, { value: 'dms', label: 'DMs', type: 'dm' },
  { value: 'follow_ups', label: 'Follow-ups', type: 'follow_up' }, { value: 'meetings', label: 'Meetings', type: 'meeting' }, { value: 'replies', label: 'Replies', type: 'reply' }, { value: 'notes', label: 'Notes', type: 'note' },
]
const UPCOMING_DAYS = 30
const ISO = /^\d{4}-\d{2}-\d{2}$/

export type ActivityQuery = { tab: ActivityTab; type: ActivityType | null; owner: string | undefined; related: 'lead' | 'deal' | 'client' | null; from: string; to: string; page: number }

export function parseActivityQuery(sp: SearchParams, today: string = todayIST()): ActivityQuery {
  const tab = first(sp.tab)
  const related = first(sp.related)
  const from = first(sp.from)
  const to = first(sp.to)
  return {
    tab: (ACTIVITY_TABS as readonly string[]).includes(tab ?? '') ? (tab as ActivityTab) : 'today',
    type: TYPE_FILTERS.find((t) => t.value === first(sp.type))?.type ?? null,
    owner: first(sp.owner),
    related: related === 'lead' || related === 'deal' || related === 'client' ? related : null,
    from: from && ISO.test(from) ? from : addDays(today, -6),
    to: to && ISO.test(to) ? to : today,
    page: Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1),
  }
}

const RELATED: Record<'lead' | 'deal' | 'client', Filter> = {
  lead: { leadId: { $ne: null }, dealId: null },
  deal: { dealId: { $ne: null } },
  client: { clientId: { $ne: null }, leadId: null, dealId: null },
}

async function baseFilter(ctx: Ctx, q: ActivityQuery): Promise<Filter> {
  const and: Filter[] = [await activityOwnerFilter(ctx, resolveOwner(ctx, q.owner))]
  if (q.type) and.push({ type: q.type })
  if (q.related) and.push(RELATED[q.related])
  return { $and: and }
}

export async function listActivities(ctx: Ctx, q: ActivityQuery, people: PeopleIndex) {
  const today = todayIST()
  const base = await baseFilter(ctx, q)
  const A = ctx.db(Activity)
  const planned = (due: Filter) => ({ ...base, status: 'planned', dueDate: due })
  const [todayCount, overdueCount, upcomingCount] = await Promise.all([
    A.countDocuments(planned({ $eq: today })),
    A.countDocuments(planned({ $lt: today })),
    A.countDocuments(planned({ $gt: today, $lte: addDays(today, UPCOMING_DAYS) })),
  ])
  const counts = { today: todayCount, overdue: overdueCount, upcoming: upcomingCount }

  if (q.tab === 'done') {
    const { start, end } = istRange(q.from, q.to)
    const filter = { ...base, status: { $in: ['done', 'cancelled'] }, $or: [{ occurredAt: { $gte: start, $lt: end } }, { cancelledAt: { $gte: start, $lt: end } }] }
    const [rows, total] = await Promise.all([A.find(filter).sort({ occurredAt: -1, cancelledAt: -1, _id: -1 }).skip((q.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(), A.countDocuments(filter)])
    return { items: await toActivityItems(ctx, rows, people), doneToday: [], total, counts }
  }
  const due = q.tab === 'today' ? { $eq: today } : q.tab === 'overdue' ? { $lt: today } : { $gt: today, $lte: addDays(today, UPCOMING_DAYS) }
  const rows = await A.find(planned(due)).sort({ dueDate: 1, dueTime: 1, createdAt: 1 }).limit(200).lean()
  const bounds = dayBoundsIST(today)
  const doneToday = q.tab === 'today' ? await A.find({ ...base, status: 'done', occurredAt: { $gte: bounds.start, $lt: bounds.end } }).sort({ occurredAt: -1, _id: -1 }).limit(50).lean() : []
  return { items: await toActivityItems(ctx, rows, people), doneToday: await toActivityItems(ctx, doneToday, people), total: rows.length, counts }
}
