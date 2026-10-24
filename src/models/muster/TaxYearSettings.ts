import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A workspace's salary-tax calendar for one tax year: whether employees may
 * still change their regime and declarations, and the proof window
 * ('YYYY-MM-DD', inclusive) in which they upload investment proofs for HR.
 */
const TaxYearSettingsSchema = new Schema(
  {
    ...tenantFields,
    fy: { type: String, required: true },
    declarationsOpen: { type: Boolean, default: true },
    proofOpens: { type: String },
    proofCloses: { type: String },
    /** The TAN printed on Form 130 Part B and the 24Q export. */
    tan: { type: String, trim: true, uppercase: true },
    /** Who signs Form 130 (name, designation, place). */
    signatory: {
      type: new Schema({ name: { type: String, trim: true }, designation: { type: String, trim: true }, place: { type: String, trim: true } }, { _id: false }),
      default: undefined,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
TaxYearSettingsSchema.plugin(tenant)
TaxYearSettingsSchema.index({ orgId: 1, fy: 1 }, { unique: true })

export const TaxYearSettings = defineModel('TaxYearSettings', TaxYearSettingsSchema)
