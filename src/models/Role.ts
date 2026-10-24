import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const RoleSchema = new Schema(
  {
    ...tenantFields,
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    description: { type: String },
    permissions: { type: [String], default: [] },
    builtIn: { type: Boolean, default: false },
  },
  { timestamps: true },
)
RoleSchema.plugin(tenant)
RoleSchema.index({ orgId: 1, key: 1 }, { unique: true })

export const Role = defineModel('Role', RoleSchema)
