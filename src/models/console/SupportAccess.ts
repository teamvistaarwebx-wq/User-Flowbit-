import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { SUPPORT_MODES } from '@/lib/console/support-access'

/**
 * A staff request to see a workspace (console spec 8): the owner approves or
 * denies it in Settings → Support access; approved access is time-limited
 * (lib/console/support-access) and shows as a banner while it runs.
 */
const SupportAccessSchema = new Schema(
  {
    ...tenantFields,
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    staffName: { type: String, required: true },
    staffRole: { type: String, required: true },
    mode: { type: String, enum: SUPPORT_MODES, default: 'read' },
    reason: { type: String, required: true, maxlength: 300 },
    hours: { type: Number, required: true },
    status: { type: String, enum: ['requested', 'approved', 'denied', 'revoked'], default: 'requested' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    approvedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
)
SupportAccessSchema.plugin(tenant)
SupportAccessSchema.index({ orgId: 1, status: 1, expiresAt: -1 })

export const SupportAccess = defineModel('SupportAccess', SupportAccessSchema)
