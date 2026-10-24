import 'server-only'
import { isValidObjectId, Types, type PipelineStage } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { toActivityItems } from './activity-items'
import { OPEN_LEAD_STAGES, PAGE_SIZE } from './constants'
import type { PeopleIndex } from './people'
import { activityAccess, dealAccess, leadAccess } from './scope'

export type ContactRow = { id: string; name: string; role: string; email: string; phone: string; primary: boolean; clientId: string; clientName: string; clientStatus: string; openDeals: number }

/** Contacts across clients (Client.contacts), searchable and paginated. */
export async function listClientContacts(ctx: Ctx, opts: { q: string; status: string | null; primaryOnly: boolean; page: number }) {
  const re = opts.q ? new RegExp(escapeRegex(opts.q), 'i') : null
  const match: Record<string, unknown>[] = []
  if (opts.status) match.push({ status: opts.status })
  const after: Record<string, unknown>[] = []
  if (re) after.push({ $or: [{ 'contacts.name': re }, { 'contacts.email': re }, { 'contacts.phone': re }, { name: re }] })
  if (opts.primaryOnly) after.push({ 'contacts.primary': true })
  const pipeline: PipelineStage[] = [
    ...(match.length ? [{ $match: { $and: match } }] : []),
    { $unwind: '$contacts' },
    ...(after.length ? [{ $match: { $and: after } }] : []),
    { $sort: { 'contacts.name': 1 } },
    { $facet: { rows: [{ $skip: (opts.page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE }], total: [{ $count: 'n' }] } },
  ]
  const [res] = await ctx.db(Client).aggregate<{ rows: { _id: Types.ObjectId; name: string; status: string; contacts: { _id: Types.ObjectId; name: string; role?: string; email?: string; phone?: string; primary?: boolean } }[]; total: { n: number }[] }>(pipeline)
  const rows = res?.rows ?? []
  const counts = rows.length
    ? await ctx.db(Deal).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ...dealAccess(ctx), status: 'open', contactId: { $in: rows.map((r) => r.contacts._id) } } }, { $group: { _id: '$contactId', n: { $sum: 1 } } }])
    : []
  const byContact = new Map(counts.map((c) => [String(c._id), c.n]))
  const out: ContactRow[] = rows.map((r) => ({
    id: String(r.contacts._id), name: r.contacts.name, role: r.contacts.role ?? '', email: r.contacts.email ?? '', phone: r.contacts.phone ?? '', primary: Boolean(r.contacts.primary),
    clientId: String(r._id), clientName: r.name, clientStatus: r.status, openDeals: byContact.get(String(r.contacts._id)) ?? 0,
  }))
  return { rows: out, total: res?.total[0]?.n ?? 0 }
}

/** Prospects: open leads in your scope with a contact name. */
export async function listProspects(ctx: Ctx, opts: { q: string; page: number }) {
  const re = opts.q ? new RegExp(escapeRegex(opts.q), 'i') : null
  const filter = { $and: [leadAccess(ctx), { stage: { $in: [...OPEN_LEAD_STAGES] }, contactName: { $nin: ['', null] } }, ...(re ? [{ $or: [{ contactName: re }, { companyName: re }, { email: re }, { phone: re }] }] : [])] }
  const [rows, total] = await Promise.all([
    ctx.db(Lead).find(filter, { contactName: 1, designation: 1, companyName: 1, email: 1, phone: 1, stage: 1, ownerId: 1 }).sort({ contactName: 1 }).skip((opts.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    ctx.db(Lead).countDocuments(filter),
  ])
  return { rows, total }
}

/** One contact (a Client.contacts entry) with its client, deals and activity. */
export async function contactDetail(ctx: Ctx, id: string, people: PeopleIndex) {
  if (!isValidObjectId(id)) return null
  const client = await ctx.db(Client).findOne({ 'contacts._id': id }).lean()
  const contact = client?.contacts.find((c) => String(c._id) === id)
  if (!client || !contact) return null
  const contactId = new Types.ObjectId(id)
  const [deals, activities] = await Promise.all([
    ctx.db(Deal).find({ ...dealAccess(ctx), contactId }).sort({ updatedAt: -1 }).lean(),
    ctx.db(Activity).find({ ...(await activityAccess(ctx)), contactId }).sort({ occurredAt: -1, dueDate: 1, _id: -1 }).limit(100).lean(),
  ])
  const items = await toActivityItems(ctx, activities, people)
  return { client, contact, deals, upcoming: items.filter((a) => a.status === 'planned'), log: items.filter((a) => a.status !== 'planned') }
}
