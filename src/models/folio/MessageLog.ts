import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const MESSAGE_KINDS = ['reminder', 'invoice', 'quote', 'statement'] as const
export const MESSAGE_CHANNELS = ['email', 'whatsapp'] as const
/**
 * sent = provider accepted; logged = no provider, stored in the Messages log only (or a
 * WhatsApp a person sent by hand); queued = WhatsApp composed for a person to
 * send; failed = provider error (retried next run); skipped = an older missed
 * offset suppressed by catch-up.
 */
export const MESSAGE_STATUSES = ['queued', 'sent', 'logged', 'failed', 'skipped'] as const

/** Everything Folio sent (or meant to send) to a client. folio.md 5.11. */
const MessageSchema = new Schema(
  {
    ...tenantFields,
    kind: { type: String, enum: MESSAGE_KINDS, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
    channel: { type: String, enum: MESSAGE_CHANNELS, required: true },
    status: { type: String, enum: MESSAGE_STATUSES, required: true },
    /** Days relative to the due date for automatic reminders; null when sent by hand. */
    offsetDays: { type: Number, default: null },
    toAddress: { type: String, default: '' },
    subject: { type: String },
    body: { type: String },
    /** The Message (Messages log) row; older rows point at the legacy Outbox. */
    outboxId: { type: Schema.Types.ObjectId, ref: 'Message' },
    error: { type: String },
    sentAt: { type: Date },
    sentBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
MessageSchema.plugin(tenant)
// One automatic reminder per invoice, channel and offset, ever: this is what makes the cron idempotent.
MessageSchema.index(
  { orgId: 1, invoiceId: 1, channel: 1, offsetDays: 1 },
  {
    unique: true,
    name: 'reminder_once_per_offset',
    partialFilterExpression: { kind: 'reminder', invoiceId: { $type: 'objectId' }, offsetDays: { $type: 'number' }, status: { $in: ['sent', 'logged', 'queued', 'skipped'] } },
  },
)
MessageSchema.index({ orgId: 1, invoiceId: 1, createdAt: -1 })
MessageSchema.index({ orgId: 1, clientId: 1, createdAt: -1 })
MessageSchema.index({ orgId: 1, status: 1, channel: 1 })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
MessageSchema.index({ createdAt: 1 })

export const FolioMessage = defineModel('FolioMessage', MessageSchema)
