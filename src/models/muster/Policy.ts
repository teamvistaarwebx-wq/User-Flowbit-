import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * Muster's per-workspace rules (one document per org). Office hours, the work
 * week, the late threshold and half-day hours live on Org (the check-in
 * widget reads them there). Read through `getPolicy(ctx)` for defaults.
 */
const MusterPolicySchema = new Schema(
  {
    // One policy per org: the unique index below replaces the plain orgId index.
    ...tenantFields,
    orgId: { ...tenantFields.orgId, index: false },
    attendance: {
      unmarkedPolicy: { type: String, enum: ['present', 'absent', 'pending'], default: 'present' },
      correctionWindowHours: { type: Number, default: 360, min: 1, max: 8760 },
      compOffValidDays: { type: Number, default: 90, min: 0, max: 365 },
    },
    leave: {
      leaveYearStartMonth: { type: Number, default: 4, min: 1, max: 12 },
      carryForwardPercent: { type: Number, default: 50, min: 0, max: 100 },
      allowNegativeBalance: { type: Boolean, default: false },
    },
    notice: {
      internDays: { type: Number, default: 7 },
      probationDays: { type: Number, default: 30 },
      confirmedDays: { type: Number, default: 90 },
    },
    /** HR letters: the company signatory id who signs each letter type by default ({ offer_letter: '<id>' }); missing = the profile's default. */
    letterSignatories: { type: Schema.Types.Mixed },
    /** Joining documents: which types are mandatory, and how complete a joiner must be before they can start. */
    onboarding: {
      mandatoryDocuments: { type: [String], default: undefined },
      thresholdPercent: { type: Number, min: 0, max: 100 },
    },
  },
  { timestamps: true },
)
MusterPolicySchema.plugin(tenant)
MusterPolicySchema.index({ orgId: 1 }, { unique: true })

export const MusterPolicy = defineModel('MusterPolicy', MusterPolicySchema)

/** A company policy document (handbook, leave policy PDF), shown to everyone on /app/me/documents. */
const PolicyDocumentSchema = new Schema(
  {
    ...tenantFields,
    title: { type: String, required: true, trim: true },
    category: String,
    description: String,
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true },
    fileName: String,
    sizeBytes: Number,
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedByName: String,
    archivedAt: Date,
    archivedReason: String,
  },
  { timestamps: true },
)
PolicyDocumentSchema.plugin(tenant)
PolicyDocumentSchema.index({ orgId: 1, archivedAt: 1 })

export const PolicyDocument = defineModel('PolicyDocument', PolicyDocumentSchema)
