import 'server-only'
import { Types } from 'mongoose'
import { daysBetween, formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Client } from '@/models/Client'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { clientLabel, entityLabel } from '@/modules/folio/context'
import { ensureDocLink } from '@/modules/doclinks/links'
import type { RunSubject } from '../types'
import { instantRange, isoRange, SCAN_LIMIT, type OrgScope, type Source } from './common'

/** Folio records for the money recipes: overdue invoices, quotes to chase, clients with dues. */

async function names(scope: OrgScope, clientIds: Types.ObjectId[], entityIds: Types.ObjectId[]) {
  const [clients, entities] = await Promise.all([
    scope.db(Client).find({ _id: { $in: clientIds } }, { name: 1, displayName: 1 }).lean(),
    scope.db(FolioEntity).find({ _id: { $in: entityIds } }, { legalName: 1, tradeName: 1 }).lean(),
  ])
  return {
    client: new Map(clients.map((c) => [String(c._id), clientLabel(c)])),
    entity: new Map(entities.map((e) => [String(e._id), entityLabel(e)])),
  }
}

export const invoiceDue: Source = async (scope, { window }) => {
  const range = isoRange(window)
  if (!range) return []
  const invoices = await scope.db(Invoice).find({ status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 }, billingType: { $ne: 'opening' }, dueDate: range }).limit(SCAN_LIMIT).lean()
  const n = await names(scope, invoices.map((i) => i.clientId), invoices.map((i) => i.entityId))
  const today = todayIST()
  const out: RunSubject[] = []
  for (const inv of invoices) {
    const link = await ensureDocLink(scope.orgId, { kind: 'invoice', docId: inv._id, clientId: inv.clientId })
    out.push({
      entity: 'Invoice',
      entityId: String(inv._id),
      vars: {
        client_name: n.client.get(String(inv.clientId)) ?? 'there',
        business_name: n.entity.get(String(inv.entityId)) ?? scope.orgName,
        invoice_number: inv.number ?? '',
        invoice_total: formatINR(inv.totalPaise),
        balance_due: formatINR(inv.balancePaise),
        balance_due_paise: inv.balancePaise,
        due_date: formatDate(inv.dueDate),
        days_overdue: Math.max(0, daysBetween(inv.dueDate, today)),
        document_link: link.url,
      },
      refs: { clientId: String(inv.clientId), invoiceId: String(inv._id), href: `/app/folio/invoices/${inv._id}` },
    })
  }
  return out
}

async function quoteSubjects(scope: OrgScope, filter: Record<string, unknown>): Promise<RunSubject[]> {
  const quotes = await scope.db(Quote).find(filter).limit(SCAN_LIMIT).lean()
  const n = await names(scope, quotes.map((q) => q.clientId), quotes.map((q) => q.entityId))
  const out: RunSubject[] = []
  for (const q of quotes) {
    const link = await ensureDocLink(scope.orgId, { kind: 'quote', docId: q._id, clientId: q.clientId })
    out.push({
      entity: 'Quote',
      entityId: String(q._id),
      vars: {
        client_name: n.client.get(String(q.clientId)) ?? 'there',
        business_name: n.entity.get(String(q.entityId)) ?? scope.orgName,
        quote_number: q.number,
        quote_total: formatINR(q.totalPaise),
        quote_status: q.status,
        valid_until: formatDate(q.validUntil),
        document_link: link.url,
      },
      refs: { clientId: String(q.clientId), href: `/app/folio/quotes/${q._id}` },
    })
  }
  return out
}

export const quoteSent: Source = async (scope, { window }) => {
  const range = instantRange(window)
  return range ? quoteSubjects(scope, { status: 'sent', sentAt: range }) : []
}

export const quoteValidUntil: Source = async (scope, { window }) => {
  const range = isoRange(window)
  // dateWindow never reaches before today for a "before" offset, so an expired quote is not reminded.
  return range ? quoteSubjects(scope, { status: 'sent', validUntil: range }) : []
}

export const clientsWithDues: Source = async (scope) => {
  const rows = await scope.db(Invoice).aggregate<{ _id: Types.ObjectId; due: number }>([
    { $match: { orgId: scope.orgId, status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 } } },
    { $group: { _id: '$clientId', due: { $sum: '$balancePaise' } } },
    { $limit: SCAN_LIMIT },
  ])
  const n = await names(scope, rows.map((r) => r._id), [])
  const out: RunSubject[] = []
  for (const r of rows) {
    const link = await ensureDocLink(scope.orgId, { kind: 'statement', docId: r._id, clientId: r._id })
    out.push({
      entity: 'Client',
      entityId: String(r._id),
      vars: { client_name: n.client.get(String(r._id)) ?? 'there', business_name: scope.orgName, total_due: formatINR(r.due), statement_link: link.url },
      refs: { clientId: String(r._id), href: `/app/folio/ledger/${r._id}` },
    })
  }
  return out
}
