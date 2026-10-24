import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const BANK_TXN_STATUSES = ['unmatched', 'matching', 'matched', 'expense', 'ignored'] as const
export type BankTxnStatus = (typeof BANK_TXN_STATUSES)[number]

const ISO_DATE: [RegExp, string] = [/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20']

/**
 * One bank statement row (Folio → Bank). `rowHash` is unique per workspace,
 * so importing an overlapping statement skips rows already in. A credit
 * becomes a receipt (matched), a debit an expense; the rest wait in the
 * reconciliation queue or are ignored (own-account transfers).
 */
const BankTxnSchema = new Schema(
  {
    ...tenantFields,
    statementId: { type: Schema.Types.ObjectId, ref: 'BankStatement', required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    bankAccountId: { type: Schema.Types.ObjectId, default: null },
    line: { type: Number },
    date: { type: String, required: true, match: ISO_DATE },
    narration: { type: String, default: '', maxlength: 500 },
    reference: { type: String, default: '', maxlength: 80 },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amountPaise: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'Amounts are whole paise' } },
    balancePaise: { type: Number, default: null },
    rowHash: { type: String, required: true },
    status: { type: String, enum: BANK_TXN_STATUSES, default: 'unmatched' },
    receiptId: { type: Schema.Types.ObjectId, ref: 'FolioReceipt', default: null },
    expenseId: { type: Schema.Types.ObjectId, ref: 'FolioExpense', default: null },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    /** Every invoice a split deposit was allocated to (the first is also `invoiceId`). */
    invoiceIds: { type: [Schema.Types.ObjectId], ref: 'Invoice', default: undefined },
    /** While `matching`: who holds the row (random per claim) and since when; a claim older than 5 minutes is released (modules/folio/bank/service). */
    claimToken: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    /** The score of the match the person confirmed (0–100), for the audit trail. */
    matchScore: { type: Number, default: null },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
BankTxnSchema.plugin(tenant)
BankTxnSchema.index({ orgId: 1, rowHash: 1 }, { unique: true })
BankTxnSchema.index({ orgId: 1, status: 1, date: -1 })
BankTxnSchema.index({ orgId: 1, statementId: 1 })

export const BankTxn = defineModel('BankTxn', BankTxnSchema)
