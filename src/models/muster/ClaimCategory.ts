import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const ClaimCategorySchema = new Schema(
  {
    ...tenantFields,
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    /** Paise; null = no ceiling. Enforced when a claim is submitted. */
    maxAmount: { type: Number, default: null },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)
ClaimCategorySchema.plugin(tenant)
ClaimCategorySchema.index({ orgId: 1, code: 1 }, { unique: true })

export const ClaimCategory = defineModel('ClaimCategory', ClaimCategorySchema)
