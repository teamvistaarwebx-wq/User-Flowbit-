import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { RUN_STATUSES, STEP_STATUSES } from '@/modules/automations/run-status'

/**
 * One firing of an automation for one record: what it sent, skipped or
 * failed, and why (run history). `dedupeKey` makes a rule fire once per
 * record (per occurrence); test runs ("Test on me") have none.
 */
const StepSchema = new Schema(
  {
    action: { type: String, required: true },
    status: { type: String, enum: STEP_STATUSES, required: true },
    note: String,
    to: String,
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
  },
  { _id: false },
)

const AutomationRunSchema = new Schema(
  {
    ...tenantFields,
    automationId: { type: Schema.Types.ObjectId, ref: 'Automation', required: true },
    recipeKey: { type: String, default: null },
    dedupeKey: { type: String },
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    status: { type: String, enum: RUN_STATUSES, default: 'scheduled' },
    dueAt: { type: Date, required: true },
    vars: { type: Schema.Types.Mixed, default: {} },
    refs: { type: Schema.Types.Mixed, default: {} },
    steps: { type: [StepSchema], default: [] },
    note: String,
    test: { type: Boolean, default: false },
    testUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    finishedAt: Date,
  },
  { timestamps: true },
)
AutomationRunSchema.plugin(tenant)
AutomationRunSchema.index({ orgId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } })
AutomationRunSchema.index({ status: 1, dueAt: 1 })
AutomationRunSchema.index({ orgId: 1, automationId: 1, createdAt: -1 })
AutomationRunSchema.index({ orgId: 1, createdAt: -1 })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
AutomationRunSchema.index({ createdAt: 1 })

export const AutomationRun = defineModel('AutomationRun', AutomationRunSchema)
