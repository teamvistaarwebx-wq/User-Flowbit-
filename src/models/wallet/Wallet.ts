import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant } from '@/lib/db/tenant'

/**
 * A workspace's WhatsApp wallet (one per workspace, modules/wallet). Integer
 * paise only. `promoPaise` is free credit (spent first, no GST); `paidPaise`
 * is recharged credit. Debits happen in one guarded update, never read-then-
 * write, so the balance cannot go below zero. Every change has a WalletLedger row.
 */
const WalletSchema = new Schema(
  {
    /** One per workspace. */
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true },
    paidPaise: { type: Number, default: 0, min: 0 },
    promoPaise: { type: Number, default: 0, min: 0 },
    /** Spend counted against the caps, per IST day ('YYYY-MM-DD') and month ('YYYY-MM'). */
    spent: { day: { type: String, default: null }, dayPaise: { type: Number, default: 0 }, month: { type: String, default: null }, monthPaise: { type: Number, default: 0 } },
    /** 0 = no cap. */
    caps: { dailyPaise: { type: Number, default: 0 }, monthlyPaise: { type: Number, default: 0 } },
    /** Free messages of the plan's allowance used this month. */
    free: { month: { type: String, default: null }, used: { type: Number, default: 0 } },
    /** Console Admin: free messages a month for this workspace instead of its plan's allowance (null = the plan's). */
    freeAllowanceOverride: { type: Number, default: null, min: 0 },
    /** Stored and shown only: a real auto-debit needs an autopay mandate (TODO, see modules/billing/autopay). */
    autoTopUp: { enabled: { type: Boolean, default: false }, belowPaise: { type: Number, default: 20_000 }, packPaise: { type: Number, default: 100_000 } },
    /** When the low-balance and empty alerts went out (cleared by a recharge). */
    alerts: { lowAt: { type: Date, default: null }, zeroAt: { type: Date, default: null } },
    lastRechargeAt: { type: Date },
  },
  { timestamps: true },
)
WalletSchema.plugin(tenant)

export const Wallet = defineModel('Wallet', WalletSchema)
