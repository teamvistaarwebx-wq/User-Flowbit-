import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const DesignationSchema = new Schema(
  {
    ...tenantFields,
    title: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    deletedAt: Date,
  },
  { timestamps: true },
)
DesignationSchema.plugin(tenant)
DesignationSchema.index({ orgId: 1, title: 1 }, { unique: true })

export const Designation = defineModel('Designation', DesignationSchema)
