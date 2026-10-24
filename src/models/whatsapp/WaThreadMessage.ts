import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** One message in a workspace inbox thread, either way (template sends also stay in Message). */
const WaThreadMessageSchema = new Schema(
  {
    ...tenantFields,
    threadId: { type: Schema.Types.ObjectId, ref: 'WaThread', required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    text: { type: String, required: true },
    providerId: { type: String },
    status: { type: String, enum: ['received', 'sent', 'delivered', 'read', 'failed'], required: true },
    error: { type: String },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    memberName: { type: String },
    /** A template sent from the thread (the 24-hour window was closed). */
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    at: { type: Date, required: true },
  },
  { timestamps: true },
)
WaThreadMessageSchema.plugin(tenant)
WaThreadMessageSchema.index({ orgId: 1, threadId: 1, at: 1 })
WaThreadMessageSchema.index({ orgId: 1, providerId: 1 }, { sparse: true })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
WaThreadMessageSchema.index({ at: 1 })

export const WaThreadMessage = defineModel('WaThreadMessage', WaThreadMessageSchema)
