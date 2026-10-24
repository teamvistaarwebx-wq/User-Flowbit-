import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { LEAD_STAGES } from '@/modules/orbit/constants'

export { LEAD_STAGES }

/** Denormalised earliest planned activity (modules/orbit/next-step.ts keeps it fresh). */
export const NextFollowUpSchema = new Schema(
  {
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    title: { type: String, default: '' },
    type: { type: String, default: 'follow_up' },
    dueDate: { type: String, required: true },
    dueTime: { type: String, default: null },
  },
  { _id: false },
)

export const ReasonSchema = new Schema({ code: { type: String, required: true }, note: { type: String, default: '' } }, { _id: false })

const LeadSchema = new Schema(
  {
    ...tenantFields,
    /** Part of the "Load sample agency" data (modules/activation/sample-data); "Remove sample data" deletes only these. */
    sample: { type: Boolean },
    companyName: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, default: '', trim: true },
    designation: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    instagramHandle: { type: String, default: '' },
    website: { type: String, default: '' },
    sector: { type: String, required: true },
    source: { type: String, required: true },
    stage: { type: String, enum: LEAD_STAGES, default: 'new', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    icpScore: { type: Number, min: 1, max: 5, default: null },
    valuePaise: { type: Number, min: 0, default: null },
    notes: { type: String, default: '' },
    closeReason: { type: ReasonSchema, default: null },
    meetingAt: { type: Date, default: null },
    // Server-only funnel timestamps (never accepted from input).
    contactedAt: { type: Date, default: null },
    engagedAt: { type: Date, default: null },
    meetingBookedAt: { type: Date, default: null },
    meetingDoneAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    stageChangedAt: { type: Date, default: () => new Date() },
    lastActivityAt: { type: Date, default: () => new Date() },
    nextFollowUp: { type: NextFollowUpSchema, default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    /** Captured leads (website form, webhook, IndiaMART, WhatsApp ad): free tags and the campaign that brought them. */
    sourceTags: { type: [String], default: [] },
    utm: { source: String, medium: String, campaign: String, term: String, content: String },
    /** The sender's own enquiry id; with `externalSource` it makes a repeated delivery the same lead. */
    externalSource: { type: String, default: null },
    externalId: { type: String, default: null },
  },
  { timestamps: true },
)
LeadSchema.plugin(tenant)
LeadSchema.index({ orgId: 1, stage: 1, updatedAt: -1 })
LeadSchema.index({ orgId: 1, ownerId: 1, stage: 1 })
LeadSchema.index({ orgId: 1, reviewerId: 1 })
LeadSchema.index({ orgId: 1, 'nextFollowUp.dueDate': 1 })
LeadSchema.index({ orgId: 1, createdAt: -1 })
LeadSchema.index({ orgId: 1, lastActivityAt: 1 })
LeadSchema.index({ orgId: 1, clientId: 1 })
LeadSchema.index({ orgId: 1, externalSource: 1, externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } })

export const Lead = defineModel('Lead', LeadSchema)
