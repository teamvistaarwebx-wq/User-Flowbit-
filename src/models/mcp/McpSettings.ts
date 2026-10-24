import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** The workspace's switch for AI apps (MCP). No row means on. */
const McpSettingsSchema = new Schema(
  {
    ...tenantFields,
    enabled: { type: Boolean, default: true },
    updatedByName: { type: String },
  },
  { timestamps: true },
)
McpSettingsSchema.plugin(tenant)

export const McpSettings = defineModel('McpSettings', McpSettingsSchema)
