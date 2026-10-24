import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant } from '@/lib/db/tenant'
import { COMPLIANCE_ITEMS, FILER_TYPES } from '@/modules/compliance/rules'

/**
 * A workspace's compliance calendar settings (Settings → Compliance
 * calendar): GST filer type, state, which items apply, the professional tax
 * day, and overrides when the government extends a date.
 */
const ComplianceSettingsSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true },
    filerType: { type: String, enum: FILER_TYPES, default: 'monthly' },
    state: { type: String, default: '' },
    items: { type: [{ type: String, enum: COMPLIANCE_ITEMS }], default: undefined },
    ptDay: { type: Number, min: 0, max: 31, default: null },
    overrides: {
      type: [new Schema({ item: { type: String, enum: COMPLIANCE_ITEMS, required: true }, period: { type: String, required: true }, dueDate: { type: String, required: true }, note: String }, { _id: false })],
      default: [],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
ComplianceSettingsSchema.plugin(tenant)

export const ComplianceSettings = defineModel('ComplianceSettings', ComplianceSettingsSchema)
