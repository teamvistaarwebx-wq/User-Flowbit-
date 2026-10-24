import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * One row per Console action, naming the staff member (console spec 7.1).
 * Flowbit's own record: kept when a workspace is deleted. Actions on a
 * workspace also write a row into that workspace's AuditLog.
 */
const StaffAuditSchema = new Schema(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    staffName: { type: String, required: true },
    staffRole: { type: String, required: true },
    action: { type: String, required: true },
    summary: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Org' },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
StaffAuditSchema.index({ createdAt: -1 })
StaffAuditSchema.index({ staffId: 1, createdAt: -1 })
StaffAuditSchema.index({ orgId: 1, createdAt: -1 })

export const StaffAudit = defineModel('StaffAudit', StaffAuditSchema)
