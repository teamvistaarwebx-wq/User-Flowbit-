import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { milestoneIssues } from '@/modules/folio/recurring/plan-math'
import { MILESTONE_STATUSES, PLAN_STATUSES } from '@/modules/folio/types'
import { isoDate, paise, percent } from './_fields'

/**
 * A fixed-value engagement billed in phases (BillingOS "Project"). Named a
 * billing plan so it does not clash with Work's Project; optionally linked to one.
 */

const MilestoneSchema = new Schema(
  {
    position: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    percentOfTotal: { type: Number, default: null, min: 0, max: 100 },
    amountPaise: { type: Number, default: null, validate: { validator: (v: unknown) => v == null || Number.isInteger(v), message: 'Amounts are whole paise' } },
    dueOn: isoDate(),
    status: { type: String, enum: MILESTONE_STATUSES, default: 'pending' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    completedOn: isoDate(),
  },
  { _id: true },
)

const BillingPlanSchema = new Schema(
  {
    ...tenantFields,
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    workProjectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    code: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    hsnSac: { type: String, trim: true },
    totalValuePaise: paise({ required: true }),
    gstRatePercent: percent(18),
    startDate: isoDate(),
    targetEndDate: isoDate(),
    status: { type: String, enum: PLAN_STATUSES, default: 'active' },
    milestones: { type: [MilestoneSchema], default: [] },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
BillingPlanSchema.plugin(tenant)
BillingPlanSchema.index({ orgId: 1, code: 1 }, { unique: true })
BillingPlanSchema.index({ orgId: 1, clientId: 1 })

BillingPlanSchema.pre('validate', function coherentPlan() {
  if (!(this.totalValuePaise > 0)) throw new Error('A billing plan needs a value above zero.')
  const issue = milestoneIssues(this.totalValuePaise, this.milestones)
  if (issue) throw new Error(issue)
})

export const FolioBillingPlan = defineModel('FolioBillingPlan', BillingPlanSchema)
