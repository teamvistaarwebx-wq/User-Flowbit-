import 'server-only'
import { isRemindable } from './schedule'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { daysBetween, todayIST } from '@/lib/dates'
import { userIdsWithPermission } from '@/lib/notify'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { FolioFollowup } from '@/models/folio/Followup'
import { FolioMessage } from '@/models/folio/MessageLog'
import { Invoice } from '@/models/folio/Invoice'
import { collectionPriority, summariseAging, type AgingSummary } from '@/modules/folio/engine/aging'
import { listOutstanding, type OutstandingRow } from '@/modules/folio/queries/balances'
import { clientLabel, clientNameMap } from '@/modules/folio/queries/common'
import { whatsappLink } from './compose'

export type QueueRow = {
  id: string
  clientId: string
  clientName: string
  subject: string | null
  notes: string | null
  invoiceId: string | null
  invoiceNumber: string | null
  effectiveDue: string
  daysLate: number
  snoozed: boolean
  channel: string
  balancePaise: number
  assigneeName: string | null
}

export type OverdueRow = OutstandingRow & { lastReminderAt: string | null; hasOpenFollowup: boolean }
export type QueuedWhatsApp = { id: string; invoiceId: string | null; invoiceNumber: string | null; clientName: string; toAddress: string; body: string; link: string | null }

/** Member id -> name for the given members (names live on User). */
export async function memberNames(ctx: Ctx, ids: Array<Types.ObjectId | string>): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const members = await ctx.db(Member).find({ _id: { $in: ids } }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const userName = new Map(users.map((u) => [String(u._id), u.name]))
  return new Map(members.map((m) => [String(m._id), userName.get(String(m.userId)) ?? 'Member']))
}

/** Active members who can open Folio (follow-up assignees). */
export async function folioMembers(ctx: Ctx): Promise<{ id: string; name: string }[]> {
  const userIds = await userIdsWithPermission(ctx.orgId, 'folio.read')
  const members = await ctx.db(Member).find({ status: 'active', userId: { $in: userIds } }, { userId: 1 }).lean()
  const names = await memberNames(ctx, members.map((m) => m._id))
  return members.map((m) => ({ id: String(m._id), name: names.get(String(m._id)) ?? 'Member' })).sort((a, b) => a.name.localeCompare(b.name))
}

async function queue(ctx: Ctx, today: string, opts: { mine: boolean; clientId?: string; entityId?: string | null }): Promise<QueueRow[]> {
  const filter = {
    $or: [{ status: 'open', dueOn: { $lte: today } }, { status: 'snoozed', snoozedUntil: { $lte: today } }],
    ...(opts.mine ? { assignedTo: ctx.memberId } : {}),
    ...(opts.clientId ? { clientId: new Types.ObjectId(opts.clientId) } : {}),
  }
  const rows = await ctx.db(FolioFollowup).find(filter).sort({ dueOn: 1 }).limit(200).lean()
  const invoiceIds = rows.map((r) => r.invoiceId).filter((id): id is Types.ObjectId => Boolean(id))
  const [names, invoices, people, open] = await Promise.all([
    clientNameMap(ctx, [...new Set(rows.map((r) => String(r.clientId)))]),
    ctx.db(Invoice).find({ _id: { $in: invoiceIds } }, { number: 1, balancePaise: 1, entityId: 1 }).lean(),
    memberNames(ctx, rows.map((r) => r.assignedTo).filter((id): id is Types.ObjectId => Boolean(id))),
    listOutstanding(ctx, undefined, today, opts.entityId),
  ])
  const inv = new Map(invoices.map((i) => [String(i._id), i]))
  const clientOwed = open.reduce((m, r) => m.set(r.clientId, (m.get(r.clientId) ?? 0) + r.balancePaise), new Map<string, number>())
  // One firm: follow-ups on its invoices, and whole-account ones for clients that owe it money.
  const forFirm = (r: (typeof rows)[number]) => {
    if (!opts.entityId) return true
    const i = r.invoiceId ? inv.get(String(r.invoiceId)) : undefined
    return i ? String(i.entityId) === opts.entityId : !r.invoiceId && clientOwed.has(String(r.clientId))
  }
  return rows
    .filter(forFirm)
    .map((r) => {
      const due = r.status === 'snoozed' && r.snoozedUntil ? r.snoozedUntil : r.dueOn
      const i = r.invoiceId ? inv.get(String(r.invoiceId)) : undefined
      return {
        id: String(r._id),
        clientId: String(r.clientId),
        clientName: names.get(String(r.clientId)) ?? 'Unknown client',
        subject: r.subject ?? null,
        notes: r.notes ?? null,
        invoiceId: r.invoiceId ? String(r.invoiceId) : null,
        invoiceNumber: i?.number ?? null,
        effectiveDue: due,
        daysLate: Math.max(0, daysBetween(due, today)),
        snoozed: r.status === 'snoozed',
        channel: r.channel ?? 'call',
        balancePaise: i ? (i.balancePaise ?? 0) : (clientOwed.get(String(r.clientId)) ?? 0),
        assigneeName: r.assignedTo ? (people.get(String(r.assignedTo)) ?? null) : null,
      }
    })
    .sort((a, b) => b.daysLate - a.daysLate)
}

async function overdue(ctx: Ctx, today: string, clientId?: string, entityId?: string | null): Promise<{ rows: OverdueRow[]; aging: AgingSummary }> {
  const open = await listOutstanding(ctx, clientId, today, entityId)
  const late = collectionPriority(open.filter((r) => r.daysOverdue > 0), today)
  const ids = late.map((r) => new Types.ObjectId(r.invoiceId))
  const [last, followups] = await Promise.all([
    ctx.db(FolioMessage).aggregate<{ _id: Types.ObjectId; at: Date }>([
      { $match: { kind: 'reminder', invoiceId: { $in: ids }, status: { $in: ['sent', 'logged'] } } },
      { $group: { _id: '$invoiceId', at: { $max: { $ifNull: ['$sentAt', '$createdAt'] } } } },
    ]),
    ctx.db(FolioFollowup).distinct('invoiceId', { invoiceId: { $in: ids }, status: { $in: ['open', 'snoozed'] } }),
  ])
  const lastAt = new Map(last.map((l) => [String(l._id), l.at]))
  const withFollowup = new Set((followups as unknown[]).map(String))
  return {
    rows: late.map((r) => ({ ...r, lastReminderAt: lastAt.get(r.invoiceId)?.toISOString() ?? null, hasOpenFollowup: withFollowup.has(r.invoiceId) })),
    aging: summariseAging(open, today),
  }
}

async function queuedWhatsApp(ctx: Ctx, entityId?: string | null): Promise<QueuedWhatsApp[]> {
  const rows = await ctx.db(FolioMessage).find({ channel: 'whatsapp', status: 'queued' }).sort({ createdAt: 1 }).limit(100).lean()
  const [names, invoices] = await Promise.all([
    clientNameMap(ctx, [...new Set(rows.map((r) => String(r.clientId)))]),
    ctx.db(Invoice).find({ _id: { $in: rows.map((r) => r.invoiceId).filter((id): id is Types.ObjectId => Boolean(id)) } }, { number: 1, entityId: 1, status: 1, balancePaise: 1 }).lean(),
  ])
  const numbers = new Map(invoices.map((i) => [String(i._id), i.number ?? null]))
  const firmOf = new Map(invoices.map((i) => [String(i._id), String(i.entityId)]))
  // A reminder queued before the invoice was paid (online, or a receipt recorded since) is not shown to send.
  const settled = new Set(invoices.filter((i) => !isRemindable(i)).map((i) => String(i._id)))
  return rows.filter((r) => !(r.invoiceId && settled.has(String(r.invoiceId)))).filter((r) => !entityId || (r.invoiceId && firmOf.get(String(r.invoiceId)) === entityId)).map((r) => ({
    id: String(r._id),
    invoiceId: r.invoiceId ? String(r.invoiceId) : null,
    invoiceNumber: r.invoiceId ? (numbers.get(String(r.invoiceId)) ?? null) : null,
    clientName: names.get(String(r.clientId)) ?? 'Unknown client',
    toAddress: r.toAddress ?? '',
    body: r.body ?? '',
    link: whatsappLink(r.toAddress, r.body ?? ''),
  }))
}

export type FollowupOptions = { clients: { id: string; name: string }[]; invoices: { id: string; clientId: string; number: string }[]; members: { id: string; name: string }[]; today: string; me: string }

export async function followupOptions(ctx: Ctx): Promise<FollowupOptions> {
  const [clients, invoices, members] = await Promise.all([
    ctx.db(Client).find({ status: { $ne: 'lead' } }, { name: 1, displayName: 1 }).sort({ name: 1 }).limit(1000).lean(),
    ctx.db(Invoice).find({ status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 } }, { number: 1, clientId: 1 }).sort({ dueDate: 1 }).limit(500).lean(),
    folioMembers(ctx),
  ])
  return {
    clients: clients.map((c) => ({ id: String(c._id), name: clientLabel(c) })),
    invoices: invoices.map((i) => ({ id: String(i._id), clientId: String(i.clientId), number: i.number ?? 'Invoice' })),
    members,
    today: todayIST(),
    me: String(ctx.memberId),
  }
}

/** The collections page; `entityId` narrows invoices, follow-ups and queued messages to one firm. */
export async function collectionsPage(ctx: Ctx, opts: { mine: boolean; clientId?: string; entityId?: string | null }) {
  const today = todayIST()
  const clientId = opts.clientId && Types.ObjectId.isValid(opts.clientId) ? opts.clientId : undefined
  const [q, o, whatsapp, dueToday] = await Promise.all([
    queue(ctx, today, { mine: opts.mine, clientId, entityId: opts.entityId }),
    overdue(ctx, today, clientId, opts.entityId),
    queuedWhatsApp(ctx, opts.entityId),
    ctx.db(FolioFollowup).countDocuments({ $or: [{ status: 'open', dueOn: { $lte: today } }, { status: 'snoozed', snoozedUntil: { $lte: today } }] }),
  ])
  return { today, queue: q, overdue: o.rows, aging: o.aging, whatsapp, dueToday }
}
