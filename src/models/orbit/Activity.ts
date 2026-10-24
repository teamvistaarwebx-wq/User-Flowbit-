import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, CHANNELS } from '@/modules/orbit/constants'

const ActivitySchema = new Schema(
  {
    ...tenantFields,
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    contactId: { type: Schema.Types.ObjectId, default: null },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    status: { type: String, enum: ACTIVITY_STATUSES, required: true },
    channel: { type: String, enum: CHANNELS, default: 'other' },
    title: { type: String, default: '' },
    notes: { type: String, default: '' },
    occurredAt: { type: Date, default: null },
    /** 'YYYY-MM-DD' (planned). */
    dueDate: { type: String, default: null },
    /** 'HH:mm' (planned, optional). */
    dueTime: { type: String, default: null },
    meetingLink: { type: String, default: null },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    /** Sent by a follow-up sequence, not by a person: reported apart from outreach. */
    automated: { type: Boolean, default: false },
  },
  { timestamps: true },
)
ActivitySchema.plugin(tenant)
ActivitySchema.index({ orgId: 1, leadId: 1, occurredAt: -1 })
ActivitySchema.index({ orgId: 1, dealId: 1, occurredAt: -1 })
ActivitySchema.index({ orgId: 1, clientId: 1, occurredAt: -1 })
ActivitySchema.index({ orgId: 1, contactId: 1 })
ActivitySchema.index({ orgId: 1, status: 1, dueDate: 1, assigneeId: 1 })
ActivitySchema.index({ orgId: 1, status: 1, type: 1, occurredAt: -1 })
ActivitySchema.index({ orgId: 1, createdBy: 1, occurredAt: -1 })

export const Activity = defineModel('Activity', ActivitySchema)
