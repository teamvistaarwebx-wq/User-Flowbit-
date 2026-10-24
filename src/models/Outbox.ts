import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

const OutboxSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', index: true },
    to: { type: [String], required: true },
    cc: { type: [String], default: undefined },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String },
    attachments: [{ filename: String, mime: String, size: Number, fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' }, _id: false }],
    /** 'outbox' = no provider configured (stored only). */
    provider: { type: String, enum: ['resend', 'outbox'], default: 'outbox' },
    status: { type: String, enum: ['queued', 'sent', 'failed', 'logged'], default: 'logged' },
    /** Resend message id. */
    providerId: { type: String },
    error: { type: String },
    /** invite, password_reset, security, subscription, subscription_invoice, invoice, quote, statement, payslip, letter, claim_otp, reminder, contact, other. */
    kind: { type: String, default: 'other' },
    entity: { type: String },
    entityId: { type: String },
    /** Set once the row is copied into Message (the Messages log). The Outbox is read-only legacy now. */
    migratedAt: { type: Date },
  },
  { timestamps: true },
)
OutboxSchema.index({ orgId: 1, createdAt: -1 })
OutboxSchema.index({ orgId: 1, kind: 1, createdAt: -1 })
OutboxSchema.index({ migratedAt: 1 })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
OutboxSchema.index({ createdAt: 1 })

export const Outbox = defineModel('Outbox', OutboxSchema)
