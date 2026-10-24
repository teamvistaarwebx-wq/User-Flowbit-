import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A previewed set of changes from flowbit_plan_changes (docs/specs/mcp.md A2).
 * Nothing in Flowbit changes until flowbit_apply_plan runs it; it expires
 * after 30 minutes and only the connection that made it can apply it.
 */
const McpPlanSchema = new Schema(
  {
    ...tenantFields,
    planId: { type: String, required: true, unique: true },
    grantId: { type: Schema.Types.ObjectId, ref: 'OAuthGrant' },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    clientName: { type: String, required: true },
    source: { type: Schema.Types.Mixed },
    items: { type: [Schema.Types.Mixed], default: [] },
    expiresAt: { type: Date, required: true },
    appliedAt: { type: Date },
    batchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch' },
  },
  { timestamps: true },
)
McpPlanSchema.plugin(tenant)
McpPlanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 })

export const McpPlan = defineModel('McpPlan', McpPlanSchema)
