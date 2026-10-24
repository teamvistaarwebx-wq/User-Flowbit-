import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * In-Console alert for Sales (console spec 8): a workspace hit a limit or
 * clicked Upgrade. Goes to the assigned salesperson, or to every Sales and
 * Admin member when nobody is assigned. One per workspace, kind and day.
 */
const StaffAlertSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    /** Sales: limit_hit, upgrade_clicked. Accounts (billing step): payment_flagged, payment_part, offline_submitted. Inbox: whatsapp_inbound. */
    kind: { type: String, enum: ['limit_hit', 'upgrade_clicked', 'payment_flagged', 'payment_part', 'offline_submitted', 'whatsapp_inbound'], required: true },
    title: { type: String, required: true },
    /** 'kind:orgId:YYYY-MM-DD' */
    dedupeKey: { type: String, required: true, unique: true },
    readAt: { type: Date },
  },
  { timestamps: true },
)
StaffAlertSchema.index({ staffId: 1, readAt: 1, createdAt: -1 })
StaffAlertSchema.index({ orgId: 1, createdAt: -1 })

export const StaffAlert = defineModel('StaffAlert', StaffAlertSchema)
