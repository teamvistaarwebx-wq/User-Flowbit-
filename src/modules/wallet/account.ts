import 'server-only'
import { Types } from 'mongoose'
import { withTransaction } from '@/lib/db'
import { scoped } from '@/lib/db/scoped'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { Wallet } from '@/models/wallet/Wallet'
import { WalletLedger } from '@/models/wallet/WalletLedger'
import { consoleSettings } from '@/modules/console/settings-query'
import { ensureWallet, mongoWalletStore, stateOf } from './store'
import type { ChargeDeps } from './charge'
import { expiringPaise, type CreditLot, type WalletAlert } from './rules'

/**
 * Wallet changes other than a message charge: promo grants (Console Admin,
 * audited by the caller), spend caps and the auto top-up setting, the
 * low-balance alerts, and the daily expiry of paid credit.
 */

const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id)

export const MAX_PROMO_PAISE = 10_000_000

/** Free credit into the promo balance (no GST: nothing is paid for it). Returns the ledger id. */
export async function grantPromo(orgId: Types.ObjectId, input: { amountPaise: number; reason: string; staffId?: Types.ObjectId; staffName: string }): Promise<string> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > MAX_PROMO_PAISE) throw new Error('A promo grant is a positive whole number of paise up to ₹1,00,000.')
  return withTransaction(async (session) => {
    await ensureWallet(orgId, session)
    await Wallet.updateOne({ orgId }, { $inc: { promoPaise: input.amountPaise }, $set: { 'alerts.lowAt': null, 'alerts.zeroAt': null } }, { session })
    const row = await scoped(WalletLedger, orgId).create({ type: 'promo', amountPaise: input.amountPaise, promoPaise: input.amountPaise, key: `promo:${new Types.ObjectId().toHexString()}`, note: input.reason, byName: input.staffName, byStaffId: input.staffId, at: new Date() }, { session })
    return String(row._id)
  })
}

export type CapsInput = Readonly<{ dailyPaise: number; monthlyPaise: number }>

export async function setCaps(orgId: Types.ObjectId, caps: CapsInput): Promise<void> {
  await ensureWallet(orgId)
  await Wallet.updateOne({ orgId }, { $set: { 'caps.dailyPaise': caps.dailyPaise, 'caps.monthlyPaise': caps.monthlyPaise } })
}

export async function setAutoTopUp(orgId: Types.ObjectId, input: { enabled: boolean; belowPaise: number; packPaise: number }): Promise<void> {
  await ensureWallet(orgId)
  await Wallet.updateOne({ orgId }, { $set: { 'autoTopUp.enabled': input.enabled, 'autoTopUp.belowPaise': input.belowPaise, 'autoTopUp.packPaise': input.packPaise } })
}

const ALERT_TEXT: Readonly<Record<WalletAlert, { title: string; body: string }>> = {
  low: { title: 'WhatsApp wallet is running low', body: 'Recharge soon so invoices and reminders keep going out on WhatsApp.' },
  zero: { title: 'WhatsApp wallet is empty', body: 'WhatsApp messages now go by email where they can, or wait up to 24 hours. Recharge to send them.' },
}

/** Sends the low or empty alert once (until a recharge clears it) to everyone who manages billing. */
export async function sendWalletAlert(orgId: string, kind: WalletAlert): Promise<void> {
  const id = oid(orgId)
  const field = kind === 'low' ? 'alerts.lowAt' : 'alerts.zeroAt'
  const claimed = await Wallet.updateOne({ orgId: id, [field]: null }, { $set: { [field]: new Date() } })
  if (!claimed.modifiedCount) return
  const wallet = await Wallet.findOne({ orgId: id }, { paidPaise: 1, promoPaise: 1 }).lean()
  const balance = formatINR((wallet?.paidPaise ?? 0) + (wallet?.promoPaise ?? 0), { decimals: 2 })
  await notifyPermission({ orgId: id }, 'billing.manage', { title: ALERT_TEXT[kind].title, body: `${ALERT_TEXT[kind].body} Balance: ${balance}.`, href: '/app/settings/billing/wallet', kind: 'warning', event: 'subscription.wallet_low', includeSelf: true })
}

export const liveChargeDeps = (): ChargeDeps => ({ store: mongoWalletStore, alert: sendWalletAlert })

// ---------------------------------------------------------------------------
// Expiry of paid credit (run daily from /api/cron/billing)
// ---------------------------------------------------------------------------

const EXPIRY_BATCH = 500

async function expireLot(lot: { _id: Types.ObjectId; orgId: Types.ObjectId; amountPaise: number; at: Date; expiresAt?: Date | null }, now: Date): Promise<number> {
  return withTransaction(async (session) => {
    const ledger = scoped(WalletLedger, lot.orgId)
    const claimed = await WalletLedger.updateOne({ _id: lot._id, orgId: lot.orgId, expiredAt: null }, { $set: { expiredAt: now } }, { session })
    if (!claimed.modifiedCount) return 0
    const wallet = await ensureWallet(lot.orgId, session)
    const newer = await ledger.find({ type: 'recharge', expiredAt: null, at: { $gt: lot.at } }, { amountPaise: 1, at: 1, expiresAt: 1 }).session(session).lean()
    const asLot = (r: { _id: unknown; amountPaise: number; at: Date; expiresAt?: Date | null }): CreditLot => ({ id: String(r._id), creditPaise: r.amountPaise, at: r.at, expiresAt: r.expiresAt ?? r.at })
    const amount = Math.min(stateOf(wallet).paidPaise, expiringPaise(asLot(lot), stateOf(wallet).paidPaise, newer.map(asLot)))
    if (amount <= 0) return 0
    await Wallet.updateOne({ orgId: lot.orgId, paidPaise: { $gte: amount } }, { $inc: { paidPaise: -amount } }, { session })
    await ledger.create({ type: 'expiry', amountPaise: amount, paidPaise: amount, key: `expiry:${String(lot._id)}`, note: '12 months since this recharge: the unused paid credit expired', at: now }, { session })
    return amount
  })
}

export type ExpiryResult = { lots: number; expiredPaise: number }

/** Expires the unused part of every recharge bought 12 months ago, oldest first. Idempotent per lot. */
export async function runWalletExpiry(now: Date = new Date()): Promise<ExpiryResult> {
  const due = await WalletLedger.find({ type: 'recharge', expiredAt: null, expiresAt: { $lte: now } }, { orgId: 1, amountPaise: 1, at: 1, expiresAt: 1 }).sort({ at: 1 }).limit(EXPIRY_BATCH).lean()
  const result: ExpiryResult = { lots: 0, expiredPaise: 0 }
  for (const lot of due) {
    try {
      const amount = await expireLot(lot, now)
      result.lots += 1
      result.expiredPaise += amount
    } catch (error) {
      console.error('[wallet] expiry failed for lot', String(lot._id), error)
    }
  }
  return result
}

/** The settings a charge needs (Console rate card, BYO fee, free allowance). */
export async function walletSettings() {
  return (await consoleSettings()).wallet
}

/** A message that failed after it was charged (a WhatsApp "failed" tick): every charge of it goes back, once. */
export async function refundMessage(orgId: Types.ObjectId | string, messageId: Types.ObjectId | string, now: Date = new Date()): Promise<number> {
  const id = oid(orgId)
  const rows = await scoped(WalletLedger, id).find({ messageId: oid(messageId), type: { $in: ['debit', 'free'] } }, { type: 1, key: 1 }).lean()
  let refunded = 0
  for (const row of rows) {
    const done = row.type === 'debit' ? (await mongoWalletStore.refund({ orgId: String(id), debitKey: row.key, now, note: 'WhatsApp could not deliver it' })) === 'refunded' : await mongoWalletStore.returnFree({ orgId: String(id), freeKey: row.key, now })
    if (done) refunded += 1
  }
  return refunded
}
