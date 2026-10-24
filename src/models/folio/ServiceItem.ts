import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { paise, percent } from './_fields'

/** The service catalogue. Archived (isActive false), never deleted: past lines keep pointing at it. */
const ServiceItemSchema = new Schema(
  {
    ...tenantFields,
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    hsnSac: { type: String, trim: true },
    unit: { type: String, default: 'nos', trim: true },
    defaultRatePaise: paise(),
    defaultGstRatePercent: percent(18),
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)
ServiceItemSchema.plugin(tenant)
ServiceItemSchema.index({ orgId: 1, code: 1 }, { unique: true })
ServiceItemSchema.index({ orgId: 1, isActive: 1, name: 1 })

export const FolioServiceItem = defineModel('FolioServiceItem', ServiceItemSchema)
