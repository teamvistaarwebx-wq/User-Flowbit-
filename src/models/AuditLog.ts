import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const AuditLogSchema = new Schema(
  {
    ...tenantFields,
    /** The acting User (null for system jobs). */
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorMemberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    /** Snapshots at write time: they survive renames and role changes. */
    actorName: { type: String },
    actorRole: { type: String },
    /** Verb in dotted form, e.g. 'invoice.issued', 'member.role_changed'. */
    action: { type: String, required: true },
    /** Entity type, e.g. 'Invoice', 'Member'. */
    entity: { type: String, required: true },
    entityId: { type: String },
    summary: { type: String, required: true },
    product: { type: String },
    /** { before?, after?, reason?, ... } — before/after hold only changed keys (see diff() in lib/audit-diff). */
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    /** Written by Flowbit staff from /platform (actorName 'Flowbit support'). */
    platform: { type: Boolean, default: false },
  },
  { timestamps: true },
)
AuditLogSchema.plugin(tenant)
AuditLogSchema.index({ orgId: 1, createdAt: -1 })
AuditLogSchema.index({ orgId: 1, action: 1, createdAt: -1 })
AuditLogSchema.index({ orgId: 1, actorId: 1, createdAt: -1 })
AuditLogSchema.index({ orgId: 1, entity: 1, entityId: 1, createdAt: -1 })

export const AuditLog = defineModel('AuditLog', AuditLogSchema)
