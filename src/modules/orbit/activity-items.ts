import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Client } from '@/models/Client'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import type { ActivityStatus, ActivityType, Channel } from './constants'
import { nameOf, type PeopleIndex } from './people'
import type { ActivityItem } from './record-types'

type Id = Types.ObjectId | null | undefined
/** The activity fields the rows need (works with lean documents and hydrated ones). */
type ActivityDoc = {
  _id: Types.ObjectId; leadId?: Id; dealId?: Id; clientId?: Id; type: string; status: string; channel?: string | null; title?: string | null; notes?: string | null
  dueDate?: string | null; dueTime?: string | null; occurredAt?: Date | null; meetingLink?: string | null; assigneeId?: Id; createdBy?: Id; cancelReason?: string | null
}

const ids = (rows: ActivityDoc[], key: 'leadId' | 'dealId' | 'clientId') => [...new Set(rows.map((r) => r[key]).filter(Boolean).map(String))]

/** Maps activity documents to rows with their related record's name and link. */
export async function toActivityItems(ctx: Ctx, rows: ActivityDoc[], people: PeopleIndex): Promise<ActivityItem[]> {
  const [leads, deals, clients] = await Promise.all([
    ctx.db(Lead).find({ _id: { $in: ids(rows, 'leadId') } }, { companyName: 1 }).lean(),
    ctx.db(Deal).find({ _id: { $in: ids(rows, 'dealId') } }, { title: 1 }).lean(),
    ctx.db(Client).find({ _id: { $in: ids(rows, 'clientId') } }, { name: 1 }).lean(),
  ])
  const leadName = new Map(leads.map((l) => [String(l._id), l.companyName]))
  const dealName = new Map(deals.map((d) => [String(d._id), d.title]))
  const clientName = new Map(clients.map((c) => [String(c._id), c.name]))
  return rows.map((a) => {
    const related = a.dealId && dealName.has(String(a.dealId))
      ? { kind: 'deal' as const, id: String(a.dealId), label: dealName.get(String(a.dealId)) as string, href: `/app/orbit/deals/${a.dealId}` }
      : a.leadId && leadName.has(String(a.leadId))
        ? { kind: 'lead' as const, id: String(a.leadId), label: leadName.get(String(a.leadId)) as string, href: `/app/orbit/leads/${a.leadId}` }
        : a.clientId && clientName.has(String(a.clientId))
          ? { kind: 'client' as const, id: String(a.clientId), label: clientName.get(String(a.clientId)) as string, href: `/app/clients/${a.clientId}` }
          : null
    return {
      id: String(a._id),
      type: a.type as ActivityType,
      status: a.status as ActivityStatus,
      channel: (a.channel ?? 'other') as Channel,
      title: a.title ?? '',
      notes: a.notes ?? '',
      dueDate: a.dueDate ?? null,
      dueTime: a.dueTime ?? null,
      occurredAt: a.occurredAt ? new Date(a.occurredAt).toISOString() : null,
      meetingLink: a.meetingLink ?? null,
      assigneeName: nameOf(people, a.assigneeId),
      creatorName: nameOf(people, a.createdBy),
      related,
      cancelReason: a.cancelReason ?? null,
    }
  })
}
