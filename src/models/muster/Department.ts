import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const DepartmentSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true },
    /** Uppercase short code, unique per org (PROD, DEV). */
    code: { type: String, required: true, trim: true, uppercase: true },
    isActive: { type: Boolean, default: true },
    deletedAt: Date,
  },
  { timestamps: true },
)
DepartmentSchema.plugin(tenant)
DepartmentSchema.index({ orgId: 1, code: 1 }, { unique: true })

export const Department = defineModel('Department', DepartmentSchema)
