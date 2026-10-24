import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { mongoose } from '@/lib/db'

/**
 * Folio documents that reference a deal (`dealId` on quotes and invoices).
 * Read straight from Folio's collections, always with this org's id, so Orbit
 * does not depend on Folio's model files.
 */
export type FolioLink = { id: string; kind: 'quote' | 'invoice'; label: string; number: string | null; status: string; totalPaise: number; href: string }

type Raw = { _id: unknown; number?: unknown; status?: unknown; totalPaise?: unknown }

async function read(ctx: Ctx, collection: string, filter: Record<string, unknown>, strict = false): Promise<Raw[]> {
  const db = mongoose.connection.db
  if (!db) {
    if (strict) throw new Error('[orbit] database not connected')
    return []
  }
  try {
    return (await db.collection(collection).find({ ...filter, orgId: ctx.orgId }, { projection: { number: 1, status: 1, totalPaise: 1 } }).sort({ createdAt: -1 }).limit(20).toArray()) as Raw[]
  } catch (error) {
    console.error(`[orbit] reading ${collection} failed`, error)
    if (strict) throw error
    return []
  }
}

const toLink = (kind: FolioLink['kind']) => (r: Raw): FolioLink => {
  const number = typeof r.number === 'string' && r.number ? r.number : null
  const noun = kind === 'quote' ? 'Quote' : 'Invoice'
  return { id: String(r._id), kind, number, label: number ? `${noun} ${number}` : `Draft ${noun.toLowerCase()}`, status: String(r.status ?? 'draft'), totalPaise: Number(r.totalPaise ?? 0), href: `/app/folio/${kind}s/${r._id}` }
}

/**
 * Quotes and live invoices on a deal. `strict` is for the delete guard: it reads even when Folio is off the plan
 * and lets a failed read throw, so a lookup error never reads as "no invoices" and lets the deal be deleted.
 */
export async function folioLinksForDeal(ctx: Ctx, dealId: Types.ObjectId, opts: { strict?: boolean } = {}): Promise<FolioLink[]> {
  const strict = Boolean(opts.strict)
  if (!strict && !ctx.has('folio')) return []
  const [quotes, invoices] = await Promise.all([read(ctx, 'quotes', { dealId }, strict), read(ctx, 'invoices', { dealId, status: { $ne: 'void' } }, strict)])
  return [...invoices.map(toLink('invoice')), ...quotes.map(toLink('quote'))]
}

/** Invoice totals per client (for the clients list): outstanding balance of issued / part-paid invoices. */
export async function outstandingByClient(ctx: Ctx, clientIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const db = mongoose.connection.db
  if (!db || !clientIds.length || !ctx.has('folio')) return new Map()
  try {
    const rows = await db
      .collection('invoices')
      .aggregate<{ _id: unknown; n: number }>([{ $match: { orgId: ctx.orgId, clientId: { $in: clientIds }, status: { $in: ['issued', 'part_paid'] } } }, { $group: { _id: '$clientId', n: { $sum: '$balancePaise' } } }])
      .toArray()
    return new Map(rows.map((r) => [String(r._id), r.n]))
  } catch (error) {
    console.error('[orbit] reading invoice balances failed', error)
    return new Map()
  }
}

/** How many Folio documents reference a client (delete guard). */
export async function folioCountForClient(ctx: Ctx, clientId: Types.ObjectId): Promise<{ invoices: number; quotes: number; receipts: number }> {
  const db = mongoose.connection.db
  if (!db) return { invoices: 0, quotes: 0, receipts: 0 }
  const count = (name: string) => db.collection(name).countDocuments({ orgId: ctx.orgId, clientId })
  const [invoices, quotes, receipts] = await Promise.all([count('invoices'), count('quotes'), count('receipts')])
  return { invoices, quotes, receipts }
}

/** Outstanding and overdue balance for one client (issued / part-paid invoices). */
export async function clientBalances(ctx: Ctx, clientId: Types.ObjectId, today: string): Promise<{ outstandingPaise: number; overduePaise: number }> {
  const db = mongoose.connection.db
  if (!db || !ctx.has('folio')) return { outstandingPaise: 0, overduePaise: 0 }
  const rows = await db.collection('invoices').find({ orgId: ctx.orgId, clientId, status: { $in: ['issued', 'part_paid'] } }, { projection: { balancePaise: 1, dueDate: 1 } }).toArray()
  return rows.reduce(
    (acc, r) => {
      const balance = Number(r.balancePaise ?? 0)
      return { outstandingPaise: acc.outstandingPaise + balance, overduePaise: acc.overduePaise + (typeof r.dueDate === 'string' && r.dueDate < today ? balance : 0) }
    },
    { outstandingPaise: 0, overduePaise: 0 },
  )
}
