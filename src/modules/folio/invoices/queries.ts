import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { parseListParams, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioFollowup } from '@/models/folio/Followup'
import { Invoice } from '@/models/folio/Invoice'
import { FolioMessage } from '@/models/folio/MessageLog'
import { FolioReceipt } from '@/models/folio/Receipt'
import { AGING_BUCKETS, type AgingBucket } from '@/modules/folio/engine/aging'
import { agingDueRange } from '@/modules/folio/queries/report-charts-math'
import { loadEntity, loadProfile } from '../context'
import { peekNumber } from '../counter'
import { PAGE_SIZE } from '../types'
import { issuableDate } from './lifecycle'
import { loadInvoice } from './service'

/** List and detail reads for invoices. Bank details never leave the server from here. */

const LIST_PROJECTION = { bank: 0, from: 0, lines: 0, billTo: 0 } as const

/** A URL id as an ObjectId (aggregate does not cast); an impossible id when malformed. */
export const urlId = (value: string): Types.ObjectId => (isValidObjectId(value) ? new Types.ObjectId(value) : new Types.ObjectId('000000000000000000000000'))

const isAgingBucket = (value: string | undefined | null): value is AgingBucket => Boolean(value) && (AGING_BUCKETS as readonly string[]).includes(value as string)

/** Mongo filter from the URL filters of the invoice list. */
async function listFilter(ctx: Ctx, p: ReturnType<typeof parseListParams>): Promise<Record<string, unknown>> {
  const today = todayIST()
  const filter: Record<string, unknown> = {}
  const status = p.get('status')
  if (status === 'written_off') filter.writtenOffPaise = { $gt: 0 }
  else if (status) filter.status = status
  if (p.get('type')) filter.documentType = p.get('type')
  const entity = p.get('entity')
  const client = p.get('client')
  if (entity) filter.entityId = urlId(entity)
  if (client) filter.clientId = urlId(client)
  else filter.billingType = { $ne: 'opening' }
  if (p.get('open') === '1' || p.get('overdue') === '1') Object.assign(filter, { status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 } })
  if (p.get('overdue') === '1') filter.dueDate = { $lt: today }
  const aging = p.get('aging')
  if (isAgingBucket(aging)) {
    // A bucket from the Reports aging chart: open invoices whose due date falls in its range.
    const { from: dueFrom, to: dueTo } = agingDueRange(aging, today)
    Object.assign(filter, { status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 }, dueDate: { ...(dueFrom ? { $gte: dueFrom } : {}), ...(dueTo ? { $lte: dueTo } : {}) } })
  }
  const from = p.get('from')
  const to = p.get('to')
  if (from || to) filter.issueDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
  if (p.q) {
    const re = new RegExp(escapeRegex(p.q), 'i')
    const clientIds = await ctx.db(Client).distinct('_id', { name: re })
    filter.$or = [{ number: re }, { subject: re }, { purchaseOrderRef: re }, { clientId: { $in: clientIds } }]
  }
  return filter
}

export async function listInvoices(ctx: Ctx, sp: SearchParams) {
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const filter = await listFilter(ctx, p)
  const [rows, total, sums, entities] = await Promise.all([
    ctx.db(Invoice).find(filter, LIST_PROJECTION).sort({ issueDate: -1, createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(Invoice).countDocuments(filter),
    ctx.db(Invoice).aggregate<{ billed: number; owed: number }>([{ $match: { $and: [filter, { status: { $nin: ['draft', 'void'] } }] } }, { $group: { _id: null, billed: { $sum: '$totalPaise' }, owed: { $sum: '$balancePaise' } } }]),
    ctx.db(FolioEntity).find({}, { code: 1 }).lean(),
  ])
  const clients = await ctx.db(Client).find({ _id: { $in: [...new Set(rows.map((r) => String(r.clientId)))] } }, { name: 1 }).lean()
  const clientName = new Map(clients.map((c) => [String(c._id), c.name]))
  const entityCode = new Map(entities.map((e) => [String(e._id), e.code]))
  return {
    p,
    total,
    billedPaise: sums[0]?.billed ?? 0,
    owedPaise: sums[0]?.owed ?? 0,
    multiEntity: entities.length > 1,
    entities: entities.map((e) => ({ value: String(e._id), label: e.code })),
    rows: rows.map((r) => ({ ...r, clientName: clientName.get(String(r.clientId)) ?? 'Unknown client', entityCode: entityCode.get(String(r.entityId)) ?? '' })),
  }
}

export type InvoiceListRow = Awaited<ReturnType<typeof listInvoices>>['rows'][number]

/** Payments applied to one invoice (recorded, bounced and cancelled receipts, with this invoice's row). */
async function paymentsFor(ctx: Ctx, invoiceId: Types.ObjectId) {
  const receipts = await ctx.db(FolioReceipt).find({ 'allocations.invoiceId': invoiceId }, { number: 1, receivedOn: 1, mode: 1, reference: 1, status: 1, allocations: 1 }).sort({ receivedOn: 1 }).lean()
  return receipts.map((r) => {
    const row = r.allocations.find((a) => String(a.invoiceId) === String(invoiceId))
    return { id: String(r._id), number: r.number, receivedOn: r.receivedOn, mode: r.mode, reference: r.reference ?? '', status: r.status, amountPaise: row?.amountPaise ?? 0, tdsPaise: row?.tdsPaise ?? 0 }
  })
}

export async function invoiceDetail(ctx: Ctx, id: string) {
  const invoice = await loadInvoice(ctx, id)
  const [client, entity, profile, payments, creditNotes, messages, followups] = await Promise.all([
    ctx.db(Client).findById(invoice.clientId).lean(),
    loadEntity(ctx, invoice.entityId),
    loadProfile(ctx, invoice.clientId),
    paymentsFor(ctx, invoice._id),
    ctx.db(CreditNote).find({ invoiceId: invoice._id }, { number: 1, noteDate: 1, reason: 1, reasonText: 1, totalPaise: 1, status: 1 }).sort({ noteDate: 1 }).lean(),
    ctx.db(FolioMessage).find({ invoiceId: invoice._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ctx.db(FolioFollowup).find({ invoiceId: invoice._id }).sort({ dueOn: -1 }).limit(20).lean(),
  ])
  const isDraft = invoice.status === 'draft'
  const [peek, issueDateDefault] = isDraft ? await Promise.all([peekNumber(ctx.orgId, entity, 'invoice', invoice.issueDate), issuableDate(ctx, invoice)]) : [null, invoice.issueDate]
  return { invoice, client, entity, profile, payments, creditNotes, messages, followups, peek, issueDateDefault }
}

/** Days overdue for an open invoice (0 when not overdue or settled). */
export function daysOverdue(invoice: { status: string; dueDate: string; balancePaise: number }, today = todayIST()): number {
  if (!['issued', 'part_paid'].includes(invoice.status) || invoice.balancePaise <= 0 || invoice.dueDate >= today) return 0
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${invoice.dueDate}T00:00:00Z`)) / 86_400_000)
}
