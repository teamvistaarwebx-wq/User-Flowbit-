import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const FOLLOWUP_CHANNELS = ['email', 'whatsapp', 'call', 'meeting', 'note'] as const
export const FOLLOWUP_STATUSES = ['open', 'done', 'snoozed', 'cancelled'] as const

const ISO_DATE: [RegExp, string] = [/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20']

/** A human chase task against a client (optionally one invoice). folio.md 5.10. */
const FollowupSchema = new Schema(
  {
    ...tenantFields,
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    dueOn: { type: String, required: true, match: ISO_DATE },
    channel: { type: String, enum: FOLLOWUP_CHANNELS, default: 'call' },
    subject: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: FOLLOWUP_STATUSES, default: 'open' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Member' },
    outcome: { type: String, trim: true },
    promisedOn: { type: String, match: ISO_DATE },
    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    snoozedUntil: { type: String, match: ISO_DATE },
    cancelReason: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
FollowupSchema.plugin(tenant)
FollowupSchema.index({ orgId: 1, status: 1, dueOn: 1 })
FollowupSchema.index({ orgId: 1, clientId: 1, dueOn: -1 })
FollowupSchema.index({ orgId: 1, invoiceId: 1 })
FollowupSchema.index({ orgId: 1, assignedTo: 1, status: 1, dueOn: 1 })

FollowupSchema.pre('validate', function () {
  if (this.status === 'done' && !this.completedAt) this.invalidate('completedAt', 'A closed follow-up needs a completion time.')
  if (this.status === 'snoozed' && !this.snoozedUntil) this.invalidate('snoozedUntil', 'A snoozed follow-up needs a date to come back on.')
})

export const FolioFollowup = defineModel('FolioFollowup', FollowupSchema)
