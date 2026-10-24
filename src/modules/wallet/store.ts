import 'server-only'
import { Types, type ClientSession } from 'mongoose'
import { dbConnect, withTransaction } from '@/lib/db'
import { scoped } from '@/lib/db/scoped'
import { Wallet } from '@/models/wallet/Wallet'
import { WalletLedger } from '@/models/wallet/WalletLedger'
import type { DebitRequest, StoreDebit, WalletStore } from './charge'
import { applyDebit, dayKey, EMPTY_WALLET, monthKey, type WalletState } from './rules'

/**
 * The MongoDB side of the wallet. A debit is one guarded update (the filter
 * checks the balance and the caps, an update pipeline takes promo first), in
 * the same transaction as its ledger row, whose key is unique per workspace:
 * concurrent sends cannot overdraw, and a repeated key cannot charge twice.
 */

const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id)
const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/** The workspace's wallet, created empty on first use. */
export async function ensureWallet(orgId: Types.ObjectId | string, session?: ClientSession) {
  await dbConnect()
  const id = oid(orgId)
  const doc = await Wallet.findOneAndUpdate({ orgId: id }, { $setOnInsert: { orgId: id } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session }).lean()
  return doc!
}

type WalletDoc = Awaited<ReturnType<typeof ensureWallet>>

export function stateOf(doc: Partial<WalletDoc> | null | undefined): WalletState {
  if (!doc) return EMPTY_WALLET
  return {
    paidPaise: doc.paidPaise ?? 0,
    promoPaise: doc.promoPaise ?? 0,
    spent: { day: doc.spent?.day ?? null, dayPaise: doc.spent?.dayPaise ?? 0, month: doc.spent?.month ?? null, monthPaise: doc.spent?.monthPaise ?? 0 },
    caps: { dailyPaise: doc.caps?.dailyPaise ?? 0, monthlyPaise: doc.caps?.monthlyPaise ?? 0 },
    free: { month: doc.free?.month ?? null, used: doc.free?.used ?? 0 },
  }
}

// ---------------------------------------------------------------------------
// The guarded debit (the same rule as rules.applyDebit, in one update)
// ---------------------------------------------------------------------------

const lit = (value: string) => ({ $literal: value })

/** Filter + update pipeline for one debit of `cost` paise at `now`. Exported for the smoke test. */
export function debitUpdate(orgId: Types.ObjectId, cost: number, now: Date) {
  const day = dayKey(now)
  const month = monthKey(now)
  const dayPaise = { $cond: [{ $eq: ['$spent.day', lit(day)] }, { $ifNull: ['$spent.dayPaise', 0] }, 0] }
  const monthPaise = { $cond: [{ $eq: ['$spent.month', lit(month)] }, { $ifNull: ['$spent.monthPaise', 0] }, 0] }
  const dailyCap = { $ifNull: ['$caps.dailyPaise', 0] }
  const monthlyCap = { $ifNull: ['$caps.monthlyPaise', 0] }
  const filter = {
    orgId,
    $expr: {
      $and: [
        { $gte: [{ $add: [{ $ifNull: ['$paidPaise', 0] }, { $ifNull: ['$promoPaise', 0] }] }, cost] },
        { $or: [{ $lte: [dailyCap, 0] }, { $lte: [{ $add: [dayPaise, cost] }, dailyCap] }] },
        { $or: [{ $lte: [monthlyCap, 0] }, { $lte: [{ $add: [monthPaise, cost] }, monthlyCap] }] },
      ],
    },
  }
  const take = { $min: [{ $ifNull: ['$promoPaise', 0] }, cost] }
  const pipeline = [
    {
      $set: {
        promoPaise: { $subtract: [{ $ifNull: ['$promoPaise', 0] }, take] },
        paidPaise: { $subtract: [{ $ifNull: ['$paidPaise', 0] }, { $subtract: [cost, take] }] },
        spent: { day: lit(day), dayPaise: { $add: [dayPaise, cost] }, month: lit(month), monthPaise: { $add: [monthPaise, cost] } },
        updatedAt: '$$NOW',
      },
    },
  ]
  return { filter, pipeline }
}

async function debitOnce(request: DebitRequest, session: ClientSession): Promise<StoreDebit> {
  const orgId = oid(request.orgId)
  const ledger = scoped(WalletLedger, orgId)
  const existing = await ledger.findOne({ key: request.key }, { promoPaise: 1, paidPaise: 1 }).session(session).lean()
  if (existing) return { ok: true, ledgerId: String(existing._id), fromPromo: existing.promoPaise ?? 0, fromPaid: existing.paidPaise ?? 0, balanceBefore: 0, balanceAfter: 0, duplicate: true }
  await ensureWallet(orgId, session)
  const { filter, pipeline } = debitUpdate(orgId, request.costPaise, request.now)
  const before = await Wallet.collection.findOneAndUpdate(filter, pipeline, { session, returnDocument: 'before' })
  if (!before) {
    const current = await Wallet.findOne({ orgId }).session(session).lean()
    const refusal = applyDebit(stateOf(current), request.costPaise, request.now)
    return { ok: false, reason: refusal.ok ? 'insufficient' : refusal.reason }
  }
  const applied = applyDebit(stateOf(before as unknown as WalletDoc), request.costPaise, request.now)
  if (!applied.ok) throw new Error('The wallet changed between the guard and the split; retrying.')
  const row = await ledger.create(
    { type: 'debit', amountPaise: request.costPaise, promoPaise: applied.fromPromo, paidPaise: applied.fromPaid, key: request.key, messageId: request.messageId ? oid(request.messageId) : undefined, category: request.category, note: request.note, at: request.now },
    { session },
  )
  const balanceBefore = (before.paidPaise as number) + (before.promoPaise as number)
  return { ok: true, ledgerId: String(row._id), fromPromo: applied.fromPromo, fromPaid: applied.fromPaid, balanceBefore, balanceAfter: balanceBefore - request.costPaise, duplicate: false }
}

async function refundOnce(input: { orgId: string; debitKey: string; now: Date; note?: string }, session: ClientSession): Promise<'refunded' | 'none' | 'duplicate'> {
  const orgId = oid(input.orgId)
  const ledger = scoped(WalletLedger, orgId)
  const debit = await ledger.findOne({ key: input.debitKey, type: 'debit' }).session(session).lean()
  if (!debit) return 'none'
  const key = `refund:${String(debit._id)}`
  if (await ledger.findOne({ key }, { _id: 1 }).session(session).lean()) return 'duplicate'
  const promo = debit.promoPaise ?? 0
  const paid = debit.paidPaise ?? 0
  const total = promo + paid
  const debitDay = dayKey(debit.at)
  const debitMonth = monthKey(debit.at)
  await Wallet.collection.updateOne(
    { orgId },
    [
      {
        $set: {
          promoPaise: { $add: [{ $ifNull: ['$promoPaise', 0] }, promo] },
          paidPaise: { $add: [{ $ifNull: ['$paidPaise', 0] }, paid] },
          'spent.dayPaise': { $cond: [{ $eq: ['$spent.day', lit(debitDay)] }, { $max: [0, { $subtract: ['$spent.dayPaise', total] }] }, '$spent.dayPaise'] },
          'spent.monthPaise': { $cond: [{ $eq: ['$spent.month', lit(debitMonth)] }, { $max: [0, { $subtract: ['$spent.monthPaise', total] }] }, '$spent.monthPaise'] },
          updatedAt: '$$NOW',
        },
      },
    ],
    { session },
  )
  await ledger.create({ type: 'refund', amountPaise: total, promoPaise: promo, paidPaise: paid, key, refundOf: debit._id, messageId: debit.messageId ?? undefined, category: debit.category ?? undefined, note: input.note ?? 'The message was not sent, so it was not charged', at: input.now }, { session })
  return 'refunded'
}

async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>, onDuplicate: () => T): Promise<T> {
  try {
    return await withTransaction(fn)
  } catch (error) {
    if (isDuplicateKey(error)) return onDuplicate()
    throw error
  }
}

export const mongoWalletStore: WalletStore = {
  debit: (request) =>
    inTransaction(
      (session) => debitOnce(request, session),
      () => ({ ok: true, ledgerId: '', fromPromo: 0, fromPaid: 0, balanceBefore: 0, balanceAfter: 0, duplicate: true }),
    ),

  async useFree(input) {
    const orgId = oid(input.orgId)
    const month = monthKey(input.now)
    return inTransaction(async (session) => {
      const ledger = scoped(WalletLedger, orgId)
      if (await ledger.findOne({ key: input.key }, { _id: 1 }).session(session).lean()) return true
      await ensureWallet(orgId, session)
      const used = { $cond: [{ $eq: ['$free.month', lit(month)] }, { $ifNull: ['$free.used', 0] }, 0] }
      const before = await Wallet.collection.findOneAndUpdate(
        { orgId, $expr: { $lt: [used, input.allowance] } },
        [{ $set: { free: { month: lit(month), used: { $add: [used, 1] } }, updatedAt: '$$NOW' } }],
        { session, returnDocument: 'before' },
      )
      if (!before) return false
      await ledger.create({ type: 'free', amountPaise: 0, key: input.key, messageId: input.messageId ? oid(input.messageId) : undefined, note: 'From the plan’s free messages this month', at: input.now }, { session })
      return true
    }, () => true)
  },

  refund: (input) => inTransaction((session) => refundOnce(input, session), () => 'duplicate' as const),

  async returnFree(input) {
    const orgId = oid(input.orgId)
    const month = monthKey(input.now)
    return inTransaction(async (session) => {
      const ledger = scoped(WalletLedger, orgId)
      const row = await ledger.findOne({ key: input.freeKey, type: 'free' }).session(session).lean()
      if (!row || monthKey(row.at) !== month) return false
      await ledger.create({ type: 'refund', amountPaise: 0, key: `refund:${String(row._id)}`, refundOf: row._id, messageId: row.messageId ?? undefined, note: 'The free message was not sent; it is back in this month’s allowance', at: input.now }, { session })
      await Wallet.updateOne({ orgId, 'free.month': month, 'free.used': { $gt: 0 } }, { $inc: { 'free.used': -1 } }, { session })
      return true
    }, () => false)
  },
}
