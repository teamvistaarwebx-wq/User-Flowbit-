import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const NOTIFICATION_KINDS = ['info', 'assignment', 'mention', 'approval', 'reminder', 'success', 'warning', 'system'] as const

const NotificationSchema = new Schema(
  {
    ...tenantFields,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    body: { type: String },
    href: { type: String },
    kind: { type: String, enum: NOTIFICATION_KINDS, default: 'info' },
    product: { type: String },
    /** Fine-grained event, '<area>.<event>' (e.g. 'task.assigned', 'subscription.trial_ending'). */
    event: { type: String },
    /** Idempotency key: at most one notification per (org, user, dedupeKey), e.g. 'trial-3d'. */
    dedupeKey: { type: String },
    readAt: { type: Date },
  },
  { timestamps: true },
)
NotificationSchema.plugin(tenant)
NotificationSchema.index(
  { orgId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
)
NotificationSchema.index({ orgId: 1, userId: 1, createdAt: -1 })
NotificationSchema.index({ orgId: 1, userId: 1, readAt: 1 })

export const Notification = defineModel('Notification', NotificationSchema)
