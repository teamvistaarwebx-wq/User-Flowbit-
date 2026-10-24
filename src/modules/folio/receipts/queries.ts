import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import type { ListParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { clientLabel, clientNameMap, listEntities, OPEN_INVOICE, profileSummaries, type EntityInfo } from '@/modules/folio/queries/common'
import { allocatedPaise, tdsWithheldPaise, RECEIPT_MODES, RECEIPT_STATUSES } from './rules'

const isId = (v: string | undefined): v is string => Boolean(v && Types.ObjectId.isValid(v))

function receiptFilter(p: ListParams, clientIdsForQ: Types.ObjectId[]): Record<string, unknown> {
  const and: Record<string, unknown>[] = []
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i')
    and.push({ $or: [{ number: rx }, { reference: rx }, { clientId: { $in: clientIdsForQ } }] })
  }
  if (isId(p.get('client'))) and.push({ clientId: new Types.ObjectId(p.get('client')) })
  if (isId(p.get('entity'))) and.push({ entityId: new Types.ObjectId(p.get('entity')) })
  const mode = p.get('mode')
  if (mode && (RECEIPT_MODES as readonly string[]).includes(mode)) and.push({ mode })
  const status = p.get('status')
  if (status && (RECEIPT_STATUSES as readonly string[]).includes(status)) and.push({ status })
  if (p.get('unallocated') === '1') and.push({ status: 'recorded', $expr: { $gt: ['$amountPaise', { $sum: '$allocations.amountPaise' }] } })
  const from = p.get('from')
  const to = p.get('to')
  if (from || to) and.push({ receivedOn: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } })
  return and.length ? { $and: and } : {}
}

export type ReceiptListRow = {
  id: string
  number: string
  status: string
  clientId: string
  clientName: string
  entityCode: string
  receivedOn: string
  mode: string
  reference: string | null
  amountPaise: number
  unappliedPaise: number
}

export async function listReceipts(ctx: Ctx, p: ListParams) {
  const qClients = p.q ? await ctx.db(Client).find({ name: new RegExp(escapeRegex(p.q), 'i') }, { _id: 1 }).limit(50).lean() : []
  const filter = receiptFilter(p, qClients.map((c) => c._id))
  const [docs, total, sums, entities] = await Promise.all([
    ctx.db(FolioReceipt).find(filter).sort({ receivedOn: -1, seq: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(FolioReceipt).countDocuments(filter),
    ctx.db(FolioReceipt).aggregate<{ received: number; unapplied: number }>([
      { $match: { $and: [filter, { status: 'recorded' }] } },
      { $project: { amountPaise: 1, left: { $max: [0, { $subtract: ['$amountPaise', { $sum: '$allocations.amountPaise' }] }] } } },
      { $group: { _id: null, received: { $sum: '$amountPaise' }, unapplied: { $sum: '$left' } } },
    ]),
    listEntities(ctx),
  ])
  const names = await clientNameMap(ctx, [...new Set(docs.map((d) => String(d.clientId)))])
  const codes = new Map(entities.map((e) => [e.id, e.code]))
  const rows: ReceiptListRow[] = docs.map((d) => ({
    id: String(d._id),
    number: d.number,
    status: d.status ?? 'recorded',
    clientId: String(d.clientId),
    clientName: names.get(String(d.clientId)) ?? 'Unknown client',
    entityCode: codes.get(String(d.entityId)) ?? '',
    receivedOn: d.receivedOn,
    mode: d.mode ?? 'other',
    reference: d.reference ?? null,
    amountPaise: d.amountPaise,
    unappliedPaise: d.status === 'recorded' ? d.amountPaise - allocatedPaise(d.allocations ?? []) : 0,
  }))
  return { rows, total, receivedPaise: sums[0]?.received ?? 0, unappliedPaise: sums[0]?.unapplied ?? 0, entities }
}

export type OpenInvoiceOption = {
  invoiceId: string
  number: string
  clientId: string
  entityId: string
  issueDate: string
  dueDate: string
  owedPaise: number
  /** Expected TDS still to come: tdsPaise − tdsReceivedPaise. */
  tdsLeftPaise: number
}

const openInvoiceProjection = { number: 1, clientId: 1, entityId: 1, issueDate: 1, dueDate: 1, balancePaise: 1, tdsPaise: 1, tdsReceivedPaise: 1 } as const

async function openInvoices(ctx: Ctx, filter: Record<string, unknown> = {}): Promise<OpenInvoiceOption[]> {
  const rows = await ctx.db(Invoice).find({ ...OPEN_INVOICE, ...filter }, openInvoiceProjection).sort({ dueDate: 1, issueDate: 1 }).limit(500).lean()
  return rows.map((r) => ({
    invoiceId: String(r._id),
    number: r.number ?? 'Invoice',
    clientId: String(r.clientId),
    entityId: String(r.entityId),
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    owedPaise: r.balancePaise ?? 0,
    tdsLeftPaise: Math.max(0, (r.tdsPaise ?? 0) - (r.tdsReceivedPaise ?? 0)),
  }))
}

export type ReceiptFormOptions = {
  today: string
  clients: { id: string; name: string; defaultEntityId: string | null; tdsOn: boolean }[]
  entities: Pick<EntityInfo, 'id' | 'code' | 'legalName' | 'tradeName' | 'banks' | 'isDefault'>[]
  invoices: OpenInvoiceOption[]
}

/** Everything the record-payment form needs, in one payload (bank numbers masked). */
export async function receiptFormOptions(ctx: Ctx): Promise<ReceiptFormOptions> {
  const [clients, entities, invoices, profiles] = await Promise.all([
    ctx.db(Client).find({ status: { $ne: 'lead' } }, { name: 1, displayName: 1 }).sort({ name: 1 }).limit(1000).lean(),
    listEntities(ctx),
    openInvoices(ctx),
    profileSummaries(ctx),
  ])
  return {
    today: todayIST(),
    clients: clients.map((c) => {
      const p = profiles.get(String(c._id))
      return { id: String(c._id), name: clientLabel(c), defaultEntityId: p?.defaultEntityId ?? null, tdsOn: Boolean(p?.tds.on) }
    }),
    entities: entities.filter((e) => e.isActive).map(({ id, code, legalName, tradeName, banks, isDefault }) => ({ id, code, legalName, tradeName, banks, isDefault })),
    invoices,
  }
}

export async function receiptDetail(ctx: Ctx, id: string) {
  if (!Types.ObjectId.isValid(id)) return null
  const receipt = await ctx.db(FolioReceipt).findById(id).lean()
  if (!receipt) return null
  const [client, entities, linked] = await Promise.all([
    ctx.db(Client).findById(receipt.clientId, { name: 1, displayName: 1 }).lean(),
    listEntities(ctx),
    ctx.db(Invoice).find({ _id: { $in: receipt.allocations.map((a) => a.invoiceId) } }, { number: 1, issueDate: 1, totalPaise: 1, status: 1 }).lean(),
  ])
  const entity = entities.find((e) => e.id === String(receipt.entityId)) ?? null
  const byId = new Map(linked.map((i) => [String(i._id), i]))
  const applied = allocatedPaise(receipt.allocations)
  const recorded = receipt.status === 'recorded'
  const options = recorded && receipt.amountPaise - applied > 0 ? await openInvoices(ctx, { clientId: receipt.clientId, entityId: receipt.entityId }) : []
  return {
    id: String(receipt._id),
    number: receipt.number,
    status: receipt.status ?? 'recorded',
    receivedOn: receipt.receivedOn,
    amountPaise: receipt.amountPaise,
    appliedPaise: applied,
    unappliedPaise: recorded ? receipt.amountPaise - applied : 0,
    tdsPaise: tdsWithheldPaise(receipt.allocations),
    mode: receipt.mode ?? 'other',
    reference: receipt.reference ?? null,
    instrumentDate: receipt.instrumentDate ?? null,
    notes: receipt.notes ?? null,
    bouncedOn: receipt.bouncedOn ?? null,
    bounceReason: receipt.bounceReason ?? null,
    cancelReason: receipt.cancelReason ?? null,
    client: { id: String(receipt.clientId), name: client ? clientLabel(client) : 'Unknown client' },
    entity: entity ? { code: entity.code, name: entity.tradeName || entity.legalName } : null,
    bank: entity?.banks.find((b) => b.id === String(receipt.bankAccountId ?? '')) ?? null,
    allocations: receipt.allocations.map((a) => {
      const inv = byId.get(String(a.invoiceId))
      return { id: String(a._id), invoiceId: String(a.invoiceId), number: inv?.number ?? 'Invoice', issueDate: inv?.issueDate ?? null, totalPaise: inv?.totalPaise ?? 0, amountPaise: a.amountPaise ?? 0, tdsPaise: a.tdsPaise ?? 0, allocatedOn: a.allocatedOn }
    }),
    applyOptions: options,
  }
}

export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof receiptDetail>>>
