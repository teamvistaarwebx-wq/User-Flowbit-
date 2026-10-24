import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { onceAsync } from '@/lib/once'
import { Invoice } from '@/models/folio/Invoice'
import { Activity } from '@/models/orbit/Activity'
import { clientHealth, latest, type ClientHealth } from './health'
import { clientColumns } from './columns'

/**
 * Per-client signals behind health, the overdue column and "last activity", for a set of clients or the
 * whole workspace. Each source is one grouped aggregate (no per-client lookups).
 */

export type ClientSignal = { overduePaise: number; oldestOverdueDue: string | null; lastActivityAt: Date | null; lastInvoiceOn: string | null }
export type SignalMap = Map<string, ClientSignal>
type Scope = Types.ObjectId[] | 'all'

const inScope = (ids: Scope) => (ids === 'all' ? {} : { clientId: { $in: ids } })
const EMPTY: ClientSignal = { overduePaise: 0, oldestOverdueDue: null, lastActivityAt: null, lastInvoiceOn: null }

type InvoiceAgg = { _id: Types.ObjectId; overdue: number; oldestDue: string | null; lastIssued: string | null }

async function invoiceSignals(ctx: Ctx, ids: Scope, today: string): Promise<InvoiceAgg[]> {
  return ctx.db(Invoice).aggregate<InvoiceAgg>([
    { $match: { ...inScope(ids), status: { $in: ['issued', 'part_paid', 'paid'] } } },
    {
      $group: {
        _id: '$clientId',
        overdue: { $sum: { $cond: [{ $and: [{ $in: ['$status', ['issued', 'part_paid']] }, { $lt: ['$dueDate', today] }] }, '$balancePaise', 0] } },
        oldestDue: { $min: { $cond: [{ $and: [{ $in: ['$status', ['issued', 'part_paid']] }, { $lt: ['$dueDate', today] }, { $gt: ['$balancePaise', 0] }] }, '$dueDate', null] } },
        lastIssued: { $max: '$issueDate' },
      },
    },
  ])
}

async function activitySignals(ctx: Ctx, ids: Scope): Promise<{ _id: Types.ObjectId; at: Date }[]> {
  return ctx.db(Activity).aggregate<{ _id: Types.ObjectId; at: Date }>([{ $match: { clientId: ids === 'all' ? { $ne: null } : { $in: ids }, status: 'done' } }, { $group: { _id: '$clientId', at: { $max: '$occurredAt' } } }])
}

/** Overdue balance, oldest overdue due date, last Orbit activity and last invoice per client. */
export async function clientSignals(ctx: Ctx, ids: Scope, today: string): Promise<SignalMap> {
  if (ids !== 'all' && !ids.length) return new Map()
  const cols = clientColumns(ctx)
  const [invoices, activities] = await Promise.all([cols.folio ? invoiceSignals(ctx, ids, today) : [], cols.orbit ? activitySignals(ctx, ids) : []])
  const out = new Map<string, ClientSignal>()
  for (const r of invoices) out.set(String(r._id), { ...EMPTY, overduePaise: r.overdue, oldestOverdueDue: r.oldestDue, lastInvoiceOn: r.lastIssued })
  for (const a of activities) out.set(String(a._id), { ...(out.get(String(a._id)) ?? EMPTY), lastActivityAt: a.at })
  return out
}

/** The client's latest touch: Orbit activity, an issued invoice or an edit to the record. */
export const lastTouch = (signal: ClientSignal | undefined, updatedAt: Date | null | undefined) => latest(signal?.lastActivityAt, signal?.lastInvoiceOn, updatedAt)

/** Health for a current client, null for leads and inactive clients. */
export function healthOf(client: { status?: string | null; updatedAt?: Date | null }, signal: ClientSignal | undefined, today: string): ClientHealth | null {
  if (client.status !== 'active') return null
  return clientHealth({ overduePaise: signal?.overduePaise ?? 0, oldestOverdueDue: signal?.oldestOverdueDue ?? null, lastTouchAt: lastTouch(signal, client.updatedAt), today })
}

/** The whole workspace's signals, loaded at most once per page render (the list's health filter and the dashboard share it). */
export type AllSignals = () => Promise<SignalMap>
export const allSignalsOnce = (ctx: Ctx, today: string): AllSignals => onceAsync(() => clientSignals(ctx, 'all', today))
