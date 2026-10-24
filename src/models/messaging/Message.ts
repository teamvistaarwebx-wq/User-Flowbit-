import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { CHANNELS } from '@/modules/messaging/events'
import { MESSAGE_STATUSES, SKIP_REASONS } from '@/modules/messaging/types'

/**
 * Every message Flowbit sends or means to send, on any channel
 * (notifications-v2 §1.1). Replaces the Outbox: old rows are copied in with
 * `legacyOutboxId`. `orgId` is empty for mail outside a workspace (password
 * reset, signup code). The Messages log (Settings) reads this collection.
 */

const AttachmentSchema = new Schema(
  {
    filename: { type: String, required: true },
    mime: String,
    size: Number,
    /** StoredFile id when the file is also stored (download link, resend). */
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    /** The bytes, kept only until the message is sent so a retry can attach them again. */
    data: { type: Buffer, select: false },
  },
  { _id: false },
)

const TimelineSchema = new Schema({ at: { type: Date, required: true }, status: { type: String, required: true }, note: String }, { _id: false })

const MessageSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', index: true },
    channel: { type: String, enum: CHANNELS, required: true },
    /** Email addresses, E.164 numbers, or User ids for in-app. */
    to: { type: [String], required: true },
    cc: { type: [String], default: undefined },
    /** The member the message is for, when it is one (alerts, briefs). */
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    /** A client contact, for client messages (WhatsApp step). */
    contactId: { type: Schema.Types.ObjectId },
    /** 'task.assigned', 'brief', … */
    event: { type: String },
    /** Notification group (events.ts) for alert mail. */
    group: { type: String },
    /** Mail kind (lib/mail MailKind): invite, invoice, payslip, alert, digest, brief… */
    kind: { type: String, default: 'other' },
    /** The automation rule that sent it (run history and the per-contact daily cap). */
    automationId: { type: Schema.Types.ObjectId },
    entity: { type: String },
    entityId: { type: String },
    subject: { type: String },
    html: { type: String },
    text: { type: String },
    /** In-app rows and alert mails: where the message links to. */
    title: { type: String },
    body: { type: String },
    href: { type: String },
    /** WhatsApp (later): approved template name and its variables. */
    template: { type: String },
    params: { type: Schema.Types.Mixed },
    attachments: { type: [AttachmentSchema], default: [] },
    /** Extra mail headers (List-Unsubscribe). */
    headers: { type: Schema.Types.Mixed },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'queued', index: true },
    skipReason: { type: String, enum: Object.keys(SKIP_REASONS) },
    /** Essential mail ignores unsubscribe (security, payslips, documents sent by hand). */
    essential: { type: Boolean, default: true },
    /** False for single-shot mail (live codes) and callers that retry on their own. */
    retry: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 },
    /** When the pipeline tries next (queued retries, scheduled sends). */
    nextAttemptAt: { type: Date, default: null },
    scheduledFor: { type: Date },
    /** Batched alerts: the digest slot this item waits for, and the digest it went out in. */
    digestAt: { type: Date },
    digestId: { type: Schema.Types.ObjectId },
    fallback: { channel: { type: String, enum: CHANNELS }, to: { type: [String], default: undefined } },
    fallbackId: { type: Schema.Types.ObjectId },
    fallbackOf: { type: Schema.Types.ObjectId },
    /** WhatsApp: Flowbit's own number (A) or the workspace's own number (B, charged to its wallet). */
    sender: { type: String, enum: ['platform', 'workspace'] },
    /** 'resend', 'inapp', 'outbox' (no provider), 'interakt', 'interakt-byo'… */
    provider: { type: String },
    providerId: { type: String, index: true, sparse: true },
    error: { type: String },
    sentAt: { type: Date },
    /** WhatsApp B: what the workspace's wallet was charged, in paise (0 = free or in the BYO fee-free mode). */
    cost: { type: Number },
    /** SMS later: DLT registration (notifications-v2 §0b.10). */
    dlt: { entityId: String, header: String, templateId: String },
    /** Idempotency: one message per (user, key), e.g. one email per task reminder. */
    dedupeKey: { type: String },
    timeline: { type: [TimelineSchema], default: [] },
    legacyOutboxId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
)
MessageSchema.index({ orgId: 1, createdAt: -1 })
MessageSchema.index({ orgId: 1, channel: 1, status: 1, createdAt: -1 })
MessageSchema.index({ status: 1, nextAttemptAt: 1 })
MessageSchema.index({ status: 1, digestAt: 1 })
MessageSchema.index({ orgId: 1, userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } })
MessageSchema.index({ orgId: 1, automationId: 1, createdAt: -1 }, { partialFilterExpression: { automationId: { $type: 'objectId' } } })
MessageSchema.index({ legacyOutboxId: 1 }, { unique: true, partialFilterExpression: { legacyOutboxId: { $type: 'objectId' } } })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
MessageSchema.index({ createdAt: 1 })

export const Message = defineModel('Message', MessageSchema)
