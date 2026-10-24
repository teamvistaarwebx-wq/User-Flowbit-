import 'server-only'
import { Types } from 'mongoose'
import { todayIST } from '@/lib/dates'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { bucketFor, daysOverdue, type AgingBucket } from '@/modules/folio/engine/aging'
import { clientNameMap, entityMatch, OPEN_INVOICE, type FolioScope } from './common'

/**
 * Per-client balances and the outstanding list (folio.md 6.16). Reads the
 * denormalised `balancePaise` that settlement writes; never recomputes it.
 */

export type ClientBalance = {
  clientId: string
  clientName: string
  outstandingPaise: number
  overduePaise: number
  oldestDueDate: string | null
  openInvoices: number
  unappliedCreditPaise: number
  netReceivablePaise: number
}

const toId = (id: Types.ObjectId | string) => (typeof id === 'string' ? new Types.ObjectId(id) : id)

/** Σ (amount − applied cash) over recorded receipts, per client (only positive remainders); `entityId` narrows to one firm. */
export async function unappliedByClient(scope: FolioScope, clientId?: Types.ObjectId | string, entityId?: string | null): Promise<Map<string, number>> {
  const rows = await scope.db(FolioReceipt).aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { status: 'recorded', ...entityMatch(entityId), ...(clientId ? { clientId: toId(clientId) } : {}) } },
    { $project: { clientId: 1, left: { $subtract: ['$amountPaise', { $sum: '$allocations.amountPaise' }] } } },
    { $match: { left: { $gt: 0 } } },
    { $group: { _id: '$clientId', n: { $sum: '$left' } } },
  ])
  return new Map(rows.map((r) => [String(r._id), r.n]))
}

type OpenAgg = { _id: Types.ObjectId; outstanding: number; overdue: number; oldestDue: string | null; open: number }

async function openByClient(scope: FolioScope, today: string, clientId?: Types.ObjectId | string, entityId?: string | null): Promise<OpenAgg[]> {
  return scope.db(Invoice).aggregate<OpenAgg>([
    { $match: { ...OPEN_INVOICE, ...entityMatch(entityId), ...(clientId ? { clientId: toId(clientId) } : {}) } },
    {
      $group: {
        _id: '$clientId',
        outstanding: { $sum: '$balancePaise' },
        overdue: { $sum: { $cond: [{ $lt: ['$dueDate', today] }, '$balancePaise', 0] } },
        oldestDue: { $min: { $cond: [{ $lt: ['$dueDate', today] }, '$dueDate', null] } },
        open: { $sum: 1 },
      },
    },
  ])
}

function merge(open: OpenAgg[], unapplied: Map<string, number>, names: Map<string, string>): ClientBalance[] {
  const ids = new Set([...open.map((o) => String(o._id)), ...unapplied.keys()])
  const byId = new Map(open.map((o) => [String(o._id), o]))
  return [...ids].map((id) => {
    const o = byId.get(id)
    const credit = unapplied.get(id) ?? 0
    const outstanding = o?.outstanding ?? 0
    return {
      clientId: id,
      clientName: names.get(id) ?? 'Unknown client',
      outstandingPaise: outstanding,
      overduePaise: o?.overdue ?? 0,
      oldestDueDate: o?.oldestDue ?? null,
      openInvoices: o?.open ?? 0,
      unappliedCreditPaise: credit,
      netReceivablePaise: outstanding - credit,
    }
  })
}

/** Every client with an open balance or unapplied credit (with one firm's documents only, when `entityId` is set). */
export async function balancesByClient(scope: FolioScope, today: string = todayIST(), entityId?: string | null): Promise<ClientBalance[]> {
  const [open, unapplied] = await Promise.all([openByClient(scope, today, undefined, entityId), unappliedByClient(scope, undefined, entityId)])
  const names = await clientNameMap(scope, [...new Set([...open.map((o) => String(o._id)), ...unapplied.keys()])])
  return merge(open, unapplied, names)
}

/** One client's balance (queries only that client). */
export async function balanceForClient(scope: FolioScope, clientId: Types.ObjectId | string, today: string = todayIST()): Promise<ClientBalance> {
  const [open, unapplied, names] = await Promise.all([openByClient(scope, today, clientId), unappliedByClient(scope, clientId), clientNameMap(scope, [clientId])])
  return merge(open, unapplied, names)[0] ?? merge([], new Map([[String(clientId), 0]]), names)[0]
}

export type OutstandingRow = {
  invoiceId: string
  number: string
  clientId: string
  clientName: string
  entityId: string
  billingType: string
  issueDate: string
  dueDate: string
  totalPaise: number
  balancePaise: number
  daysOverdue: number
  bucket: AgingBucket
}

/** Open invoices with a balance, oldest due first (opening-balance rows included); `entityId` narrows to one firm. */
export async function listOutstanding(scope: FolioScope, clientId?: Types.ObjectId | string, today: string = todayIST(), entityId?: string | null): Promise<OutstandingRow[]> {
  const rows = await scope
    .db(Invoice)
    .find({ ...OPEN_INVOICE, ...entityMatch(entityId), ...(clientId ? { clientId: toId(clientId) } : {}) }, { number: 1, clientId: 1, entityId: 1, billingType: 1, issueDate: 1, dueDate: 1, totalPaise: 1, balancePaise: 1 })
    .sort({ dueDate: 1, issueDate: 1 })
    .lean()
  const names = await clientNameMap(scope, [...new Set(rows.map((r) => String(r.clientId)))])
  return rows.map((r) => {
    const days = daysOverdue(r.dueDate, today)
    return {
      invoiceId: String(r._id),
      number: r.number ?? 'Draft',
      clientId: String(r.clientId),
      clientName: names.get(String(r.clientId)) ?? 'Unknown client',
      entityId: String(r.entityId),
      billingType: r.billingType ?? 'one_time',
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      totalPaise: r.totalPaise ?? 0,
      balancePaise: r.balancePaise ?? 0,
      daysOverdue: days,
      bucket: bucketFor(days),
    }
  })
}
