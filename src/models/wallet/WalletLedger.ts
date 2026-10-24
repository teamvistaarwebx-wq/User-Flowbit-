import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const LEDGER_TYPES = ['recharge', 'bonus', 'promo', 'debit', 'free', 'refund', 'expiry'] as const
export type LedgerType = (typeof LEDGER_TYPES)[number]

/**
 * The wallet's append-only ledger (notifications-v2 §2.3). Rows are never
 * edited, except a recharge lot being stamped `expiredAt` once its unspent
 * part has expired. `key` makes every write idempotent ('debit:<message>:<attempt>',
 * 'refund:<debit row>', 'recharge:<payment id>', 'expiry:<lot>').
 */
const WalletLedgerSchema = new Schema(
  {
    ...tenantFields,
    type: { type: String, enum: LEDGER_TYPES, required: true },
    /** Always positive; `type` says which way it moved. */
    amountPaise: { type: Number, required: true, min: 0 },
    /** The split between the two balances (debits, refunds). */
    promoPaise: { type: Number, default: 0 },
    paidPaise: { type: Number, default: 0 },
    key: { type: String, required: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    /** A refund names the debit row it reverses. */
    refundOf: { type: Schema.Types.ObjectId, ref: 'WalletLedger' },
    /** Recharges: the GST tax invoice and the Razorpay payment. */
    invoiceId: { type: Schema.Types.ObjectId, ref: 'SubscriptionInvoice' },
    paymentId: { type: String },
    /** Recharge lots: when the paid credit expires, and when the expiry job handled it. */
    expiresAt: { type: Date },
    expiredAt: { type: Date, default: null },
    category: { type: String },
    note: { type: String },
    /** Who did it: a member (recharge), Console staff (promo grants) or the system. */
    byName: { type: String },
    byStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, required: true },
  },
  { timestamps: true },
)
WalletLedgerSchema.plugin(tenant)
WalletLedgerSchema.index({ orgId: 1, key: 1 }, { unique: true })
WalletLedgerSchema.index({ orgId: 1, at: -1 })
WalletLedgerSchema.index({ orgId: 1, messageId: 1 }, { sparse: true })
WalletLedgerSchema.index({ type: 1, expiredAt: 1, expiresAt: 1 })

export const WalletLedger = defineModel('WalletLedger', WalletLedgerSchema)
